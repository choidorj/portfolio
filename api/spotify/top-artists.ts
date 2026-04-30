import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spotifyFetch, type SpotifyArtist } from '../_lib/spotify.js'

type TopArtistsResponse = { items: SpotifyArtist[] }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const range = (req.query.range as string) ?? 'short_term' // short_term | medium_term | long_term
    const limit = Math.min(Number(req.query.limit) || 6, 50)

    const data = await spotifyFetch<TopArtistsResponse>(
      `/me/top/artists?time_range=${range}&limit=${limit}`,
    )

    const items = (data?.items ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      // Spotify typically returns [640, 300, 64]; pick the mid-size
      // so 100×100 retina cards render sharply without bandwidth bloat.
      imageUrl: a.images?.[1]?.url ?? a.images?.[0]?.url ?? null,
      genres: a.genres?.slice(0, 2) ?? [],
      url: a.external_urls.spotify,
    }))

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json({ items })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}
