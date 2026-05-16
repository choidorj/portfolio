import { useEffect, useRef, useState } from 'react'
import type { NowPlaying, Track, Artist } from './spotify-types'

type FetchState<T> = { data: T | null; loading: boolean; error: string | null }

function useFetch<T>(url: string, refreshMs?: number): FetchState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`request failed (${res.status})`)
        const json = (await res.json()) as T
        if (!cancelled) {
          setData(json)
          setError(null)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message)
          setLoading(false)
        }
      }
    }

    load()
    const interval = refreshMs ? setInterval(load, refreshMs) : null
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [url, refreshMs])

  return { data, loading, error }
}

function NowPlayingCard() {
  const { data, loading } = useFetch<NowPlaying>('/api/spotify/now-playing', 30_000)
  const fillRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fill = fillRef.current
    if (!fill || !data || !data.isPlaying || data.durationMs <= 0) return

    let raf = 0
    const tick = () => {
      const elapsed = Date.now() - data.fetchedAt
      const progress = Math.min(Math.max(data.progressMs + elapsed, 0), data.durationMs)
      fill.style.width = `${(progress / data.durationMs) * 100}%`
      if (progress < data.durationMs) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [data])

  return (
    <section className="spotify-section">
      <h2>now listening to</h2>
      {loading ? (
        <div className="now-playing now-playing--skeleton">
          <div className="now-playing-cover skeleton" />
          <div className="now-playing-meta">
            <div className="skeleton skeleton-line skeleton-line--lg" />
            <div className="skeleton skeleton-line skeleton-line--md" />
          </div>
        </div>
      ) : !data || !data.isPlaying ? (
        <div className="now-playing now-playing--idle">
          <div className="now-playing-meta">
            <span className="now-playing-title">not currently listening.</span>
            <span className="now-playing-artist">check back later :)</span>
          </div>
        </div>
      ) : (
        <a
          className="now-playing"
          href={data.songUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {data.albumImageUrl ? (
            <img className="now-playing-cover" src={data.albumImageUrl} alt={data.album} />
          ) : (
            <div className="now-playing-cover" />
          )}
          <div className="now-playing-meta">
            <span className="now-playing-title">{data.title}</span>
            <span className="now-playing-artist">{data.artist}</span>
          </div>
          {data.durationMs > 0 && (
            <div className="now-playing-progress" aria-hidden="true">
              <div ref={fillRef} className="now-playing-progress-fill" />
            </div>
          )}
        </a>
      )}
    </section>
  )
}

function TopArtists() {
  const { data, loading, error } = useFetch<{ items: Artist[] }>(
    '/api/spotify/top-artists?limit=8',
  )

  return (
    <section className="spotify-section">
      <h2>top artists</h2>
      {error ? (
        <Placeholder message={error} />
      ) : loading ? (
        <div className="artist-list">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="artist-row">
              <span className="track-number">{i + 1}</span>
              <div className="artist-img skeleton" />
              <div className="skeleton skeleton-line skeleton-line--md" />
            </div>
          ))}
        </div>
      ) : (
        <div className="artist-list">
          {(data?.items ?? []).map((a, i) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="artist-row"
            >
              <span className="track-number">{i + 1}</span>
              {a.imageUrl ? (
                <img className="artist-img" src={a.imageUrl} alt={a.name} />
              ) : (
                <div className="artist-img" />
              )}
              <span className="artist-name">{a.name}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

function TopTracks() {
  const { data, loading, error } = useFetch<{ items: Track[] }>(
    '/api/spotify/top-tracks?limit=5',
  )

  return (
    <section className="spotify-section">
      <h2>top tracks</h2>
      {error ? (
        <Placeholder message={error} />
      ) : loading ? (
        <TrackListSkeleton count={5} />
      ) : (
        <TrackList tracks={data?.items ?? []} />
      )}
    </section>
  )
}

function RecentlyPlayed() {
  const { data, loading, error } = useFetch<{ items: Track[] }>(
    '/api/spotify/recently-played?limit=5',
  )

  return (
    <section className="spotify-section">
      <h2>was last listening to</h2>
      {error ? (
        <Placeholder message={error} />
      ) : loading ? (
        <TrackListSkeleton count={5} />
      ) : (
        <TrackList tracks={data?.items ?? []} />
      )}
    </section>
  )
}

function TrackList({ tracks }: { tracks: Track[] }) {
  if (tracks.length === 0) {
    return <Placeholder message="nothing here yet." />
  }
  return (
    <div className="track-list">
      {tracks.map((t, i) => (
        <a
          key={`${t.id}-${i}`}
          href={t.songUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="track-item"
        >
          <span className="track-number">{i + 1}</span>
          {t.albumImageUrl ? (
            <img className="track-cover" src={t.albumImageUrl} alt={t.album} />
          ) : (
            <div className="track-cover" />
          )}
          <div className="track-info">
            <span className="track-title">{t.title}</span>
            <span className="track-dash" aria-hidden="true">—</span>
            <span className="track-artist">{t.artist}</span>
          </div>
        </a>
      ))}
    </div>
  )
}

function TrackListSkeleton({ count }: { count: number }) {
  return (
    <div className="track-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="track-item">
          <span className="track-number">{i + 1}</span>
          <div className="track-cover skeleton" />
          <div className="track-info">
            <div className="skeleton skeleton-line skeleton-line--lg" />
            <div className="skeleton skeleton-line skeleton-line--sm" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Placeholder({ message }: { message: string }) {
  return <div className="spotify-placeholder">{message}</div>
}

export default function Spotify() {
  return (
    <div>
      <h1 className="page-title">spotify</h1>
      <p className="page-subtitle">what i&apos;ve been listening to lately.</p>

      <NowPlayingCard />
      <TopArtists />
      <TopTracks />
      <RecentlyPlayed />
    </div>
  )
}
