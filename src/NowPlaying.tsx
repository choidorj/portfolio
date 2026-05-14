import { useEffect, useState } from 'react'

type NowPlayingResponse = {
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

type RecentlyPlayedResponse = {
  items: Array<{
    id: string
    title: string
    artist: string
    album: string
    albumImageUrl: string | null
    songUrl: string
    playedAt?: string
  }>
}

type TrackInfo = {
  title: string
  artist: string
  songUrl: string
}

type ChipState = {
  track: TrackInfo
  isLive: boolean
}

function useNowPlaying(): ChipState | null {
  const [state, setState] = useState<ChipState | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const npRes = await fetch('/api/spotify/now-playing')
        if (npRes.ok) {
          const np = (await npRes.json()) as NowPlayingResponse
          if (np && np.isPlaying) {
            if (!cancelled) {
              setState({
                track: { title: np.title, artist: np.artist, songUrl: np.songUrl },
                isLive: true,
              })
            }
            return
          }
        }

        const rpRes = await fetch('/api/spotify/recently-played?limit=1')
        if (rpRes.ok) {
          const rp = (await rpRes.json()) as RecentlyPlayedResponse
          const first = rp.items?.[0]
          if (first && !cancelled) {
            setState({
              track: { title: first.title, artist: first.artist, songUrl: first.songUrl },
              isLive: false,
            })
          }
        }
      } catch {
        // Silently fail — keep the hero clean when the API is unavailable.
      }
    }

    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return state
}

export default function NowPlaying() {
  const state = useNowPlaying()

  if (!state) return null

  const { track, isLive } = state
  const label = isLive ? 'Now listening' : 'Was last listening to'

  return (
    <a
      className={`hero-now-playing${isLive ? ' is-live' : ''}`}
      href={track.songUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label}: ${track.title} by ${track.artist}. Listen on Spotify.`}
    >
      <span className="hero-now-playing-label">{label}</span>
      <span className="hero-now-playing-row">
        <span className="hero-now-playing-icon" aria-hidden="true">
          {isLive ? (
            <span className="equalizer">
              <span />
              <span />
              <span />
            </span>
          ) : (
            <span className="hero-now-playing-dot" />
          )}
        </span>
        <span className="hero-now-playing-meta">
          <span className="hero-now-playing-track">{track.title}</span>
          <span className="hero-now-playing-dash" aria-hidden="true">—</span>
          <span className="hero-now-playing-artist">{track.artist}</span>
        </span>
      </span>
    </a>
  )
}
