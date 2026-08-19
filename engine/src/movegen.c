/* Pseudo-legal move generation. Legality is settled by pos_do_move, which
   rejects moves leaving the mover's king in check. */
#include "chess.h"

static inline void add_move(MoveList *list, Move m) {
    if (list->count < MAX_MOVES) list->moves[list->count++] = m;
}

static void add_pawn_move(MoveList *list, int from, int to, int promo_rank) {
    if (RANK_OF(to) == promo_rank) {
        add_move(list, mv_make(from, to, QUEEN, FLAG_NORMAL));
        add_move(list, mv_make(from, to, ROOK, FLAG_NORMAL));
        add_move(list, mv_make(from, to, BISHOP, FLAG_NORMAL));
        add_move(list, mv_make(from, to, KNIGHT, FLAG_NORMAL));
    } else {
        add_move(list, mv_make(from, to, 0, FLAG_NORMAL));
    }
}

static void gen_castles(const Position *pos, MoveList *list) {
    int us = pos->side, them = us ^ 1;
    Bitboard occ = pos->colors[WHITE] | pos->colors[BLACK];
    int rook = PIECE_MAKE(us, ROOK);

    if (us == WHITE) {
        if ((pos->castling & CASTLE_WK) && !(occ & 0x60ULL) && pos->board[7] == rook &&
            !pos_attacked_by(pos, 4, them) && !pos_attacked_by(pos, 5, them))
            add_move(list, mv_make(4, 6, 0, FLAG_CASTLE));
        if ((pos->castling & CASTLE_WQ) && !(occ & 0x0EULL) && pos->board[0] == rook &&
            !pos_attacked_by(pos, 4, them) && !pos_attacked_by(pos, 3, them))
            add_move(list, mv_make(4, 2, 0, FLAG_CASTLE));
    } else {
        if ((pos->castling & CASTLE_BK) && !(occ & 0x6000000000000000ULL) &&
            pos->board[63] == rook && !pos_attacked_by(pos, 60, them) &&
            !pos_attacked_by(pos, 61, them))
            add_move(list, mv_make(60, 62, 0, FLAG_CASTLE));
        if ((pos->castling & CASTLE_BQ) && !(occ & 0x0E00000000000000ULL) &&
            pos->board[56] == rook && !pos_attacked_by(pos, 60, them) &&
            !pos_attacked_by(pos, 59, them))
            add_move(list, mv_make(60, 58, 0, FLAG_CASTLE));
    }
}

static void gen_all(const Position *pos, MoveList *list, int captures_only) {
    list->count = 0;

    int us = pos->side, them = us ^ 1;
    Bitboard own = pos->colors[us];
    Bitboard enemies = pos->colors[them];
    Bitboard occ = own | enemies;
    Bitboard targets = captures_only ? enemies : ~own;

    int up = us == WHITE ? 8 : -8;
    int start_rank = us == WHITE ? 1 : 6;
    int promo_rank = us == WHITE ? 7 : 0;

    Bitboard pawns = pos->pieces[PAWN] & own;
    while (pawns) {
        int from = bb_pop_lsb(&pawns);
        int to = from + up;

        /* Quiet pushes; promotions count as noisy so quiescence sees them. */
        if (pos->board[to] == EMPTY) {
            if (!captures_only || RANK_OF(to) == promo_rank) add_pawn_move(list, from, to, promo_rank);
            if (!captures_only && RANK_OF(from) == start_rank && pos->board[to + up] == EMPTY)
                add_move(list, mv_make(from, to + up, 0, FLAG_DPUSH));
        }

        Bitboard attacks = bb_pawn_attacks(us, from);
        Bitboard caps = attacks & enemies;
        while (caps) add_pawn_move(list, from, bb_pop_lsb(&caps), promo_rank);

        if (pos->ep != -1 && (attacks & (1ULL << pos->ep)))
            add_move(list, mv_make(from, pos->ep, 0, FLAG_EP));
    }

    Bitboard knights = pos->pieces[KNIGHT] & own;
    while (knights) {
        int from = bb_pop_lsb(&knights);
        Bitboard attacks = bb_knight_attacks(from) & targets;
        while (attacks) add_move(list, mv_make(from, bb_pop_lsb(&attacks), 0, FLAG_NORMAL));
    }

    Bitboard bishops = pos->pieces[BISHOP] & own;
    while (bishops) {
        int from = bb_pop_lsb(&bishops);
        Bitboard attacks = bb_bishop_attacks(from, occ) & targets;
        while (attacks) add_move(list, mv_make(from, bb_pop_lsb(&attacks), 0, FLAG_NORMAL));
    }

    Bitboard rooks = pos->pieces[ROOK] & own;
    while (rooks) {
        int from = bb_pop_lsb(&rooks);
        Bitboard attacks = bb_rook_attacks(from, occ) & targets;
        while (attacks) add_move(list, mv_make(from, bb_pop_lsb(&attacks), 0, FLAG_NORMAL));
    }

    Bitboard queens = pos->pieces[QUEEN] & own;
    while (queens) {
        int from = bb_pop_lsb(&queens);
        Bitboard attacks = bb_queen_attacks(from, occ) & targets;
        while (attacks) add_move(list, mv_make(from, bb_pop_lsb(&attacks), 0, FLAG_NORMAL));
    }

    Bitboard kings = pos->pieces[KING] & own;
    while (kings) {
        int from = bb_pop_lsb(&kings);
        Bitboard attacks = bb_king_attacks(from) & targets;
        while (attacks) add_move(list, mv_make(from, bb_pop_lsb(&attacks), 0, FLAG_NORMAL));
    }

    if (!captures_only) gen_castles(pos, list);
}

void gen_pseudo(const Position *pos, MoveList *list) { gen_all(pos, list, 0); }
void gen_pseudo_captures(const Position *pos, MoveList *list) { gen_all(pos, list, 1); }

void gen_legal(Position *pos, MoveList *list) {
    MoveList pseudo;
    gen_pseudo(pos, &pseudo);

    list->count = 0;
    for (int i = 0; i < pseudo.count; i++) {
        Undo u;
        if (!pos_do_move(pos, pseudo.moves[i], &u)) continue;
        pos_undo_move(pos, pseudo.moves[i], &u);
        add_move(list, pseudo.moves[i]);
    }
}

/* Structural validation for moves arriving from outside the generator (the
   transposition table, or the UI). Cheap, and enough to keep pos_do_move safe. */
int move_is_pseudo_legal(const Position *pos, Move m) {
    if (m == MOVE_NONE) return 0;

    int from = mv_from(m), to = mv_to(m);
    if (from == to) return 0;

    int us = pos->side;
    int piece = pos->board[from];
    if (piece == EMPTY || PIECE_COLOR(piece) != us) return 0;

    int captured = pos->board[to];
    if (captured != EMPTY && PIECE_COLOR(captured) == us) return 0;

    int pt = PIECE_TYPE(piece);
    int promo = mv_promo(m);
    int promo_rank = us == WHITE ? 7 : 0;
    if (promo && (pt != PAWN || RANK_OF(to) != promo_rank)) return 0;
    if (!promo && pt == PAWN && RANK_OF(to) == promo_rank) return 0;
    if (promo && (promo < KNIGHT || promo > QUEEN)) return 0;

    int up = us == WHITE ? 8 : -8;

    switch (mv_flag(m)) {
        case FLAG_EP:
            return pt == PAWN && pos->ep == to && captured == EMPTY &&
                   (bb_pawn_attacks(us, from) & (1ULL << to)) != 0;
        case FLAG_CASTLE: {
            MoveList castles;
            castles.count = 0;
            gen_castles(pos, &castles);
            for (int i = 0; i < castles.count; i++)
                if (castles.moves[i] == m) return 1;
            return 0;
        }
        case FLAG_DPUSH:
            return pt == PAWN && RANK_OF(from) == (us == WHITE ? 1 : 6) &&
                   to == from + 2 * up && captured == EMPTY && pos->board[from + up] == EMPTY;
        default: break;
    }

    if (pt == PAWN) {
        if (to == from + up) return captured == EMPTY;
        return captured != EMPTY && (bb_pawn_attacks(us, from) & (1ULL << to)) != 0;
    }

    Bitboard occ = pos->colors[WHITE] | pos->colors[BLACK];
    Bitboard attacks;
    switch (pt) {
        case KNIGHT: attacks = bb_knight_attacks(from); break;
        case BISHOP: attacks = bb_bishop_attacks(from, occ); break;
        case ROOK: attacks = bb_rook_attacks(from, occ); break;
        case QUEEN: attacks = bb_queen_attacks(from, occ); break;
        default: attacks = bb_king_attacks(from); break;
    }
    return (attacks & (1ULL << to)) != 0;
}
