import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spotifyFetch, type NowPlaying, type SpotifyTrack } from '../_lib/spotify.js'

type CurrentlyPlayingResponse = {
  is_playing: boolean
  item: SpotifyTrack | null
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
      }
    }

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
    res.status(200).json(payload)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
