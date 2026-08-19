/* Board state: Zobrist hashing, FEN, make/unmake, attack queries. */
#include "chess.h"

#include <stdio.h>
#include <string.h>

static uint64_t piece_key[12][64];
static uint64_t castle_key[16];
static uint64_t ep_key[8];
static uint64_t side_key;
static uint8_t castle_mask[64];

static const char PIECE_CHARS[] = "PNBRQKpnbrqk.";

static uint64_t splitmix64(uint64_t *state) {
    uint64_t z = (*state += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

void pos_init_zobrist(void) {
    static int done = 0;
    if (done) return;
    done = 1;

    uint64_t seed = 0x1234567890ABCDEFULL;
    for (int p = 0; p < 12; p++)
        for (int sq = 0; sq < 64; sq++) piece_key[p][sq] = splitmix64(&seed);
    for (int i = 0; i < 16; i++) castle_key[i] = splitmix64(&seed);
    for (int i = 0; i < 8; i++) ep_key[i] = splitmix64(&seed);
    side_key = splitmix64(&seed);

    for (int sq = 0; sq < 64; sq++) castle_mask[sq] = 0xF;
    castle_mask[0] = (uint8_t)~CASTLE_WQ;
    castle_mask[7] = (uint8_t)~CASTLE_WK;
    castle_mask[4] = (uint8_t)~(CASTLE_WK | CASTLE_WQ);
    castle_mask[56] = (uint8_t)~CASTLE_BQ;
    castle_mask[63] = (uint8_t)~CASTLE_BK;
    castle_mask[60] = (uint8_t)~(CASTLE_BK | CASTLE_BQ);
}

static inline void put_piece(Position *pos, int sq, int piece) {
    pos->board[sq] = (uint8_t)piece;
    Bitboard bit = 1ULL << sq;
    pos->pieces[PIECE_TYPE(piece)] |= bit;
    pos->colors[PIECE_COLOR(piece)] |= bit;
}

static inline void remove_piece(Position *pos, int sq, int piece) {
    pos->board[sq] = EMPTY;
    Bitboard bit = ~(1ULL << sq);
    pos->pieces[PIECE_TYPE(piece)] &= bit;
    pos->colors[PIECE_COLOR(piece)] &= bit;
}

uint64_t pos_compute_key(const Position *pos) {
    uint64_t key = 0;
    for (int sq = 0; sq < 64; sq++)
        if (pos->board[sq] != EMPTY) key ^= piece_key[pos->board[sq]][sq];
    key ^= castle_key[pos->castling];
    if (pos->ep != -1) key ^= ep_key[FILE_OF(pos->ep)];
    if (pos->side == BLACK) key ^= side_key;
    return key;
}

int pos_king_square(const Position *pos, int color) {
    Bitboard kings = pos->pieces[KING] & pos->colors[color];
    return kings ? bb_lsb(kings) : -1;
}

int pos_attacked_by(const Position *pos, int sq, int by_color) {
    Bitboard occ = pos->colors[WHITE] | pos->colors[BLACK];
    Bitboard them = pos->colors[by_color];

    if (bb_pawn_attacks(by_color ^ 1, sq) & pos->pieces[PAWN] & them) return 1;
    if (bb_knight_attacks(sq) & pos->pieces[KNIGHT] & them) return 1;
    if (bb_king_attacks(sq) & pos->pieces[KING] & them) return 1;
    if (bb_bishop_attacks(sq, occ) & (pos->pieces[BISHOP] | pos->pieces[QUEEN]) & them) return 1;
    if (bb_rook_attacks(sq, occ) & (pos->pieces[ROOK] | pos->pieces[QUEEN]) & them) return 1;
    return 0;
}

int pos_in_check(const Position *pos, int color) {
    int ksq = pos_king_square(pos, color);
    return ksq >= 0 && pos_attacked_by(pos, ksq, color ^ 1);
}

static void undo_raw(Position *pos, Move m, const Undo *u) {
    int from = mv_from(m), to = mv_to(m);
    int us = pos->side ^ 1;
    int flag = mv_flag(m);

    int placed = pos->board[to];
    remove_piece(pos, to, placed);
    put_piece(pos, from, mv_promo(m) ? PIECE_MAKE(us, PAWN) : placed);

    if (flag == FLAG_CASTLE) {
        int rook_from, rook_to;
        if (to > from) {
            rook_from = us == WHITE ? 7 : 63;
            rook_to = us == WHITE ? 5 : 61;
        } else {
            rook_from = us == WHITE ? 0 : 56;
            rook_to = us == WHITE ? 3 : 59;
        }
        int rook = PIECE_MAKE(us, ROOK);
        remove_piece(pos, rook_to, rook);
        put_piece(pos, rook_from, rook);
    }

    if (u->captured != EMPTY) {
        int capture_sq = flag == FLAG_EP ? (us == WHITE ? to - 8 : to + 8) : to;
        put_piece(pos, capture_sq, u->captured);
    }

    if (us == BLACK) pos->fullmove--;
    pos->side = (uint8_t)us;
    pos->castling = u->castling;
    pos->ep = u->ep;
    pos->halfmove = u->halfmove;
    pos->key = u->key;
}

int pos_do_move(Position *pos, Move m, Undo *u) {
    int from = mv_from(m), to = mv_to(m);
    int us = pos->side, them = us ^ 1;
    int piece = pos->board[from];
    int flag = mv_flag(m);
    int promo = mv_promo(m);

    u->move = m;
    u->castling = pos->castling;
    u->ep = pos->ep;
    u->halfmove = pos->halfmove;
    u->key = pos->key;
    u->captured = EMPTY;

    uint64_t key = pos->key;
    if (pos->ep != -1) key ^= ep_key[FILE_OF(pos->ep)];

    int capture_sq = flag == FLAG_EP ? (us == WHITE ? to - 8 : to + 8) : to;
    int captured = pos->board[capture_sq];
    if (captured != EMPTY) {
        u->captured = (uint8_t)captured;
        remove_piece(pos, capture_sq, captured);
        key ^= piece_key[captured][capture_sq];
    }

    remove_piece(pos, from, piece);
    key ^= piece_key[piece][from];

    int placed = promo ? PIECE_MAKE(us, promo) : piece;
    put_piece(pos, to, placed);
    key ^= piece_key[placed][to];

    if (flag == FLAG_CASTLE) {
        int rook_from, rook_to;
        if (to > from) {
            rook_from = us == WHITE ? 7 : 63;
            rook_to = us == WHITE ? 5 : 61;
        } else {
            rook_from = us == WHITE ? 0 : 56;
            rook_to = us == WHITE ? 3 : 59;
        }
        int rook = PIECE_MAKE(us, ROOK);
        remove_piece(pos, rook_from, rook);
        put_piece(pos, rook_to, rook);
        key ^= piece_key[rook][rook_from] ^ piece_key[rook][rook_to];
    }

    key ^= castle_key[pos->castling];
    pos->castling &= castle_mask[from] & castle_mask[to];
    key ^= castle_key[pos->castling];

    pos->ep = -1;
    if (flag == FLAG_DPUSH) {
        int ep_sq = us == WHITE ? from + 8 : from - 8;
        /* Only record en passant when a capture is actually available; keeps
           equivalent positions hashing identically. */
        if (bb_pawn_attacks(us, ep_sq) & pos->pieces[PAWN] & pos->colors[them]) {
            pos->ep = (int8_t)ep_sq;
            key ^= ep_key[FILE_OF(ep_sq)];
        }
    }

    if (PIECE_TYPE(piece) == PAWN || captured != EMPTY) pos->halfmove = 0;
    else pos->halfmove++;
    if (us == BLACK) pos->fullmove++;

    pos->side = (uint8_t)them;
    key ^= side_key;
    pos->key = key;

    if (pos_attacked_by(pos, pos_king_square(pos, us), them)) {
        undo_raw(pos, m, u);
        return 0;
    }

    if (pos->hist_count < MAX_HIST) pos->hist[pos->hist_count++] = key;
    return 1;
}

void pos_undo_move(Position *pos, Move m, const Undo *u) {
    if (pos->hist_count > 0) pos->hist_count--;
    undo_raw(pos, m, u);
}

void pos_do_null(Position *pos, Undo *u) {
    u->move = MOVE_NONE;
    u->captured = EMPTY;
    u->castling = pos->castling;
    u->ep = pos->ep;
    u->halfmove = pos->halfmove;
    u->key = pos->key;

    if (pos->ep != -1) pos->key ^= ep_key[FILE_OF(pos->ep)];
    pos->ep = -1;
    pos->side ^= 1;
    pos->key ^= side_key;
    pos->halfmove++;
    if (pos->hist_count < MAX_HIST) pos->hist[pos->hist_count++] = pos->key;
}

void pos_undo_null(Position *pos, const Undo *u) {
    if (pos->hist_count > 0) pos->hist_count--;
    pos->side ^= 1;
    pos->castling = u->castling;
    pos->ep = u->ep;
    pos->halfmove = u->halfmove;
    pos->key = u->key;
}

int pos_is_repetition(const Position *pos, int ply) {
    int end = pos->hist_count - 1;
    if (end < 0) return 0;
    int count = 0;
    int limit = pos->halfmove;
    for (int i = 2; i <= limit && i <= end; i += 2) {
        if (pos->hist[end - i] != pos->hist[end]) continue;
        count++;
        /* Inside the tree one repeat is enough to call it a draw; at the game
           root we need a real threefold. */
        if (ply > 0 || count >= 2) return 1;
    }
    return 0;
}

int pos_has_non_pawn_material(const Position *pos, int color) {
    Bitboard men = pos->colors[color] & ~pos->pieces[PAWN] & ~pos->pieces[KING];
    return men != 0;
}

int pos_insufficient_material(const Position *pos) {
    if (pos->pieces[PAWN] || pos->pieces[ROOK] || pos->pieces[QUEEN]) return 0;

    Bitboard knights = pos->pieces[KNIGHT];
    Bitboard bishops = pos->pieces[BISHOP];
    int minors = bb_popcount(knights | bishops);

    if (minors <= 1) return 1; /* K vs K, K+N vs K, K+B vs K */
    if (knights) return 0;
    if (minors == 2 && bb_popcount(bishops & pos->colors[WHITE]) == 1) {
        /* K+B vs K+B is drawn when both bishops share a square colour. */
        const Bitboard dark = 0xAA55AA55AA55AA55ULL;
        int a = (bishops & dark) != 0;
        int b = (bishops & ~dark) != 0;
        return !(a && b);
    }
    return 0;
}

void pos_start(Position *pos) {
    pos_set_fen(pos, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
}

int pos_set_fen(Position *pos, const char *fen) {
    memset(pos, 0, sizeof(*pos));
    memset(pos->board, EMPTY, sizeof(pos->board));
    pos->ep = -1;
    pos->fullmove = 1;

    const char *s = fen;
    int rank = 7, file = 0;
    for (; *s && *s != ' '; s++) {
        if (*s == '/') {
            if (file != 8) return 0;
            rank--;
            file = 0;
            if (rank < 0) return 0;
            continue;
        }
        if (*s >= '1' && *s <= '8') {
            file += *s - '0';
            if (file > 8) return 0;
            continue;
        }
        const char *found = strchr(PIECE_CHARS, *s);
        if (!found || *s == '.') return 0;
        if (file > 7 || rank < 0) return 0;
        put_piece(pos, SQUARE(rank, file), (int)(found - PIECE_CHARS));
        file++;
    }
    if (rank != 0 || file != 8) return 0;

    while (*s == ' ') s++;
    if (*s == 'b') pos->side = BLACK;
    else if (*s == 'w') pos->side = WHITE;
    else return 0;
    s++;

    while (*s == ' ') s++;
    if (*s == '-') s++;
    else
        for (; *s && *s != ' '; s++) {
            switch (*s) {
                case 'K': pos->castling |= CASTLE_WK; break;
                case 'Q': pos->castling |= CASTLE_WQ; break;
                case 'k': pos->castling |= CASTLE_BK; break;
                case 'q': pos->castling |= CASTLE_BQ; break;
                default: return 0;
            }
        }

    while (*s == ' ') s++;
    if (*s && *s != '-') {
        int f = *s++ - 'a';
        int r = *s++ - '1';
        if (f < 0 || f > 7 || r < 0 || r > 7) return 0;
        int ep_sq = SQUARE(r, f);
        /* Same normalisation as pos_do_move: drop unusable en-passant squares. */
        if (bb_pawn_attacks(pos->side ^ 1, ep_sq) & pos->pieces[PAWN] & pos->colors[pos->side])
            pos->ep = (int8_t)ep_sq;
    } else if (*s == '-') {
        s++;
    }

    while (*s == ' ') s++;
    if (*s >= '0' && *s <= '9') {
        int v = 0;
        while (*s >= '0' && *s <= '9') v = v * 10 + (*s++ - '0');
        pos->halfmove = (uint16_t)v;
    }
    while (*s == ' ') s++;
    if (*s >= '0' && *s <= '9') {
        int v = 0;
        while (*s >= '0' && *s <= '9') v = v * 10 + (*s++ - '0');
        pos->fullmove = (uint16_t)(v > 0 ? v : 1);
    }

    /* Reject positions we cannot legally search from. */
    if (bb_popcount(pos->pieces[KING] & pos->colors[WHITE]) != 1) return 0;
    if (bb_popcount(pos->pieces[KING] & pos->colors[BLACK]) != 1) return 0;
    if (pos_in_check(pos, pos->side ^ 1)) return 0;

    pos->key = pos_compute_key(pos);
    pos->hist_count = 0;
    pos->hist[pos->hist_count++] = pos->key;
    return 1;
}

void pos_get_fen(const Position *pos, char *out, size_t cap) {
    char buf[128];
    int n = 0;
    for (int rank = 7; rank >= 0; rank--) {
        int empty = 0;
        for (int file = 0; file < 8; file++) {
            int piece = pos->board[SQUARE(rank, file)];
            if (piece == EMPTY) {
                empty++;
                continue;
            }
            if (empty) buf[n++] = (char)('0' + empty);
            empty = 0;
            buf[n++] = PIECE_CHARS[piece];
        }
        if (empty) buf[n++] = (char)('0' + empty);
        if (rank) buf[n++] = '/';
    }
    buf[n] = '\0';

    char castling[5];
    int c = 0;
    if (pos->castling & CASTLE_WK) castling[c++] = 'K';
    if (pos->castling & CASTLE_WQ) castling[c++] = 'Q';
    if (pos->castling & CASTLE_BK) castling[c++] = 'k';
    if (pos->castling & CASTLE_BQ) castling[c++] = 'q';
    castling[c] = '\0';

    char ep[3] = "-";
    if (pos->ep != -1) {
        ep[0] = (char)('a' + FILE_OF(pos->ep));
        ep[1] = (char)('1' + RANK_OF(pos->ep));
        ep[2] = '\0';
    }

    snprintf(out, cap, "%s %c %s %s %d %d", buf, pos->side == WHITE ? 'w' : 'b',
             c ? castling : "-", ep, pos->halfmove, pos->fullmove);
}
