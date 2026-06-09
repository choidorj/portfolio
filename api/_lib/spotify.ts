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

// Cache the access token in module scope. Vercel reuses warm function
// instances, so this survives across invocations and avoids a token refresh
// round-trip on every request. Tokens last ~1h; refresh slightly early so we
// never use one that expires mid-request.
let cachedToken: { value: string; expiresAt: number } | null = null
const TOKEN_EXPIRY_BUFFER_MS = 60_000

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value
  }

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

  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000 - TOKEN_EXPIRY_BUFFER_MS,
  }
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

export type TimeRange = 'short_term' | 'medium_term' | 'long_term'
const TIME_RANGES: TimeRange[] = ['short_term', 'medium_term', 'long_term']

// Whitelist the Spotify time_range param; fall back to short_term for anything
// unexpected (missing, array, or invalid value).
export function parseTimeRange(value: unknown): TimeRange {
  return typeof value === 'string' && (TIME_RANGES as string[]).includes(value)
    ? (value as TimeRange)
    : 'short_term'
}

// Clamp the limit to Spotify's accepted 1..50 range, falling back when the
// value is missing, non-numeric, or out of bounds.
export function parseLimit(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, 50)
}

export type SpotifyImage = { url: string; height: number; width: number }

export type SpotifyArtist = {
  id: string
  name: string
  external_urls: { spotify: string }
  images?: SpotifyImage[]
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
} | null
