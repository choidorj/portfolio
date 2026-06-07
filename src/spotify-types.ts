// Shape of the JSON payloads returned by /api/spotify/* — shared between
// the homepage NowPlaying line and the /music page.

export type NowPlaying = {
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

export type Track = {
  id: string
  title: string
  artist: string
  album: string
  albumImageUrl: string | null
  songUrl: string
  playedAt?: string
}

export type Artist = {
  id: string
  name: string
  imageUrl: string | null
  url: string
}
