/* Shared types and declarations for the whole engine. */
#ifndef CHESS_H
#define CHESS_H

#include <stdint.h>
#include <stddef.h>

enum { WHITE = 0, BLACK = 1, COLOR_NB = 2 };
enum { PAWN = 0, KNIGHT, BISHOP, ROOK, QUEEN, KING, PIECE_TYPE_NB };
enum { EMPTY = 12 };

/* Castling rights bitmask. */
enum { CASTLE_WK = 1, CASTLE_WQ = 2, CASTLE_BK = 4, CASTLE_BQ = 8 };

/* Move flags (2 bits). */
enum { FLAG_NORMAL = 0, FLAG_EP = 1, FLAG_CASTLE = 2, FLAG_DPUSH = 3 };

#define MAX_MOVES 256
#define MAX_PLY 128
#define MAX_HIST 1024

#define PIECE_MAKE(c, pt) ((c) * 6 + (pt))
#define PIECE_COLOR(p) ((p) / 6)
#define PIECE_TYPE(p) ((p) % 6)

#define RANK_OF(sq) ((sq) >> 3)
#define FILE_OF(sq) ((sq) & 7)
#define SQUARE(r, f) (((r) << 3) | (f))

typedef uint64_t Bitboard;

/* from:0-5  to:6-11  promo:12-14 (0 none, else piece type)  flag:15-16 */
typedef uint32_t Move;
#define MOVE_NONE 0u
#define mv_make(from, to, promo, flag) \
    ((Move)((uint32_t)(from) | ((uint32_t)(to) << 6) | ((uint32_t)(promo) << 12) | ((uint32_t)(flag) << 15)))
#define mv_from(m) ((int)((m) & 63u))
#define mv_to(m) ((int)(((m) >> 6) & 63u))
#define mv_promo(m) ((int)(((m) >> 12) & 7u))
#define mv_flag(m) ((int)(((m) >> 15) & 3u))

typedef struct {
    Bitboard pieces[PIECE_TYPE_NB]; /* by type, both colors */
    Bitboard colors[COLOR_NB];
    uint8_t board[64]; /* piece code 0..11, or EMPTY */
    uint8_t side;
    uint8_t castling;
    int8_t ep; /* en-passant target square, -1 if none */
    uint16_t halfmove;
    uint16_t fullmove;
    uint64_t key;
    /* Zobrist keys of every position reached, for repetition detection. */
    uint64_t hist[MAX_HIST];
    int hist_count;
} Position;

typedef struct {
    Move move;
    uint8_t captured;
    uint8_t castling;
    int8_t ep;
    uint16_t halfmove;
    uint64_t key;
} Undo;

typedef struct {
    Move moves[MAX_MOVES];
    int count;
} MoveList;

/* Game result codes. */
enum {
    RESULT_NONE = 0,
    RESULT_CHECKMATE,
    RESULT_STALEMATE,
    RESULT_FIFTY,
    RESULT_REPETITION,
    RESULT_MATERIAL
};

/* --- bitboard.c --- */
void bb_init(void);
Bitboard bb_knight_attacks(int sq);
Bitboard bb_king_attacks(int sq);
Bitboard bb_pawn_attacks(int color, int sq);
Bitboard bb_bishop_attacks(int sq, Bitboard occ);
Bitboard bb_rook_attacks(int sq, Bitboard occ);
Bitboard bb_queen_attacks(int sq, Bitboard occ);
Bitboard bb_between(int a, int b);
Bitboard bb_line(int a, int b);

static inline int bb_popcount(Bitboard b) { return __builtin_popcountll(b); }
static inline int bb_lsb(Bitboard b) { return __builtin_ctzll(b); }
static inline int bb_pop_lsb(Bitboard *b) {
    int sq = __builtin_ctzll(*b);
    *b &= *b - 1;
    return sq;
}

/* --- position.c --- */
void pos_init_zobrist(void);
uint64_t pos_compute_key(const Position *pos);
int pos_set_fen(Position *pos, const char *fen);
void pos_get_fen(const Position *pos, char *out, size_t cap);
void pos_start(Position *pos);
int pos_attacked_by(const Position *pos, int sq, int by_color);
int pos_in_check(const Position *pos, int color);
int pos_king_square(const Position *pos, int color);
/* Returns 0 and leaves the position untouched if the move is illegal. */
int pos_do_move(Position *pos, Move m, Undo *u);
void pos_undo_move(Position *pos, Move m, const Undo *u);
void pos_do_null(Position *pos, Undo *u);
void pos_undo_null(Position *pos, const Undo *u);
int pos_is_repetition(const Position *pos, int ply);
int pos_insufficient_material(const Position *pos);
int pos_has_non_pawn_material(const Position *pos, int color);

/* --- movegen.c --- */
void gen_pseudo(const Position *pos, MoveList *list);
void gen_pseudo_captures(const Position *pos, MoveList *list);
void gen_legal(Position *pos, MoveList *list);
int move_is_pseudo_legal(const Position *pos, Move m);

/* --- san.c --- */
void move_to_uci(Move m, char *out);
Move move_from_uci(Position *pos, const char *uci);
void move_to_san(Position *pos, Move m, char *out);

/* --- eval.c --- */
void eval_init(void);
int evaluate(const Position *pos);
int eval_see(const Position *pos, Move m);

/* --- search.c --- */
typedef struct {
    int max_depth;
    uint64_t max_nodes;
    int max_time_ms;
    /* Evaluation jitter, in centipawns. Deterministic per position within a
       search, so the engine consistently believes its own wrong assessment
       rather than behaving erratically. This is what makes the weaker levels
       weak: the search itself stays honest. */
    int noise_cp;
} SearchLimits;

typedef struct {
    Move best;
    int score;
    int depth;
    uint64_t nodes;
    int time_ms;
    Move pv[MAX_PLY];
    int pv_len;
} SearchResult;

void search_init(int tt_mb);
void search_new_game(void);
void search_set_seed(uint64_t seed);
uint64_t search_rand(void);
void search_run(Position *pos, const SearchLimits *limits, SearchResult *result);
/* Implemented per-frontend: called after each completed iteration. */
void search_report(const Position *pos, const SearchResult *r);

/* --- book.c --- */
Move book_probe(Position *pos, const Move *history, int history_len);

/* --- game.c --- */
void game_init(int tt_mb, uint64_t seed);
void game_new(void);
int game_set_fen(const char *fen);
int game_play_uci(const char *uci);
int game_undo(int plies);
int game_result(void);
Move game_search(int level);
/* Whether the last game_search answer came from the opening book. */
int game_last_was_book(void);
Position *game_position(void);
const char *game_state_json(void);
int game_history_len(void);

#endif /* CHESS_H */
