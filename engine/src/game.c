/* Game layer: owns the position, the move history, and the JSON snapshot the
   web UI renders from. All chess rules live behind this boundary. */
#include "chess.h"

#include <stdio.h>
#include <string.h>

static Position pos;
static Move history_moves[MAX_HIST];
static Undo history_undos[MAX_HIST];
static char history_san[MAX_HIST][12];
static int history_len;
static int last_was_book;
/* The book is matched by move prefix, so it is only meaningful when the game
   actually began from the standard starting position. */
static int from_start_position;

/* Level 1 is a beginner; level 6 is the engine at full strength.
   { max_depth, max_nodes, max_time_ms, noise_cp }

   The node cap is the primary knob, so the engine plays identically on a phone
   and on a laptop -- which is also what makes a level measurable. The time cap
   is only a safety net for very slow devices. Level 1 is depth-capped instead,
   because being unable to see two moves ahead is what a beginner looks like.

   Measured against Stockfish with UCI_LimitStrength (engine/scripts/calibrate.sh):
   roughly 950, 1250, 1525, 1700, 2050, and full strength. Levels 2-5 were
   measured directly; re-run the calibration if you change any of this. */
static const SearchLimits LEVELS[] = {
    {2, 200000, 1000, 300},
    {32, 4000, 1000, 380},
    {32, 12000, 1500, 260},
    {32, 15000, 1500, 150},
    {32, 60000, 2500, 45},
    {40, 3000000, 6000, 0},
};
#define LEVEL_COUNT (int)(sizeof(LEVELS) / sizeof(LEVELS[0]))

Position *game_position(void) { return &pos; }
int game_history_len(void) { return history_len; }
int game_last_was_book(void) { return last_was_book; }

void game_init(int tt_mb, uint64_t seed) {
    bb_init();
    pos_init_zobrist();
    eval_init();
    search_init(tt_mb);
    search_set_seed(seed);
    game_new();
}

#define START_FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

void game_new(void) {
    pos_start(&pos);
    history_len = 0;
    from_start_position = 1;
    search_new_game();
}

static uint64_t start_position_key(void) {
    Position start;
    pos_set_fen(&start, START_FEN);
    return start.key;
}

int game_set_fen(const char *fen) {
    Position candidate;
    if (!pos_set_fen(&candidate, fen)) return 0;
    pos = candidate;
    history_len = 0;
    from_start_position = candidate.key == start_position_key();
    search_new_game();
    return 1;
}

int game_play_uci(const char *uci) {
    if (history_len >= MAX_HIST - 4) return 0;

    Move m = move_from_uci(&pos, uci);
    if (m == MOVE_NONE) return 0;

    /* SAN has to be produced before the move is made. */
    char san[12];
    move_to_san(&pos, m, san);

    Undo u;
    if (!pos_do_move(&pos, m, &u)) return 0;

    history_moves[history_len] = m;
    history_undos[history_len] = u;
    memcpy(history_san[history_len], san, sizeof(san));
    history_len++;
    return 1;
}

int game_undo(int plies) {
    int undone = 0;
    while (undone < plies && history_len > 0) {
        history_len--;
        pos_undo_move(&pos, history_moves[history_len], &history_undos[history_len]);
        undone++;
    }
    return undone;
}

int game_result(void) {
    MoveList legal;
    gen_legal(&pos, &legal);
    if (legal.count == 0) return pos_in_check(&pos, pos.side) ? RESULT_CHECKMATE : RESULT_STALEMATE;
    if (pos.halfmove >= 100) return RESULT_FIFTY;
    if (pos_insufficient_material(&pos)) return RESULT_MATERIAL;
    if (pos_is_repetition(&pos, 0)) return RESULT_REPETITION;
    return RESULT_NONE;
}

Move game_search(int level) {
    if (level < 1) level = 1;
    if (level > LEVEL_COUNT) level = LEVEL_COUNT;

    last_was_book = 0;
    if (game_result() != RESULT_NONE) return MOVE_NONE;

    /* Book moves keep the openings varied; only used at full-ish strength
       levels so the weak levels still play their own (worse) ideas. */
    if (level >= 3 && from_start_position) {
        Move book = book_probe(&pos, history_moves, history_len);
        if (book != MOVE_NONE) {
            last_was_book = 1;
            return book;
        }
    }

    SearchResult result;
    search_run(&pos, &LEVELS[level - 1], &result);

    /* Never hand back a move the position does not actually allow. */
    MoveList legal;
    gen_legal(&pos, &legal);
    for (int i = 0; i < legal.count; i++)
        if (legal.moves[i] == result.best) return result.best;

    return legal.count ? legal.moves[0] : MOVE_NONE;
}

static const char *RESULT_NAMES[] = {"none",       "checkmate",  "stalemate",
                                     "fifty",      "repetition", "material"};

static char json_buffer[48 * 1024];

const char *game_state_json(void) {
    char *out = json_buffer;
    size_t cap = sizeof(json_buffer);
    size_t n = 0;

    char fen[128];
    pos_get_fen(&pos, fen, sizeof(fen));

    /* Board as 64 characters in reading order: index 0 is a8, index 63 is h1. */
    static const char CHARS[] = "PNBRQKpnbrqk";
    char board[65];
    for (int rank = 7, i = 0; rank >= 0; rank--)
        for (int file = 0; file < 8; file++, i++) {
            int piece = pos.board[SQUARE(rank, file)];
            board[i] = piece == EMPTY ? '.' : CHARS[piece];
        }
    board[64] = '\0';

    int result = game_result();
    char last[8] = "";
    if (history_len > 0) move_to_uci(history_moves[history_len - 1], last);

    n += (size_t)snprintf(out + n, cap - n,
                          "{\"fen\":\"%s\",\"board\":\"%s\",\"turn\":\"%c\",\"check\":%s,"
                          "\"result\":\"%s\",\"winner\":%s,\"halfmove\":%d,\"fullmove\":%d,"
                          "\"ply\":%d,\"last\":%s%s%s,\"legal\":[",
                          fen, board, pos.side == WHITE ? 'w' : 'b',
                          pos_in_check(&pos, pos.side) ? "true" : "false", RESULT_NAMES[result],
                          result == RESULT_CHECKMATE ? (pos.side == WHITE ? "\"b\"" : "\"w\"")
                                                     : "null",
                          pos.halfmove, pos.fullmove, history_len, last[0] ? "\"" : "null",
                          last[0] ? last : "", last[0] ? "\"" : "");

    MoveList legal;
    gen_legal(&pos, &legal);
    for (int i = 0; i < legal.count && n + 16 < cap; i++) {
        char uci[8];
        move_to_uci(legal.moves[i], uci);
        n += (size_t)snprintf(out + n, cap - n, "%s\"%s\"", i ? "," : "", uci);
    }

    n += (size_t)snprintf(out + n, cap - n, "],\"san\":[");
    for (int i = 0; i < history_len && n + 24 < cap; i++)
        n += (size_t)snprintf(out + n, cap - n, "%s\"%s\"", i ? "," : "", history_san[i]);

    n += (size_t)snprintf(out + n, cap - n, "],\"moves\":[");
    for (int i = 0; i < history_len && n + 16 < cap; i++) {
        char uci[8];
        move_to_uci(history_moves[i], uci);
        n += (size_t)snprintf(out + n, cap - n, "%s\"%s\"", i ? "," : "", uci);
    }

    snprintf(out + n, cap - n, "]}");
    return json_buffer;
}
