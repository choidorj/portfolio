# chdrj

Personal portfolio. React 19 + Vite + TypeScript, deployed on Vercel.

## Stack

- **Frontend:** React 19, React Router 7, plain CSS with custom properties
- **API:** Vercel serverless functions in `api/` (Node runtime)
- **Hosting:** Vercel (auto-detects both the static frontend and `api/*.ts`)

## Local development

```bash
npm install
npm run dev          # Vite dev server (frontend only)
```

To run the API routes locally as well, use the Vercel CLI:

```bash
npm i -g vercel
vercel dev           # runs Vite + serverless functions with env vars pulled from Vercel
```

`vercel dev` will prompt you to link the project on first run, then it pulls
environment variables from your Vercel project. You can also create a local
`.env.local` if you prefer (it's gitignored).

## Spotify integration

The `/music` page and the homepage now-playing line call four serverless
endpoints under `/api/spotify/*`. All of them use a single long-lived refresh
token to talk to Spotify on your behalf, and the server caches the short-lived
access token in memory between requests. The refresh token never reaches the
browser.

### One-time setup

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard).
2. Add `http://127.0.0.1:8888/callback` as a Redirect URI in the app settings.
3. Copy the **Client ID** and **Client Secret**.
4. Run the helper script to obtain a refresh token:

   ```bash
   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/get-refresh-token.mjs
   ```

   It opens a browser, prompts you to log in to Spotify, and prints the refresh
   token to your terminal.

5. Add three environment variables to the Vercel project:

   ```bash
   vercel env add SPOTIFY_CLIENT_ID
   vercel env add SPOTIFY_CLIENT_SECRET
   vercel env add SPOTIFY_REFRESH_TOKEN
   ```

   (Or add them in the Vercel dashboard under Project Settings → Environment
   Variables. Apply to Production, Preview, and Development.)

6. For local development, run `vercel env pull .env.local` to sync them.

### Endpoints

| Path | Description | Cache |
|---|---|---|
| `GET /api/spotify/now-playing` | Current track or `null` | 30s |
| `GET /api/spotify/top-tracks?limit=10&range=short_term` | Your top tracks | 1h |
| `GET /api/spotify/top-artists?limit=6&range=short_term` | Your top artists | 1h |
| `GET /api/spotify/recently-played?limit=10` | Your last played tracks | 1m |

Time ranges: `short_term` (~4 weeks), `medium_term` (~6 months), `long_term` (years).
Unknown `range` values and out-of-range `limit` values fall back to the defaults above.

## Chess engine

`/chess` plays against a chess engine written from scratch in C (`engine/`),
compiled to WebAssembly and run in a Web Worker. There is no server component:
after the initial download the whole game runs in the tab.

The engine owns **every** chess rule — move generation, legality, castling, en
passant, promotion, SAN, threefold repetition, the fifty-move rule, insufficient
material. React only renders the state snapshots the engine hands back, so there
is no second rules implementation that can disagree with it.

### Layout

| Path | What it is |
|---|---|
| `engine/src/` | The engine. Bitboards, magic sliders, alpha-beta search, tapered eval. |
| `engine/src/wasm_api.c` | The browser entry point (the only frontend that ships). |
| `engine/src/uci.c` | A native UCI binary, used purely for testing and strength measurement. |
| `engine/tests/` | perft, self-play stress, WebAssembly smoke, browser end-to-end. |
| `public/engine/chess.{js,wasm}` | **Committed build output.** Vercel needs no C toolchain. |
| `public/pieces/` | Cburnett piece SVGs, used under the BSD option (see `LICENSE.txt` there). |
| `src/chess/` | Worker, hook, board and page. |

### Rebuilding the WebAssembly

The compiled artifacts are committed, so a normal `npm run build` and a Vercel
deploy never touch the C code. Rebuild only when `engine/src/` changes:

```bash
brew install emscripten     # one-time
npm run build:engine        # -> public/engine/chess.{js,wasm}
```

After rebuilding, bump `ENGINE_BUILD` in `src/chess/engine-protocol.ts` **and**
`ENGINE_VERSION` in `engine/src/wasm_api.c` together. The loader requests the
artifacts as `?v=<ENGINE_BUILD>`, which is what busts their immutable cache
headers; the worker refuses to start if the two numbers disagree.

### Tests

```bash
npm run test:engine    # perft + stress + wasm smoke

make -C engine test DEPTH=6   # exhaustive perft (~45s, 610M nodes)
make -C engine stress GAMES=3000

npm run preview &                      # the browser test needs a served build
node engine/tests/browser-smoke.mjs    # drives real Chrome over the DevTools protocol
```

`make test` is the gate that matters: it checks move generation against the
published node counts for six standard positions and verifies that incremental
Zobrist keys match recomputed ones. `make stress` plays random games and asserts
that undo restores state exactly, FEN round-trips, and no illegal move is ever
generated or accepted. `browser-smoke.mjs` loads the real built page in Chrome,
plays a move, and checks the board geometry, persistence, take-back and the
mobile layout — set `CHROME_PATH` if Chrome is somewhere unusual.

### Playing strength

Six levels, selectable on the page. Strength is limited primarily by a **node
cap** rather than a time limit, so the engine plays the same on a phone and on a
laptop — which is also what makes it measurable. Levels are then softened with
deterministic evaluation noise: the engine consistently believes its own wrong
assessment of a position rather than playing erratically.

Measured against Stockfish with `UCI_LimitStrength`, 110–120 games each:

| Level | Limits | Result | Approx. rating |
|---|---|---|---|
| 1 | depth 2, noise 300cp | 40.4% vs a level-2 reference | ~950 |
| 2 | 4k nodes, noise 380cp | 40.4% vs Elo 1320 | ~1250 |
| 3 | 12k nodes, noise 260cp | 26.8% vs Elo 1700 | ~1525 |
| 4 | 15k nodes, noise 150cp | 48.2% and 53.8% vs Elo 1700 | **~1700** (default) |
| 5 | 60k nodes, noise 45cp | 71.3% vs Elo 1900 | ~2050 |
| 6 | 3M nodes, no noise | 84.5% vs Elo 2000 at a weaker setting | full strength |

An earlier version also sampled among near-equal root moves. Getting comparable
scores for that meant giving up alpha-beta cutoffs at the root, which cost so
much search depth that level 4 measured ~1600 while only reaching depth 6, and
level 2 was effectively a depth-2 engine at ~880. Removing it was worth roughly
500–1000 Elo, so strength is now shaped by the node cap and noise alone.

To re-measure, play a level against Stockfish with its strength limiter on:

```bash
brew install stockfish
npm run calibrate               # full sweep, ~120 games per level
engine/scripts/calibrate.sh 4 1700 200   # one level, one anchor, 200 games
```

Tune the `LEVELS` table in `engine/src/game.c` from the results, and keep the
copy in `engine/src/uci.c` in sync (it exists so `setoption name Level` measures
exactly what the site plays).

Treat the numbers as ballpark. Stockfish's `UCI_Elo` is itself only accurate to
roughly ±100, and a rating means different things in different pools — 1700 on
Lichess, on Chess.com and on CCRL are not the same strength.

## Build

```bash
npm run build        # tsc -b && vite build (frontend only)
npm run preview      # preview the static build
```

Vercel handles `api/*.ts` separately during deploy &mdash; they are not part of
the local `npm run build`.
