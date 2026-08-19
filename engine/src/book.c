/* A small opening book, purely so the bot does not play the same game every
   time. Lines are plain UCI move sequences matched against the game so far. */
#include "chess.h"

#include <string.h>

static const char *const BOOK[] = {
    /* Open games */
    "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7",
    "e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6",
    "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4 e5d4",
    "e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8c5 c2c3 d7d6",
    "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 b1c3 f8b4",
    "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5",
    "e2e4 e7e5 b1c3 g8f6 g1f3 b8c6 f1b5 f8b4 e1g1 e8g8",
    "e2e4 e7e5 f1c4 g8f6 d2d3 f8c5 g1f3 d7d6 c2c3 e8g8",

    /* Sicilian */
    "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6",
    "e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5",
    "e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 b8c6 b1c3 d8c7",
    "e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 d2d3 d7d6",
    "e2e4 c7c5 g1f3 d7d6 f1b5 c8d7 b5d7 d8d7 c2c4 b8c6",

    /* French, Caro-Kann, Scandinavian, Pirc */
    "e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7",
    "e2e4 e7e6 d2d4 d7d5 b1d2 c7c5 e4d5 e6d5 g1f3 b8c6",
    "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6",
    "e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6 f1e2 c6c5",
    "e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c7c6",
    "e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 g1f3 f8g7 f1e2 e8g8",
    "e2e4 g8f6 e4e5 f6d5 d2d4 d7d6 g1f3 g7g6 f1c4 d5b6",

    /* Queen's pawn */
    "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8",
    "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5",
    "d2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6 f1c4 c7c5",
    "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8",
    "d2d4 g8f6 c2c4 e7e6 g1f3 d7d5 b1c3 f8e7 c1g5 e8g8",
    "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5",
    "d2d4 g8f6 g1f3 g7g6 c1f4 f8g7 e2e3 e8g8 f1e2 d7d6",
    "d2d4 d7d5 g1f3 g8f6 c2c4 e7e6 b1c3 c7c6 e2e3 b8d7",

    /* English and flank */
    "c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5",
    "c2c4 g8f6 b1c3 e7e6 g1f3 d7d5 d2d4 f8e7 c1g5 e8g8",
    "g1f3 d7d5 d2d4 g8f6 c2c4 e7e6 b1c3 f8e7 c1g5 e8g8",
    "g1f3 g8f6 g2g3 g7g6 f1g2 f8g7 e1g1 e8g8 d2d4 d7d6",
};

#define BOOK_LEN (int)(sizeof(BOOK) / sizeof(BOOK[0]))

Move book_probe(Position *pos, const Move *history, int history_len) {
    if (history_len > 12) return MOVE_NONE;

    /* Rebuild the game so far as a UCI prefix. */
    char prefix[128];
    int n = 0;
    for (int i = 0; i < history_len; i++) {
        if (i) prefix[n++] = ' ';
        char uci[8];
        move_to_uci(history[i], uci);
        size_t len = strlen(uci);
        if (n + (int)len + 2 >= (int)sizeof(prefix)) return MOVE_NONE;
        memcpy(prefix + n, uci, len);
        n += (int)len;
    }
    prefix[n] = '\0';

    /* Collect every continuation; duplicates make popular moves more likely. */
    char candidates[BOOK_LEN][8];
    int count = 0;

    for (int i = 0; i < BOOK_LEN; i++) {
        const char *line = BOOK[i];
        if (n > 0) {
            if (strncmp(line, prefix, (size_t)n) != 0) continue;
            if (line[n] != ' ') continue;
        }
        const char *next = n > 0 ? line + n + 1 : line;
        const char *end = strchr(next, ' ');
        size_t len = end ? (size_t)(end - next) : strlen(next);
        if (len == 0 || len >= sizeof(candidates[0])) continue;
        memcpy(candidates[count], next, len);
        candidates[count][len] = '\0';
        count++;
    }

    if (count == 0) return MOVE_NONE;

    int pick = (int)(search_rand() % (uint64_t)count);
    return move_from_uci(pos, candidates[pick]);
}
