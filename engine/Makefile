# Chess engine: builds a native UCI binary for testing/calibration, and the
# WebAssembly module the site actually ships.
#
#   make test       perft correctness gate
#   make stress     random self-play legality stress test
#   make uci        native UCI binary (build/chess-uci)
#   make wasm       public/engine/chess.{js,wasm}  (requires emcc)

CC      ?= cc
CFLAGS  ?= -O2 -std=c11 -Wall -Wextra -Wshadow
LDFLAGS ?= -lm

BUILD   := build
WEB_OUT := ../public/engine

BOARD := src/bitboard.c src/position.c src/movegen.c src/san.c
CORE  := $(BOARD) src/eval.c src/search.c src/book.c src/game.c

EMFLAGS := \
  -O3 -std=c11 -flto -DNDEBUG \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=worker \
  -sINITIAL_MEMORY=67108864 -sALLOW_MEMORY_GROWTH=0 -sSTACK_SIZE=1048576 \
  -sFILESYSTEM=0 -sASSERTIONS=0 -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString \
  -sEXPORTED_FUNCTIONS=_engine_init,_engine_new_game,_engine_set_fen,_engine_play_uci,_engine_undo,_engine_search,_engine_state_json,_engine_version,_malloc,_free

.PHONY: all test stress uci wasm wasmtest clean

all: uci

$(BUILD):
	@mkdir -p $(BUILD)

$(BUILD)/perft: $(BOARD) tests/perft.c | $(BUILD)
	$(CC) $(CFLAGS) -o $@ $(BOARD) tests/perft.c $(LDFLAGS)

$(BUILD)/stress: $(CORE) tests/stress.c | $(BUILD)
	$(CC) $(CFLAGS) -o $@ $(CORE) tests/stress.c $(LDFLAGS)

$(BUILD)/chess-uci: $(CORE) src/uci.c | $(BUILD)
	$(CC) $(CFLAGS) -o $@ $(CORE) src/uci.c $(LDFLAGS)

# Depth 5 by default: full coverage in a few seconds. `make test DEPTH=6` for
# the exhaustive run.
DEPTH ?= 5
test: $(BUILD)/perft
	@$(BUILD)/perft $(DEPTH)

GAMES ?= 2000
stress: $(BUILD)/stress
	@$(BUILD)/stress $(GAMES)

uci: $(BUILD)/chess-uci

wasm: $(CORE) src/wasm_api.c
	@mkdir -p $(WEB_OUT)
	emcc $(EMFLAGS) -o $(WEB_OUT)/chess.js $(CORE) src/wasm_api.c
	@ls -lh $(WEB_OUT)/chess.js $(WEB_OUT)/chess.wasm

clean:
	rm -rf $(BUILD)

# Same C, built for node, so the WebAssembly path can be exercised without a
# browser. Not shipped.
$(BUILD)/chess-node.mjs: $(CORE) src/wasm_api.c | $(BUILD)
	emcc $(EMFLAGS) -sENVIRONMENT=node -o $@ $(CORE) src/wasm_api.c

wasmtest: $(BUILD)/chess-node.mjs
	@node tests/wasm-smoke.mjs
