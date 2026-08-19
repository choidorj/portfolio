/* Native UCI front end. Not shipped to the browser: it exists so the engine
   can be played against reference engines to measure its strength. */
#include "chess.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define ENGINE_NAME "chdrj"
#define ENGINE_VERSION "1.0"

static int option_level = 0; /* 0 = obey the `go` limits verbatim */
static int option_book = 1;
static int option_hash = 64;
static int option_noise = 0; /* only used when Level is 0, for tuning sweeps */

/* Must mirror LEVELS in game.c, so `setoption name Level` measures exactly what
   the website plays. */
static const SearchLimits LEVELS[] = {
    {2, 200000, 1000, 300},
    {32, 4000, 1000, 380},
    {32, 12000, 1500, 260},
    {32, 15000, 1500, 150},
    {32, 60000, 2500, 45},
    {40, 3000000, 6000, 0},
};
#define LEVEL_COUNT (int)(sizeof(LEVELS) / sizeof(LEVELS[0]))

void search_report(const Position *position, const SearchResult *r) {
    (void)position;
    int nps = r->time_ms > 0 ? (int)(r->nodes * 1000 / (uint64_t)r->time_ms) : 0;

    printf("info depth %d ", r->depth);
    if (r->score > 29000) printf("score mate %d ", (30000 - r->score + 1) / 2);
    else if (r->score < -29000) printf("score mate %d ", -(30000 + r->score + 1) / 2);
    else printf("score cp %d ", r->score);
    printf("nodes %llu nps %d time %d pv", (unsigned long long)r->nodes, nps, r->time_ms);

    for (int i = 0; i < r->pv_len; i++) {
        char uci[8];
        move_to_uci(r->pv[i], uci);
        printf(" %s", uci);
    }
    printf("\n");
    fflush(stdout);
}

static char *skip_token(char *s) {
    while (*s && *s != ' ') s++;
    while (*s == ' ') s++;
    return s;
}

static void handle_position(char *args) {
    char *moves = strstr(args, "moves");

    if (strncmp(args, "startpos", 8) == 0) {
        game_new();
    } else if (strncmp(args, "fen", 3) == 0) {
        char fen[256];
        char *start = skip_token(args);
        size_t len = moves ? (size_t)(moves - start) : strlen(start);
        if (len >= sizeof(fen)) len = sizeof(fen) - 1;
        memcpy(fen, start, len);
        fen[len] = '\0';
        if (!game_set_fen(fen)) game_new();
    } else {
        return;
    }

    if (!moves) return;
    char *token = skip_token(moves);
    while (*token) {
        char uci[8];
        int i = 0;
        while (token[i] && token[i] != ' ' && i < 7) {
            uci[i] = token[i];
            i++;
        }
        uci[i] = '\0';
        if (i == 0) break;
        game_play_uci(uci);
        token += i;
        while (*token == ' ') token++;
    }
}

static int parse_int(const char *args, const char *key, int fallback) {
    const char *found = strstr(args, key);
    if (!found) return fallback;
    return atoi(found + strlen(key));
}

static void handle_go(char *args) {
    Position *pos = game_position();
    SearchLimits limits;

    if (option_level > 0) {
        limits = LEVELS[option_level - 1];
    } else {
        limits.max_depth = parse_int(args, "depth ", 0);
        limits.max_nodes = (uint64_t)parse_int(args, "nodes ", 0);
        limits.max_time_ms = parse_int(args, "movetime ", 0);
        limits.noise_cp = option_noise;

        if (!limits.max_time_ms && !limits.max_nodes && !limits.max_depth) {
            int time_left = parse_int(args, pos->side == WHITE ? "wtime " : "btime ", 0);
            int increment = parse_int(args, pos->side == WHITE ? "winc " : "binc ", 0);
            int moves_to_go = parse_int(args, "movestogo ", 0);
            if (time_left > 0) {
                int divisor = moves_to_go > 0 ? moves_to_go + 2 : 30;
                limits.max_time_ms = time_left / divisor + increment / 2;
                if (limits.max_time_ms > time_left / 4) limits.max_time_ms = time_left / 4;
                if (limits.max_time_ms < 10) limits.max_time_ms = 10;
            } else {
                limits.max_depth = 8;
            }
        }
    }

    Move best = MOVE_NONE;
    if (option_book && option_level >= 3) {
        /* game.c owns the move history the book matches against. */
        best = game_search(option_level);
    } else {
        SearchResult result;
        search_run(pos, &limits, &result);
        best = result.best;
    }

    char uci[8];
    move_to_uci(best, uci);
    printf("bestmove %s\n", uci);
    fflush(stdout);
}

static void handle_setoption(char *args) {
    char *name = strstr(args, "name ");
    char *value = strstr(args, "value ");
    if (!name || !value) return;
    name += 5;
    int v = atoi(value + 6);

    if (strncmp(name, "Level", 5) == 0) {
        option_level = v < 0 ? 0 : (v > LEVEL_COUNT ? LEVEL_COUNT : v);
    } else if (strncmp(name, "Hash", 4) == 0) {
        option_hash = v < 1 ? 1 : v;
        search_init(option_hash);
    } else if (strncmp(name, "Noise", 5) == 0) {
        option_noise = v < 0 ? 0 : v;
    } else if (strncmp(name, "OwnBook", 7) == 0) {
        option_book = strstr(value, "true") != NULL;
    }
}

int main(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
    game_init(option_hash, 0x2545F4914F6CDD1DULL);

    char line[65536];
    while (fgets(line, sizeof(line), stdin)) {
        size_t len = strlen(line);
        while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r')) line[--len] = '\0';

        if (strcmp(line, "uci") == 0) {
            printf("id name %s %s\n", ENGINE_NAME, ENGINE_VERSION);
            printf("id author choidorj\n");
            printf("option name Hash type spin default 64 min 1 max 1024\n");
            printf("option name Level type spin default 0 min 0 max %d\n", LEVEL_COUNT);
            printf("option name Noise type spin default 0 min 0 max 800\n");
            printf("option name OwnBook type check default true\n");
            printf("uciok\n");
        } else if (strcmp(line, "isready") == 0) {
            printf("readyok\n");
        } else if (strcmp(line, "ucinewgame") == 0) {
            game_new();
        } else if (strncmp(line, "position", 8) == 0) {
            handle_position(skip_token(line));
        } else if (strncmp(line, "go", 2) == 0) {
            handle_go(line);
        } else if (strncmp(line, "setoption", 9) == 0) {
            handle_setoption(line);
        } else if (strcmp(line, "state") == 0) {
            /* Not part of UCI. The match runner uses it as an arbiter, so game
               results come from the same rules code perft validates. */
            printf("%s\n", game_state_json());
        } else if (strcmp(line, "quit") == 0) {
            break;
        }
        fflush(stdout);
    }
    return 0;
}
