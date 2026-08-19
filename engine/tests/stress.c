/* Random self-play stress test. Perft proves the move counts are right; this
   proves the surrounding machinery (undo, FEN, SAN, the search's move choice)
   never produces an illegal or corrupted state over long games. */
#include "../src/chess.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Search progress is irrelevant here; the frontend hook has to exist though. */
void search_report(const Position *pos, const SearchResult *r) {
    (void)pos;
    (void)r;
}

static int failures = 0;

static void fail(const char *what, const Position *pos) {
    char fen[128];
    pos_get_fen(pos, fen, sizeof(fen));
    printf("FAIL %s\n  fen: %s\n", what, fen);
    failures++;
}

static int positions_equal(const Position *a, const Position *b) {
    if (a->side != b->side || a->castling != b->castling || a->ep != b->ep) return 0;
    if (a->halfmove != b->halfmove || a->fullmove != b->fullmove || a->key != b->key) return 0;
    if (memcmp(a->board, b->board, sizeof(a->board)) != 0) return 0;
    if (memcmp(a->pieces, b->pieces, sizeof(a->pieces)) != 0) return 0;
    return memcmp(a->colors, b->colors, sizeof(a->colors)) == 0;
}

static uint64_t rng = 0xDEADBEEFCAFEBABEULL;
static uint64_t next_rand(void) {
    rng ^= rng >> 12;
    rng ^= rng << 25;
    rng ^= rng >> 27;
    return rng * 2685821657736338717ULL;
}

static void check_position(Position *pos) {
    if (pos->key != pos_compute_key(pos)) fail("incremental zobrist key drifted", pos);

    char fen[128];
    pos_get_fen(pos, fen, sizeof(fen));
    Position reparsed;
    if (!pos_set_fen(&reparsed, fen)) fail("own FEN was rejected on reparse", pos);
    else if (reparsed.key != pos->key) fail("FEN round-trip changed the position", pos);

    MoveList legal;
    gen_legal(pos, &legal);

    for (int i = 0; i < legal.count; i++) {
        Move m = legal.moves[i];

        if (!move_is_pseudo_legal(pos, m)) fail("legal move rejected by validator", pos);

        /* UCI and SAN must both round-trip back to the same move. */
        char uci[8];
        move_to_uci(m, uci);
        if (move_from_uci(pos, uci) != m && !(mv_promo(m) && mv_promo(m) != QUEEN))
            fail("UCI round-trip lost the move", pos);

        char san[12];
        move_to_san(pos, m, san);
        if (san[0] == '\0') fail("empty SAN", pos);

        Position before = *pos;
        Undo u;
        if (!pos_do_move(pos, m, &u)) {
            fail("generator produced an illegal move", pos);
            continue;
        }
        if (pos_in_check(pos, pos->side ^ 1)) fail("move left own king in check", pos);
        pos_undo_move(pos, m, &u);
        if (!positions_equal(pos, &before)) fail("undo did not restore the position", pos);
    }

    /* Garbage moves must be refused rather than corrupting anything. */
    for (int i = 0; i < 8; i++) {
        Move junk = (Move)(next_rand() & 0x1FFFF);
        if (!move_is_pseudo_legal(pos, junk)) continue;
        Position before = *pos;
        Undo u;
        if (pos_do_move(pos, junk, &u)) {
            pos_undo_move(pos, junk, &u);
            if (!positions_equal(pos, &before)) fail("undo of a random move corrupted state", pos);
        }
    }
}

int main(int argc, char **argv) {
    int games = argc >= 2 ? atoi(argv[1]) : 2000;
    game_init(8, 0xABCDEF0123456789ULL);

    int total_moves = 0, decisive = 0, draws = 0;

    for (int g = 0; g < games; g++) {
        game_new();
        Position *pos = game_position();

        for (int ply = 0; ply < 300; ply++) {
            if (game_result() != RESULT_NONE) break;

            check_position(pos);
            if (failures > 20) {
                printf("too many failures, stopping\n");
                return 1;
            }

            MoveList legal;
            gen_legal(pos, &legal);
            if (legal.count == 0) break;

            /* Mostly random play to reach weird positions, with occasional
               engine moves so the search is exercised too. */
            Move chosen;
            if (next_rand() % 16 == 0) {
                chosen = game_search(1);
                int ok = 0;
                for (int i = 0; i < legal.count; i++)
                    if (legal.moves[i] == chosen) ok = 1;
                if (!ok) {
                    fail("search returned an illegal move", pos);
                    chosen = legal.moves[0];
                }
            } else {
                chosen = legal.moves[next_rand() % (uint64_t)legal.count];
            }

            char uci[8];
            move_to_uci(chosen, uci);
            if (!game_play_uci(uci)) {
                fail("game layer rejected a legal move", pos);
                break;
            }
            total_moves++;
        }

        int result = game_result();
        if (result == RESULT_CHECKMATE) decisive++;
        else if (result != RESULT_NONE) draws++;

        /* Unwind the whole game and confirm we are back at the start. */
        game_undo(10000);
        Position start;
        pos_start(&start);
        if (!positions_equal(pos, &start)) fail("full undo did not reach the start position", pos);
    }

    printf("%d games, %d moves played, %d checkmates, %d other terminations\n", games,
           total_moves, decisive, draws);
    printf("%s\n", failures ? "STRESS FAILED" : "STRESS PASSED");
    return failures ? 1 : 0;
}
