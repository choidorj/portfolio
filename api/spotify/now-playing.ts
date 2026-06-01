import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spotifyFetch, type NowPlaying, type SpotifyTrack } from '../_lib/spotify.js'

type CurrentlyPlayingResponse = {
  is_playing: boolean
  item: SpotifyTrack | null
  progress_ms: number | null
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const data = await spotifyFetch<CurrentlyPlayingResponse>('/me/player/currently-playing')

    let payload: NowPlaying = null
    if (data && data.item) {
      payload = {
        isPlaying: data.is_playing,
        title: data.item.name,
        artist: data.item.artists.map((a) => a.name).join(', '),
        album: data.item.album.name,
        albumImageUrl: data.item.album.images[2]?.url ?? data.item.album.images[1]?.url ?? data.item.album.images[0]?.url ?? null,
        songUrl: data.item.external_urls.spotify,
        progressMs: data.progress_ms ?? 0,
        durationMs: data.item.duration_ms,
        fetchedAt: Date.now(),
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
    res.status(200).json(payload)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
