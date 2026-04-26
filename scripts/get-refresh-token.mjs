#!/usr/bin/env node
// One-time helper: walks through Spotify's OAuth flow and prints a refresh token.
//
// Usage:
//   1. Create a Spotify app at https://developer.spotify.com/dashboard
//   2. Add http://127.0.0.1:8888/callback as a Redirect URI
//   3. Run:
//        SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/get-refresh-token.mjs
//   4. A browser window opens. Log in and approve.
//   5. Copy the printed refresh_token into Vercel as SPOTIFY_REFRESH_TOKEN.
//
// You only need to run this once. The refresh token does not expire unless you
// revoke access in your Spotify account settings.

import http from 'node:http'
import { exec } from 'node:child_process'
import crypto from 'node:crypto'

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const PORT = 8888
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in env.')
  process.exit(1)
}

const SCOPES = [
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
].join(' ')

const state = crypto.randomBytes(8).toString('hex')

const authUrl =
  'https://accounts.spotify.com/authorize?' +
  new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
  }).toString()

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  if (url.pathname !== '/callback') {
    res.writeHead(404).end()
    return
  }

  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Missing ?code')
    return
  }
  if (returnedState !== state) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('State mismatch')
    return
  }

  try {
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      throw new Error(`Token exchange failed (${tokenRes.status}): ${text}`)
    }

    const tokens = await tokenRes.json()

    res.writeHead(200, { 'Content-Type': 'text/html' }).end(`
      <html><body style="font-family: system-ui; padding: 40px; max-width: 600px">
        <h1>All set</h1>
        <p>Check your terminal for the refresh token. You can close this tab.</p>
      </body></html>
    `)

    console.log('\n=== Spotify refresh token ===')
    console.log(tokens.refresh_token)
    console.log('=============================\n')
    console.log('Add this to Vercel as SPOTIFY_REFRESH_TOKEN:')
    console.log(`  vercel env add SPOTIFY_REFRESH_TOKEN`)
    console.log('  (paste the token above when prompted)\n')

    server.close(() => process.exit(0))
  } catch (err) {
    console.error(err)
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(err))
    server.close(() => process.exit(1))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Listening on ${REDIRECT_URI}`)
  console.log('Opening browser...')
  const opener =
    process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start ""'
    : 'xdg-open'
  exec(`${opener} "${authUrl}"`, (err) => {
    if (err) {
      console.log('\nCould not open browser automatically. Visit this URL manually:\n')
      console.log(authUrl, '\n')
    }
  })
})
