export interface StreamCandidate {
  url: string
  quality: '4k' | '1080p' | '720p' | '480p' | 'unknown'
  source: 'bluray' | 'web-dl' | 'webrip' | 'hdtv' | 'unknown'
  codec: 'av1' | 'hevc' | 'h264' | 'unknown'
}

export interface Episode {
  season: number
  episode: number
  title: string
  runtime?: number
}

export interface Season {
  seasonNumber: number
  episodeCount: number
  episodes: Episode[]
}

export interface Show {
  imdbId: string
  title: string
  overview: string
  posterPath?: string
  backdropPath?: string
  firstAirDate: string
  genres: string[]
  seasons: Season[]
}

export interface Movie {
  imdbId: string
  title: string
  overview: string
  posterPath?: string
  backdropPath?: string
  releaseDate: string
  genres: string[]
  runtime?: number
}

export type MediaItem = Show | Movie

export interface MediaCard {
  imdbId: string
  title: string
  posterPath?: string
  backdropPath?: string
  type: 'movie' | 'series'
  year?: string
  overview?: string
}

export function isShow(item: MediaItem): item is Show {
  return 'seasons' in item
}

export function isMovie(item: MediaItem): item is Movie {
  return 'releaseDate' in item
}
