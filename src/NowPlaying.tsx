import { useEffect, useState } from 'react'
import TransitionLink from './TransitionLink'
import type { NowPlaying, Track } from './spotify-types'

type ChipState = {
  track: { title: string; artist: string }
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
          const np = (await npRes.json()) as NowPlaying
          if (np && np.isPlaying) {
            if (!cancelled) {
              setState({
                track: { title: np.title, artist: np.artist },
                isLive: true,
              })
            }
            return
          }
        }

        const rpRes = await fetch('/api/spotify/recently-played?limit=1')
        if (rpRes.ok) {
          const rp = (await rpRes.json()) as { items: Track[] }
          const first = rp.items?.[0]
          if (first && !cancelled) {
            setState({
              track: { title: first.title, artist: first.artist },
              isLive: false,
            })
          }
        }
      } catch {
        // Silently fail — keep the prose clean when the API is unavailable.
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

  // Fallback while data is unavailable: keep the inline entry-point to /spotify
  // alive so the homepage still has its "button inside the text".
  if (!state) {
    return (
      <p className="now-line">
        choi&apos;s{' '}
        <TransitionLink to="/spotify">spotify</TransitionLink>.
      </p>
    )
  }

  const { track, isLive } = state
  const label = isLive ? 'choi is listening to' : 'choi was last listening to'

  return (
    <p className={`now-line${isLive ? ' is-live' : ''}`}>
      {label}{' '}
      <TransitionLink to="/spotify" aria-label={`${label} ${track.title} by ${track.artist}`}>
        <span className="track">{track.title}</span>
        <span aria-hidden="true"> — </span>
        <span className="artist">{track.artist}</span>
      </TransitionLink>
      .
    </p>
  )
}
