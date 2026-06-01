import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spotifyFetch, type SpotifyTrack } from '../_lib/spotify.js'

type RecentlyPlayedResponse = {
  items: { track: SpotifyTrack; played_at: string }[]
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50)

    const data = await spotifyFetch<RecentlyPlayedResponse>(
      `/me/player/recently-played?limit=${limit}`,
    )

    const items = (data?.items ?? []).map(({ track, played_at }) => ({
      id: track.id,
      title: track.name,
      artist: track.artists.map((a) => a.name).join(', '),
      album: track.album.name,
      albumImageUrl: track.album.images[2]?.url ?? track.album.images[1]?.url ?? track.album.images[0]?.url ?? null,
      songUrl: track.external_urls.spotify,
      playedAt: played_at,
    }))

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    res.status(200).json({ items })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
