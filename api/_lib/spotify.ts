// Shared Spotify helpers used by every /api/spotify/* function.
// Filenames starting with "_" are ignored by Vercel's filesystem router,
// so this is not exposed as an HTTP endpoint.

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'
const API_BASE = 'https://api.spotify.com/v1'

type Env = {
  SPOTIFY_CLIENT_ID: string
  SPOTIFY_CLIENT_SECRET: string
  SPOTIFY_REFRESH_TOKEN: string
}

function getEnv(): Env {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    throw new Error(
      'Missing Spotify env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN',
    )
  }
  return { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN }
}

async function getAccessToken(): Promise<string> {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = getEnv()
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Spotify token refresh failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as { access_token: string }
  return json.access_token
}

export async function spotifyFetch<T = unknown>(path: string): Promise<T | null> {
  const token = await getAccessToken()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  // 204 No Content => nothing playing right now (now-playing endpoint)
  if (res.status === 204) return null

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Spotify request failed ${path} (${res.status}): ${text}`)
  }

  return (await res.json()) as T
}

export type SpotifyImage = { url: string; height: number; width: number }

export type SpotifyArtist = {
  id: string
  name: string
  external_urls: { spotify: string }
  images?: SpotifyImage[]
  genres?: string[]
}

export type SpotifyTrack = {
  id: string
  name: string
  external_urls: { spotify: string }
  artists: { id: string; name: string }[]
  album: { name: string; images: SpotifyImage[] }
  duration_ms: number
}

export type NowPlaying = {
  isPlaying: boolean
  title: string
  artist: string
  album: string
  albumImageUrl: string | null
  songUrl: string
  progressMs: number
  durationMs: number
  fetchedAt: number
} | null
