/* Move notation: UCI parsing/printing and SAN output. */
#include "chess.h"

#include <string.h>

static const char PROMO_CHARS[6] = {'\0', 'n', 'b', 'r', 'q', '\0'};
static const char PIECE_LETTERS[6] = {'\0', 'N', 'B', 'R', 'Q', 'K'};

static inline void write_square(char *out, int sq) {
    out[0] = (char)('a' + FILE_OF(sq));
    out[1] = (char)('1' + RANK_OF(sq));
}

void move_to_uci(Move m, char *out) {
    if (m == MOVE_NONE) {
        strcpy(out, "0000");
        return;
    }
    write_square(out, mv_from(m));
    write_square(out + 2, mv_to(m));
    int promo = mv_promo(m);
    if (promo) {
        out[4] = PROMO_CHARS[promo];
        out[5] = '\0';
    } else {
        out[4] = '\0';
    }
}

/* Resolves a coordinate string against the legal moves, so flags (castling,
   en passant, double push) never have to be guessed by the caller. */
Move move_from_uci(Position *pos, const char *uci) {
    if (!uci || strlen(uci) < 4) return MOVE_NONE;

    int from_file = uci[0] - 'a', from_rank = uci[1] - '1';
    int to_file = uci[2] - 'a', to_rank = uci[3] - '1';
    if (from_file < 0 || from_file > 7 || from_rank < 0 || from_rank > 7) return MOVE_NONE;
    if (to_file < 0 || to_file > 7 || to_rank < 0 || to_rank > 7) return MOVE_NONE;

    int from = SQUARE(from_rank, from_file), to = SQUARE(to_rank, to_file);
    int promo = 0;
    if (uci[4]) {
        for (int i = KNIGHT; i <= QUEEN; i++)
            if (PROMO_CHARS[i] == uci[4]) promo = i;
        if (!promo) return MOVE_NONE;
    }

    MoveList legal;
    gen_legal(pos, &legal);
    for (int i = 0; i < legal.count; i++) {
        Move m = legal.moves[i];
        if (mv_from(m) != from || mv_to(m) != to) continue;
        if (promo && mv_promo(m) != promo) continue;
        /* A promotion move with no suffix is ambiguous; default to queen. */
        if (!promo && mv_promo(m) && mv_promo(m) != QUEEN) continue;
        return m;
    }
    return MOVE_NONE;
}

void move_to_san(Position *pos, Move m, char *out) {
    int n = 0;
    int from = mv_from(m), to = mv_to(m);
    int piece = pos->board[from];
    int pt = PIECE_TYPE(piece);
    int is_capture = pos->board[to] != EMPTY || mv_flag(m) == FLAG_EP;

    if (mv_flag(m) == FLAG_CASTLE) {
        n += to > from ? 3 : 5;
        memcpy(out, to > from ? "O-O" : "O-O-O", (size_t)n);
    } else if (pt == PAWN) {
        if (is_capture) {
            out[n++] = (char)('a' + FILE_OF(from));
            out[n++] = 'x';
        }
        write_square(out + n, to);
        n += 2;
        if (mv_promo(m)) {
            out[n++] = '=';
            out[n++] = PIECE_LETTERS[mv_promo(m)];
        }
    } else {
        out[n++] = PIECE_LETTERS[pt];

        /* Disambiguate against other identical pieces reaching the same square. */
        MoveList legal;
        gen_legal(pos, &legal);
        int same_file = 0, same_rank = 0, ambiguous = 0;
        for (int i = 0; i < legal.count; i++) {
            Move other = legal.moves[i];
            if (other == m || mv_to(other) != to) continue;
            if (PIECE_TYPE(pos->board[mv_from(other)]) != pt) continue;
            ambiguous = 1;
            if (FILE_OF(mv_from(other)) == FILE_OF(from)) same_file = 1;
            if (RANK_OF(mv_from(other)) == RANK_OF(from)) same_rank = 1;
        }
        if (ambiguous) {
            if (!same_file) out[n++] = (char)('a' + FILE_OF(from));
            else if (!same_rank) out[n++] = (char)('1' + RANK_OF(from));
            else {
                out[n++] = (char)('a' + FILE_OF(from));
                out[n++] = (char)('1' + RANK_OF(from));
            }
        }

        if (is_capture) out[n++] = 'x';
        write_square(out + n, to);
        n += 2;
    }

    Undo u;
    if (pos_do_move(pos, m, &u)) {
        if (pos_in_check(pos, pos->side)) {
            MoveList replies;
            gen_legal(pos, &replies);
            out[n++] = replies.count ? '+' : '#';
        }
        pos_undo_move(pos, m, &u);
    }
    out[n] = '\0';
}
