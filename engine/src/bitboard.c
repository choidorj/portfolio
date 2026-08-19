/* Attack tables. Sliders use magic bitboards with magics found at init. */
#include "chess.h"

static Bitboard knight_tbl[64];
static Bitboard king_tbl[64];
static Bitboard pawn_tbl[COLOR_NB][64];
static Bitboard between_tbl[64][64];
static Bitboard line_tbl[64][64];

typedef struct {
    Bitboard mask;
    Bitboard magic;
    Bitboard *attacks;
    int shift;
} Magic;

static Magic rook_magics[64];
static Magic bishop_magics[64];
static Bitboard rook_table[102400];
static Bitboard bishop_table[5248];

static const int rook_dirs[4][2] = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
static const int bishop_dirs[4][2] = {{1, 1}, {1, -1}, {-1, 1}, {-1, -1}};

static uint64_t rng_state = 0x9E3779B97F4A7C15ULL;

static uint64_t rng_next(void) {
    rng_state ^= rng_state >> 12;
    rng_state ^= rng_state << 25;
    rng_state ^= rng_state >> 27;
    return rng_state * 2685821657736338717ULL;
}

static uint64_t rng_sparse(void) { return rng_next() & rng_next() & rng_next(); }

static Bitboard slider_attacks(int sq, Bitboard occ, const int dirs[4][2]) {
    Bitboard attacks = 0;
    for (int i = 0; i < 4; i++) {
        int r = RANK_OF(sq), f = FILE_OF(sq);
        for (;;) {
            r += dirs[i][0];
            f += dirs[i][1];
            if (r < 0 || r > 7 || f < 0 || f > 7) break;
            int s = SQUARE(r, f);
            attacks |= 1ULL << s;
            if (occ & (1ULL << s)) break;
        }
    }
    return attacks;
}

static Bitboard rook_mask(int sq) {
    Bitboard m = 0;
    int r = RANK_OF(sq), f = FILE_OF(sq);
    for (int i = r + 1; i <= 6; i++) m |= 1ULL << SQUARE(i, f);
    for (int i = r - 1; i >= 1; i--) m |= 1ULL << SQUARE(i, f);
    for (int i = f + 1; i <= 6; i++) m |= 1ULL << SQUARE(r, i);
    for (int i = f - 1; i >= 1; i--) m |= 1ULL << SQUARE(r, i);
    return m;
}

static Bitboard bishop_mask(int sq) {
    Bitboard m = 0;
    int r = RANK_OF(sq), f = FILE_OF(sq);
    for (int i = r + 1, j = f + 1; i <= 6 && j <= 6; i++, j++) m |= 1ULL << SQUARE(i, j);
    for (int i = r + 1, j = f - 1; i <= 6 && j >= 1; i++, j--) m |= 1ULL << SQUARE(i, j);
    for (int i = r - 1, j = f + 1; i >= 1 && j <= 6; i--, j++) m |= 1ULL << SQUARE(i, j);
    for (int i = r - 1, j = f - 1; i >= 1 && j >= 1; i--, j--) m |= 1ULL << SQUARE(i, j);
    return m;
}

/* Scatter the low bits of `index` across the set bits of `mask`. */
static Bitboard occupancy_from_index(int index, Bitboard mask) {
    Bitboard occ = 0;
    int bits = bb_popcount(mask);
    for (int i = 0; i < bits; i++) {
        int sq = bb_pop_lsb(&mask);
        if (index & (1 << i)) occ |= 1ULL << sq;
    }
    return occ;
}

static void init_magics(Magic *magics, Bitboard *table, const int dirs[4][2],
                        Bitboard (*mask_fn)(int)) {
    Bitboard occupancies[4096], references[4096], used[4096];
    size_t offset = 0;

    for (int sq = 0; sq < 64; sq++) {
        Magic *m = &magics[sq];
        m->mask = mask_fn(sq);
        int bits = bb_popcount(m->mask);
        m->shift = 64 - bits;
        m->attacks = table + offset;
        offset += (size_t)1 << bits;

        int size = 1 << bits;
        for (int i = 0; i < size; i++) {
            occupancies[i] = occupancy_from_index(i, m->mask);
            references[i] = slider_attacks(sq, occupancies[i], dirs);
        }

        for (;;) {
            m->magic = rng_sparse();
            /* Cheap rejection: a usable magic spreads the mask's high bits. */
            if (bb_popcount((m->mask * m->magic) >> 56) < 6) continue;

            for (int i = 0; i < size; i++) used[i] = 0;
            int ok = 1;
            for (int i = 0; i < size && ok; i++) {
                unsigned idx = (unsigned)((occupancies[i] * m->magic) >> m->shift);
                if (used[idx] == 0) used[idx] = references[i];
                else if (used[idx] != references[i]) ok = 0;
            }
            if (!ok) continue;

            for (int i = 0; i < size; i++) m->attacks[i] = used[i];
            break;
        }
    }
}

void bb_init(void) {
    static int done = 0;
    if (done) return;
    done = 1;

    static const int knight_moves[8][2] = {{2, 1},  {2, -1},  {-2, 1},  {-2, -1},
                                           {1, 2},  {1, -2},  {-1, 2},  {-1, -2}};
    static const int king_moves[8][2] = {{1, 0}, {1, 1},  {0, 1},  {-1, 1},
                                         {-1, 0}, {-1, -1}, {0, -1}, {1, -1}};

    for (int sq = 0; sq < 64; sq++) {
        int r = RANK_OF(sq), f = FILE_OF(sq);
        for (int i = 0; i < 8; i++) {
            int nr = r + knight_moves[i][0], nf = f + knight_moves[i][1];
            if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) knight_tbl[sq] |= 1ULL << SQUARE(nr, nf);
            nr = r + king_moves[i][0];
            nf = f + king_moves[i][1];
            if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) king_tbl[sq] |= 1ULL << SQUARE(nr, nf);
        }
        if (r < 7) {
            if (f > 0) pawn_tbl[WHITE][sq] |= 1ULL << SQUARE(r + 1, f - 1);
            if (f < 7) pawn_tbl[WHITE][sq] |= 1ULL << SQUARE(r + 1, f + 1);
        }
        if (r > 0) {
            if (f > 0) pawn_tbl[BLACK][sq] |= 1ULL << SQUARE(r - 1, f - 1);
            if (f < 7) pawn_tbl[BLACK][sq] |= 1ULL << SQUARE(r - 1, f + 1);
        }
    }

    init_magics(rook_magics, rook_table, rook_dirs, rook_mask);
    init_magics(bishop_magics, bishop_table, bishop_dirs, bishop_mask);

    for (int a = 0; a < 64; a++) {
        for (int b = 0; b < 64; b++) {
            if (a == b) continue;
            Bitboard target = 1ULL << b;
            if (bb_rook_attacks(a, 0) & target) {
                line_tbl[a][b] = (bb_rook_attacks(a, 0) & bb_rook_attacks(b, 0)) |
                                 (1ULL << a) | target;
                between_tbl[a][b] = bb_rook_attacks(a, target) & bb_rook_attacks(b, 1ULL << a);
            } else if (bb_bishop_attacks(a, 0) & target) {
                line_tbl[a][b] = (bb_bishop_attacks(a, 0) & bb_bishop_attacks(b, 0)) |
                                 (1ULL << a) | target;
                between_tbl[a][b] = bb_bishop_attacks(a, target) & bb_bishop_attacks(b, 1ULL << a);
            }
        }
    }
}

Bitboard bb_knight_attacks(int sq) { return knight_tbl[sq]; }
Bitboard bb_king_attacks(int sq) { return king_tbl[sq]; }
Bitboard bb_pawn_attacks(int color, int sq) { return pawn_tbl[color][sq]; }

Bitboard bb_bishop_attacks(int sq, Bitboard occ) {
    const Magic *m = &bishop_magics[sq];
    return m->attacks[((occ & m->mask) * m->magic) >> m->shift];
}

Bitboard bb_rook_attacks(int sq, Bitboard occ) {
    const Magic *m = &rook_magics[sq];
    return m->attacks[((occ & m->mask) * m->magic) >> m->shift];
}

Bitboard bb_queen_attacks(int sq, Bitboard occ) {
    return bb_bishop_attacks(sq, occ) | bb_rook_attacks(sq, occ);
}

Bitboard bb_between(int a, int b) { return between_tbl[a][b]; }
Bitboard bb_line(int a, int b) { return line_tbl[a][b]; }
