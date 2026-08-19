/* Tapered evaluation: material + piece-square tables interpolated between a
   middlegame and endgame score, plus pawn structure, mobility and king safety. */
#include "chess.h"

/* Piece values, midgame and endgame. */
static const int MG_VALUE[6] = {82, 337, 365, 477, 1025, 0};
static const int EG_VALUE[6] = {94, 281, 297, 512, 936, 0};
static const int SEE_VALUE[6] = {100, 320, 330, 500, 900, 20000};

/* Phase weights; the game is "fully midgame" at 24. */
static const int PHASE_WEIGHT[6] = {0, 1, 1, 2, 4, 0};
#define PHASE_MAX 24

/* Tables are written from Black's point of view (a8..h8 first) so they read
   like a board; init flips them for White. */
static const int MG_PST[6][64] = {
    {/* pawn */
       0,   0,   0,   0,   0,   0,   0,   0,
      98, 134,  61,  95,  68, 126,  34, -11,
      -6,   7,  26,  31,  65,  56,  25, -20,
     -14,  13,   6,  21,  23,  12,  17, -23,
     -27,  -2,  -5,  12,  17,   6,  10, -25,
     -26,  -4,  -4, -10,   3,   3,  33, -12,
     -35,  -1, -20, -23, -15,  24,  38, -22,
       0,   0,   0,   0,   0,   0,   0,   0},
    {/* knight */
    -167, -89, -34, -49,  61, -97, -15,-107,
     -73, -41,  72,  36,  23,  62,   7, -17,
     -47,  60,  37,  65,  84, 129,  73,  44,
      -9,  17,  19,  53,  37,  69,  18,  22,
     -13,   4,  16,  13,  28,  19,  21,  -8,
     -23,  -9,  12,  10,  19,  17,  25, -16,
     -29, -53, -12,  -3,  -1,  18, -14, -19,
    -105, -21, -58, -33, -17, -28, -19, -23},
    {/* bishop */
     -29,   4, -82, -37, -25, -42,   7,  -8,
     -26,  16, -18, -13,  30,  59,  18, -47,
     -16,  37,  43,  40,  35,  50,  37,  -2,
      -4,   5,  19,  50,  37,  37,   7,  -2,
      -6,  13,  13,  26,  34,  12,  10,   4,
       0,  15,  15,  15,  14,  27,  18,  10,
       4,  15,  16,   0,   7,  21,  33,   1,
     -33,  -3, -14, -21, -13, -12, -39, -21},
    {/* rook */
      32,  42,  32,  51,  63,   9,  31,  43,
      27,  32,  58,  62,  80,  67,  26,  44,
      -5,  19,  26,  36,  17,  45,  61,  16,
     -24, -11,   7,  26,  24,  35,  -8, -20,
     -36, -26, -12,  -1,   9,  -7,   6, -23,
     -45, -25, -16, -17,   3,   0,  -5, -33,
     -44, -16, -20,  -9,  -1,  11,  -6, -71,
     -19, -13,   1,  17,  16,   7, -37, -26},
    {/* queen */
     -28,   0,  29,  12,  59,  44,  43,  45,
     -24, -39,  -5,   1, -16,  57,  28,  54,
     -13, -17,   7,   8,  29,  56,  47,  57,
     -27, -27, -16, -16,  -1,  17,  -2,   1,
      -9, -26,  -9, -10,  -2,  -4,   3,  -3,
     -14,   2, -11,  -2,  -5,   2,  14,   5,
     -35,  -8,  11,   2,   8,  15,  -3,   1,
      -1, -18,  -9,  10, -15, -25, -31, -50},
    {/* king */
     -65,  23,  16, -15, -56, -34,   2,  13,
      29,  -1, -20,  -7,  -8,  -4, -38, -29,
      -9,  24,   2, -16, -20,   6,  22, -22,
     -17, -20, -12, -27, -30, -25, -14, -36,
     -49,  -1, -27, -39, -46, -44, -33, -51,
     -14, -14, -22, -46, -44, -30, -15, -27,
       1,   7,  -8, -64, -43, -16,   9,   8,
     -15,  36,  12, -54,   8, -28,  24,  14},
};

static const int EG_PST[6][64] = {
    {/* pawn */
       0,   0,   0,   0,   0,   0,   0,   0,
     178, 173, 158, 134, 147, 132, 165, 187,
      94, 100,  85,  67,  56,  53,  82,  84,
      32,  24,  13,   5,  -2,   4,  17,  17,
      13,   9,  -3,  -7,  -7,  -8,   3,  -1,
       4,   7,  -6,   1,   0,  -5,  -1,  -8,
      13,   8,   8,  10,  13,   0,   2,  -7,
       0,   0,   0,   0,   0,   0,   0,   0},
    {/* knight */
     -58, -38, -13, -28, -31, -27, -63, -99,
     -25,  -8, -25,  -2,  -9, -25, -24, -52,
     -24, -20,  10,   9,  -1,  -9, -19, -41,
     -17,   3,  22,  22,  22,  11,   8, -18,
     -18,  -6,  16,  25,  16,  17,   4, -18,
     -23,  -3,  -1,  15,  10,  -3, -20, -22,
     -42, -20, -10,  -5,  -2, -20, -23, -44,
     -29, -51, -23, -15, -22, -18, -50, -64},
    {/* bishop */
     -14, -21, -11,  -8,  -7,  -9, -17, -24,
      -8,  -4,   7, -12,  -3, -13,  -4, -14,
       2,  -8,   0,  -1,  -2,   6,   0,   4,
      -3,   9,  12,   9,  14,  10,   3,   2,
      -6,   3,  13,  19,   7,  10,  -3,  -9,
     -12,  -3,   8,  10,  13,   3,  -7, -15,
     -14, -18,  -7,  -1,   4,  -9, -15, -27,
     -23,  -9, -23,  -5,  -9, -16,  -5, -17},
    {/* rook */
      13,  10,  18,  15,  12,  12,   8,   5,
      11,  13,  13,  11,  -3,   3,   8,   3,
       7,   7,   7,   5,   4,  -3,  -5,  -3,
       4,   3,  13,   1,   2,   1,  -1,   2,
       3,   5,   8,   4,  -5,  -6,  -8, -11,
      -4,   0,  -5,  -1,  -7, -12,  -8, -16,
      -6,  -6,   0,   2,  -9,  -9, -11,  -3,
      -9,   2,   3,  -1,  -5, -13,   4, -20},
    {/* queen */
      -9,  22,  22,  27,  27,  19,  10,  20,
     -17,  20,  32,  41,  58,  25,  30,   0,
     -20,   6,   9,  49,  47,  35,  19,   9,
       3,  22,  24,  45,  57,  40,  57,  36,
     -18,  28,  19,  47,  31,  34,  39,  23,
     -16, -27,  15,   6,   9,  17,  10,   5,
     -22, -23, -30, -16, -16, -23, -36, -32,
     -33, -28, -22, -43,  -5, -32, -20, -41},
    {/* king */
     -74, -35, -18, -18, -11,  15,   4, -17,
     -12,  17,  14,  17,  17,  38,  23,  11,
      10,  17,  23,  15,  20,  45,  44,  13,
      -8,  22,  24,  27,  26,  33,  26,   3,
     -18,  -4,  21,  24,  27,  23,   9, -11,
     -19,  -3,  11,  21,  23,  16,   7,  -9,
     -27, -11,   4,  13,  14,   4,  -5, -17,
     -53, -34, -21, -11, -28, -14, -24, -43},
};

static int mg_table[12][64];
static int eg_table[12][64];

static Bitboard file_mask[8];
static Bitboard adjacent_files[8];
static Bitboard passed_mask[COLOR_NB][64];
static Bitboard forward_file[COLOR_NB][64];
static Bitboard king_zone[COLOR_NB][64];

static const int PASSED_BONUS_MG[8] = {0, 5, 10, 20, 35, 60, 100, 0};
static const int PASSED_BONUS_EG[8] = {0, 10, 20, 40, 70, 120, 180, 0};

static const int MOBILITY_MG[6] = {0, 4, 4, 2, 1, 0};
static const int MOBILITY_EG[6] = {0, 4, 5, 4, 2, 0};

/* Rough attack weight per piece type entering the enemy king zone. */
static const int KING_ATTACK_WEIGHT[6] = {0, 20, 20, 40, 80, 0};
static const int KING_DANGER[8] = {0, 0, 12, 30, 56, 90, 130, 175};

#define BISHOP_PAIR_MG 30
#define BISHOP_PAIR_EG 50
#define DOUBLED_MG -10
#define DOUBLED_EG -22
#define ISOLATED_MG -14
#define ISOLATED_EG -18
#define ROOK_OPEN_MG 26
#define ROOK_OPEN_EG 12
#define ROOK_SEMI_MG 12
#define ROOK_SEMI_EG 8
#define TEMPO 10

void eval_init(void) {
    static int done = 0;
    if (done) return;
    done = 1;

    for (int pt = 0; pt < 6; pt++) {
        for (int sq = 0; sq < 64; sq++) {
            /* Tables are listed with rank 8 first, so flip the rank for White. */
            int table_index = (7 - RANK_OF(sq)) * 8 + FILE_OF(sq);
            mg_table[PIECE_MAKE(WHITE, pt)][sq] = MG_VALUE[pt] + MG_PST[pt][table_index];
            eg_table[PIECE_MAKE(WHITE, pt)][sq] = EG_VALUE[pt] + EG_PST[pt][table_index];
            mg_table[PIECE_MAKE(BLACK, pt)][sq] = MG_VALUE[pt] + MG_PST[pt][sq];
            eg_table[PIECE_MAKE(BLACK, pt)][sq] = EG_VALUE[pt] + EG_PST[pt][sq];
        }
    }

    for (int f = 0; f < 8; f++) {
        for (int r = 0; r < 8; r++) file_mask[f] |= 1ULL << SQUARE(r, f);
    }
    for (int f = 0; f < 8; f++) {
        if (f > 0) adjacent_files[f] |= file_mask[f - 1];
        if (f < 7) adjacent_files[f] |= file_mask[f + 1];
    }

    for (int sq = 0; sq < 64; sq++) {
        int r = RANK_OF(sq), f = FILE_OF(sq);
        for (int i = r + 1; i < 8; i++) {
            forward_file[WHITE][sq] |= 1ULL << SQUARE(i, f);
            passed_mask[WHITE][sq] |= (1ULL << SQUARE(i, f));
            if (f > 0) passed_mask[WHITE][sq] |= 1ULL << SQUARE(i, f - 1);
            if (f < 7) passed_mask[WHITE][sq] |= 1ULL << SQUARE(i, f + 1);
        }
        for (int i = r - 1; i >= 0; i--) {
            forward_file[BLACK][sq] |= 1ULL << SQUARE(i, f);
            passed_mask[BLACK][sq] |= (1ULL << SQUARE(i, f));
            if (f > 0) passed_mask[BLACK][sq] |= 1ULL << SQUARE(i, f - 1);
            if (f < 7) passed_mask[BLACK][sq] |= 1ULL << SQUARE(i, f + 1);
        }

        Bitboard zone = bb_king_attacks(sq) | (1ULL << sq);
        king_zone[WHITE][sq] = zone | (zone << 8);
        king_zone[BLACK][sq] = zone | (zone >> 8);
    }
}

int evaluate(const Position *pos) {
    int mg[COLOR_NB] = {0, 0};
    int eg[COLOR_NB] = {0, 0};
    int phase = 0;
    int king_attackers[COLOR_NB] = {0, 0};
    int king_attack_score[COLOR_NB] = {0, 0};

    Bitboard occ = pos->colors[WHITE] | pos->colors[BLACK];
    int ksq[COLOR_NB] = {pos_king_square(pos, WHITE), pos_king_square(pos, BLACK)};

    for (int color = WHITE; color <= BLACK; color++) {
        int them = color ^ 1;
        Bitboard own_pawns = pos->pieces[PAWN] & pos->colors[color];
        Bitboard enemy_pawns = pos->pieces[PAWN] & pos->colors[them];
        Bitboard zone = king_zone[them][ksq[them]];
        /* Squares attacked by enemy pawns are poor mobility targets. */
        Bitboard pawn_guard = 0;
        {
            Bitboard p = enemy_pawns;
            while (p) pawn_guard |= bb_pawn_attacks(them, bb_pop_lsb(&p));
        }

        Bitboard men = pos->colors[color];
        while (men) {
            int sq = bb_pop_lsb(&men);
            int piece = pos->board[sq];
            int pt = PIECE_TYPE(piece);

            mg[color] += mg_table[piece][sq];
            eg[color] += eg_table[piece][sq];
            phase += PHASE_WEIGHT[pt];

            if (pt == PAWN) {
                if (!(passed_mask[color][sq] & enemy_pawns)) {
                    int rank = color == WHITE ? RANK_OF(sq) : 7 - RANK_OF(sq);
                    mg[color] += PASSED_BONUS_MG[rank];
                    eg[color] += PASSED_BONUS_EG[rank];
                }
                if (!(adjacent_files[FILE_OF(sq)] & own_pawns)) {
                    mg[color] += ISOLATED_MG;
                    eg[color] += ISOLATED_EG;
                }
                if (forward_file[color][sq] & own_pawns) {
                    mg[color] += DOUBLED_MG;
                    eg[color] += DOUBLED_EG;
                }
                continue;
            }

            if (pt == KING) continue;

            Bitboard attacks;
            switch (pt) {
                case KNIGHT: attacks = bb_knight_attacks(sq); break;
                case BISHOP: attacks = bb_bishop_attacks(sq, occ); break;
                case ROOK: attacks = bb_rook_attacks(sq, occ); break;
                default: attacks = bb_queen_attacks(sq, occ); break;
            }

            int moves = bb_popcount(attacks & ~pos->colors[color] & ~pawn_guard);
            mg[color] += moves * MOBILITY_MG[pt];
            eg[color] += moves * MOBILITY_EG[pt];

            if (attacks & zone) {
                king_attackers[color]++;
                king_attack_score[color] += KING_ATTACK_WEIGHT[pt];
            }

            if (pt == ROOK) {
                if (!(file_mask[FILE_OF(sq)] & pos->pieces[PAWN])) {
                    mg[color] += ROOK_OPEN_MG;
                    eg[color] += ROOK_OPEN_EG;
                } else if (!(file_mask[FILE_OF(sq)] & own_pawns)) {
                    mg[color] += ROOK_SEMI_MG;
                    eg[color] += ROOK_SEMI_EG;
                }
            }
        }

        if (bb_popcount(pos->pieces[BISHOP] & pos->colors[color]) >= 2) {
            mg[color] += BISHOP_PAIR_MG;
            eg[color] += BISHOP_PAIR_EG;
        }
    }

    /* King danger only really matters while there is material to attack with. */
    for (int color = WHITE; color <= BLACK; color++) {
        int n = king_attackers[color];
        if (n > 7) n = 7;
        mg[color] += king_attack_score[color] * KING_DANGER[n] / 400;
    }

    if (phase > PHASE_MAX) phase = PHASE_MAX;
    int mg_score = mg[WHITE] - mg[BLACK];
    int eg_score = eg[WHITE] - eg[BLACK];
    int score = (mg_score * phase + eg_score * (PHASE_MAX - phase)) / PHASE_MAX;

    /* Scale down likely-drawn endgames with no pawns and little material. */
    if (!pos->pieces[PAWN] && phase <= 6) score /= 2;

    return (pos->side == WHITE ? score : -score) + TEMPO;
}

static Bitboard attackers_to(const Position *pos, int sq, Bitboard occ) {
    return (bb_pawn_attacks(BLACK, sq) & pos->pieces[PAWN] & pos->colors[WHITE]) |
           (bb_pawn_attacks(WHITE, sq) & pos->pieces[PAWN] & pos->colors[BLACK]) |
           (bb_knight_attacks(sq) & pos->pieces[KNIGHT]) |
           (bb_king_attacks(sq) & pos->pieces[KING]) |
           (bb_bishop_attacks(sq, occ) & (pos->pieces[BISHOP] | pos->pieces[QUEEN])) |
           (bb_rook_attacks(sq, occ) & (pos->pieces[ROOK] | pos->pieces[QUEEN]));
}

/* Static exchange evaluation: net material after the capture sequence on the
   destination square is played out with least-valuable-attacker ordering. */
int eval_see(const Position *pos, Move m) {
    int from = mv_from(m), to = mv_to(m);
    if (mv_flag(m) == FLAG_CASTLE) return 0;

    Bitboard occ = pos->colors[WHITE] | pos->colors[BLACK];
    int side = pos->side;
    int attacker = PIECE_TYPE(pos->board[from]);

    int gain[32];
    gain[0] = mv_flag(m) == FLAG_EP
                  ? SEE_VALUE[PAWN]
                  : (pos->board[to] == EMPTY ? 0 : SEE_VALUE[PIECE_TYPE(pos->board[to])]);
    if (mv_promo(m)) {
        gain[0] += SEE_VALUE[mv_promo(m)] - SEE_VALUE[PAWN];
        attacker = mv_promo(m);
    }

    if (mv_flag(m) == FLAG_EP) occ ^= 1ULL << (side == WHITE ? to - 8 : to + 8);
    occ ^= 1ULL << from;

    Bitboard attackers = attackers_to(pos, to, occ) & occ;
    side ^= 1;

    int d = 0;
    while (d < 31) {
        Bitboard side_attackers = attackers & pos->colors[side] & occ;
        if (!side_attackers) break;

        int pt = PAWN;
        Bitboard bb = 0;
        for (; pt <= KING; pt++) {
            bb = side_attackers & pos->pieces[pt];
            if (bb) break;
        }
        if (pt > KING) break;

        d++;
        gain[d] = SEE_VALUE[attacker] - gain[d - 1];
        int best = -gain[d - 1] > gain[d] ? -gain[d - 1] : gain[d];
        if (best < 0) break;

        occ ^= bb & (~bb + 1);
        attackers = attackers_to(pos, to, occ) & occ;
        attacker = pt;
        side ^= 1;
    }

    while (--d > 0) {
        int worse = -gain[d - 1] > gain[d] ? -gain[d - 1] : gain[d];
        gain[d - 1] = -worse;
    }
    return gain[0];
}
