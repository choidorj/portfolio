/* WebAssembly front end. Every chess rule stays on this side of the boundary;
   the browser only renders the snapshots this module hands back. */
#include "chess.h"

#include <emscripten.h>

#define ENGINE_VERSION 1

/* Search progress is pushed straight to the main thread. postMessage works
   even while the worker's event loop is blocked inside the search. */
EM_JS(void, post_info, (int depth, int score, int is_mate, double nodes, int nps, int time_ms,
                        const char *pv),
      {
          self.postMessage({
              type : 'info',
              depth : depth,
              score : score,
              mate : !!is_mate,
              nodes : nodes,
              nps : nps,
              time : time_ms,
              pv : UTF8ToString(pv)
          });
      });

void search_report(const Position *pos, const SearchResult *r) {
    (void)pos;

    char pv[MAX_PLY * 8];
    int n = 0;
    for (int i = 0; i < r->pv_len && n + 8 < (int)sizeof(pv); i++) {
        if (i) pv[n++] = ' ';
        char uci[8];
        move_to_uci(r->pv[i], uci);
        for (int j = 0; uci[j]; j++) pv[n++] = uci[j];
    }
    pv[n] = '\0';

    int is_mate = r->score > 29000 || r->score < -29000;
    int score = r->score;
    if (is_mate) score = score > 0 ? (30000 - score + 1) / 2 : -(30000 + score + 1) / 2;

    int nps = r->time_ms > 0 ? (int)(r->nodes * 1000 / (uint64_t)r->time_ms) : 0;
    post_info(r->depth, score, is_mate, (double)r->nodes, nps, r->time_ms, pv);
}

EMSCRIPTEN_KEEPALIVE
void engine_init(unsigned seed, int tt_mb) {
    game_init(tt_mb > 0 ? tt_mb : 16, seed ? (uint64_t)seed * 0x9E3779B97F4A7C15ULL : 1);
}

EMSCRIPTEN_KEEPALIVE
void engine_new_game(void) { game_new(); }

EMSCRIPTEN_KEEPALIVE
int engine_set_fen(const char *fen) { return game_set_fen(fen); }

EMSCRIPTEN_KEEPALIVE
int engine_play_uci(const char *uci) { return game_play_uci(uci); }

EMSCRIPTEN_KEEPALIVE
int engine_undo(int plies) { return game_undo(plies); }

/* Book moves skip the search entirely, so report them explicitly rather than
   leaving the info stream blank for the whole opening. */
EM_JS(void, post_book_info, (const char *move), {
    self.postMessage({
        type : 'info',
        depth : 0,
        score : 0,
        mate : false,
        nodes : 0,
        nps : 0,
        time : 0,
        pv : UTF8ToString(move),
        book : true
    });
});

EMSCRIPTEN_KEEPALIVE
const char *engine_search(int level) {
    static char buffer[8];
    move_to_uci(game_search(level), buffer);
    if (game_last_was_book()) post_book_info(buffer);
    return buffer;
}

EMSCRIPTEN_KEEPALIVE
const char *engine_state_json(void) { return game_state_json(); }

EMSCRIPTEN_KEEPALIVE
int engine_version(void) { return ENGINE_VERSION; }
