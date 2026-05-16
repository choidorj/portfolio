import { useEffect, useState } from 'react'
import type { Track, Artist } from './spotify-types'

type FetchState<T> = { data: T | null; loading: boolean; error: string | null }

function useFetch<T>(url: string): FetchState<T> {
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
    return () => {
      cancelled = true
    }
  }, [url])

  return { data, loading, error }
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
      <h2>recently played</h2>
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

export default function Music() {
  return (
    <div>
      <h1 className="page-title">music</h1>
      <p className="page-subtitle">what i&apos;ve been listening to lately.</p>

      <TopArtists />
      <TopTracks />
      <RecentlyPlayed />
    </div>
  )
}
