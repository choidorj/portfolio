import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spotifyFetch, parseLimit, parseTimeRange, type SpotifyArtist } from '../_lib/spotify.js'

type TopArtistsResponse = { items: SpotifyArtist[] }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const range = parseTimeRange(req.query.range)
    const limit = parseLimit(req.query.limit, 6)

    const data = await spotifyFetch<TopArtistsResponse>(
      `/me/top/artists?time_range=${range}&limit=${limit}`,
    )

    const items = (data?.items ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      // Spotify returns ~[640, 320, 160] for artists; pick the smallest
      // since these render in a 32px (64px retina) avatar.
      imageUrl: a.images?.[2]?.url ?? a.images?.[1]?.url ?? a.images?.[0]?.url ?? null,
      url: a.external_urls.spotify,
    }))

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ items })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
