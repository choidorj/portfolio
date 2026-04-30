import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spotifyFetch, type SpotifyTrack } from '../_lib/spotify.js'

type TopTracksResponse = { items: SpotifyTrack[] }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const range = (req.query.range as string) ?? 'short_term' // short_term | medium_term | long_term
    const limit = Math.min(Number(req.query.limit) || 10, 50)

    const data = await spotifyFetch<TopTracksResponse>(
      `/me/top/tracks?time_range=${range}&limit=${limit}`,
    )

    const items = (data?.items ?? []).map((t) => ({
      id: t.id,
      title: t.name,
      artist: t.artists.map((a) => a.name).join(', '),
      album: t.album.name,
      albumImageUrl: t.album.images[1]?.url ?? t.album.images[0]?.url ?? null,
      songUrl: t.external_urls.spotify,
    }))

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ items })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
