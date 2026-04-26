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

The `/spotify` page calls four serverless endpoints under `/api/spotify/*`. All
of them use a single long-lived refresh token to talk to Spotify on your behalf.
The refresh token never reaches the browser.

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

## Build

```bash
npm run build        # tsc -b && vite build (frontend only)
npm run preview      # preview the static build
```

Vercel handles `api/*.ts` separately during deploy &mdash; they are not part of
the local `npm run build`.
