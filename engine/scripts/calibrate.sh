#!/usr/bin/env bash
# Measures each playing level against Stockfish with its strength limiter on,
# and prints the score plus an Elo difference with a confidence interval.
#
# Stockfish's UCI_Elo is only an approximate anchor (roughly +/-100), and Elo
# scales differ between rating pools, so treat these as ballpark figures rather
# than exact ratings. Adjust the LEVELS table in engine/src/game.c (and the
# copy in engine/src/uci.c) until each level lands where you want it.
#
#   ./scripts/calibrate.sh              # default sweep
#   ./scripts/calibrate.sh 4 1700 200   # one level, one anchor, 200 games
set -euo pipefail

cd "$(dirname "$0")/.."

command -v stockfish >/dev/null || { echo "stockfish not found (brew install stockfish)"; exit 1; }
make --no-print-directory uci

GAMES=${3:-120}
MOVETIME=${MOVETIME:-300}
CONCURRENCY=${CONCURRENCY:-3}

run() {
  local level=$1 anchor=$2 games=$3
  echo
  echo "=== level $level  vs  stockfish UCI_Elo $anchor  ($games games) ==="
  node scripts/match.mjs \
    --a ./build/chess-uci --a-opt "Level=$level,OwnBook=false" \
    --b stockfish --b-opt "UCI_LimitStrength=true,UCI_Elo=$anchor" \
    --b-movetime "$MOVETIME" \
    --games "$games" --concurrency "$CONCURRENCY"
}

if [ $# -ge 2 ]; then
  run "$1" "$2" "$GAMES"
else
  # One anchor per level, spaced across the ladder.
  run 1 1320 "$GAMES"
  run 2 1320 "$GAMES"
  run 3 1500 "$GAMES"
  run 4 1700 "$GAMES"
  run 5 1900 "$GAMES"
  run 6 2200 "$GAMES"
fi
