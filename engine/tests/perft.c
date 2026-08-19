/* Move generation correctness gate. Node counts are the standard published
   values for these positions; any mismatch is a movegen or make/unmake bug. */
#include "../src/chess.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static int verify_keys = 0;
static int key_errors = 0;

static uint64_t perft(Position *pos, int depth) {
    MoveList list;
    gen_pseudo(pos, &list);

    uint64_t nodes = 0;
    for (int i = 0; i < list.count; i++) {
        Undo u;
        if (!pos_do_move(pos, list.moves[i], &u)) continue;
        if (verify_keys && pos->key != pos_compute_key(pos)) key_errors++;
        nodes += depth == 1 ? 1 : perft(pos, depth - 1);
        pos_undo_move(pos, list.moves[i], &u);
    }
    return nodes;
}

typedef struct {
    const char *name;
    const char *fen;
    int depth;
    uint64_t expected;
} Case;

static const Case CASES[] = {
    {"startpos", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 1, 20},
    {"startpos", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 2, 400},
    {"startpos", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 3, 8902},
    {"startpos", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 4, 197281},
    {"startpos", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 5, 4865609},
    {"startpos", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 6, 119060324},

    {"kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 1, 48},
    {"kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 2, 2039},
    {"kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 3, 97862},
    {"kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 4, 4085603},
    {"kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 5, 193690690},

    {"endgame", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 1, 14},
    {"endgame", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 2, 191},
    {"endgame", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 3, 2812},
    {"endgame", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 4, 43238},
    {"endgame", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 5, 674624},
    {"endgame", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 6, 11030083},

    {"promotions", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 1, 6},
    {"promotions", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 2, 264},
    {"promotions", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 3, 9467},
    {"promotions", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 4, 422333},
    {"promotions", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 5, 15833292},

    {"position5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 1, 44},
    {"position5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 2, 1486},
    {"position5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 3, 62379},
    {"position5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 4, 2103487},
    {"position5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 5, 89941194},

    {"position6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 1, 46},
    {"position6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 2, 2079},
    {"position6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 3, 89890},
    {"position6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 4, 3894594},
    {"position6", "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 5, 164075551},
};

/* `divide` output for narrowing down a mismatch by hand. */
static void divide(Position *pos, int depth) {
    MoveList list;
    gen_pseudo(pos, &list);
    uint64_t total = 0;
    for (int i = 0; i < list.count; i++) {
        Undo u;
        if (!pos_do_move(pos, list.moves[i], &u)) continue;
        uint64_t n = depth == 1 ? 1 : perft(pos, depth - 1);
        pos_undo_move(pos, list.moves[i], &u);
        char uci[8];
        move_to_uci(list.moves[i], uci);
        printf("%s: %llu\n", uci, (unsigned long long)n);
        total += n;
    }
    printf("total: %llu\n", (unsigned long long)total);
}

int main(int argc, char **argv) {
    bb_init();
    pos_init_zobrist();

    if (argc >= 3 && strcmp(argv[1], "divide") == 0) {
        Position pos;
        if (!pos_set_fen(&pos, argv[2])) {
            fprintf(stderr, "bad fen\n");
            return 2;
        }
        divide(&pos, argc >= 4 ? atoi(argv[3]) : 1);
        return 0;
    }

    int max_depth = argc >= 2 ? atoi(argv[1]) : 5;
    verify_keys = 1;

    int failed = 0;
    uint64_t total_nodes = 0;
    clock_t start = clock();

    for (size_t i = 0; i < sizeof(CASES) / sizeof(CASES[0]); i++) {
        const Case *c = &CASES[i];
        if (c->depth > max_depth) continue;

        Position pos;
        if (!pos_set_fen(&pos, c->fen)) {
            printf("FAIL %-11s depth %d  (fen rejected)\n", c->name, c->depth);
            failed++;
            continue;
        }
        uint64_t nodes = perft(&pos, c->depth);
        total_nodes += nodes;

        if (nodes == c->expected) {
            printf("ok   %-11s depth %d  %llu\n", c->name, c->depth, (unsigned long long)nodes);
        } else {
            printf("FAIL %-11s depth %d  got %llu want %llu\n", c->name, c->depth,
                   (unsigned long long)nodes, (unsigned long long)c->expected);
            failed++;
        }
    }

    double secs = (double)(clock() - start) / CLOCKS_PER_SEC;
    printf("\n%llu nodes in %.2fs (%.1f Mnps)\n", (unsigned long long)total_nodes, secs,
           secs > 0 ? total_nodes / secs / 1e6 : 0);

    if (key_errors) {
        printf("FAIL zobrist: %d incremental key mismatches\n", key_errors);
        failed++;
    } else {
        printf("ok   zobrist: incremental keys match recomputed keys\n");
    }

    printf("%s\n", failed ? "PERFT FAILED" : "PERFT PASSED");
    return failed ? 1 : 0;
}
