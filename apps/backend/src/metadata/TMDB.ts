import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { createGunzip, constants as zlibConstants } from 'zlib'
import type { Show, Movie, Episode, Season, MediaCard } from '@streambox/shared-types'

// Items in /trending/movie/week results
interface TMDBTrendingMovie {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  genre_ids: number[]
  popularity: number
  vote_average: number
  vote_count: number
  original_language: string
  adult: boolean
  video: boolean
  media_type: string
}

// Items in /trending/tv/week results
interface TMDBTrendingSeries {
  id: number
  name: string
  original_name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  genre_ids: number[]
  popularity: number
  vote_average: number
  vote_count: number
  origin_country: string[]
  original_language: string
  adult: boolean
  media_type: string
}

// Items in /find/{external_id} tv_results
interface TMDBFindTVResult {
  id: number
  name: string
  original_name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  genre_ids: number[]
  popularity: number
  vote_average: number
  vote_count: number
  origin_country: string[]
  original_language: string
  adult: boolean
  media_type: string
}

// Response for /tv/{series_id}
interface TMDBTVDetails {
  id: number
  name: string
  original_name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  last_air_date: string
  genres: Array<{ id: number; name: string }>
  seasons: TMDBSeasonListItem[]
  number_of_episodes: number
  number_of_seasons: number
  status: string
  tagline: string
  popularity: number
  vote_average: number
  vote_count: number
  in_production: boolean
  origin_country: string[]
  original_language: string
  adult: boolean
}

// Season items within the /tv/{series_id} response (no episodes array)
interface TMDBSeasonListItem {
  id: number
  name: string
  overview: string
  air_date: string | null
  episode_count: number
  poster_path: string | null
  season_number: number
  vote_average: number
}

// Items in /find/{external_id} movie_results
interface TMDBFindMovieResult {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  genre_ids: number[]
  popularity: number
  vote_average: number
  vote_count: number
  original_language: string
  adult: boolean
  video: boolean
  media_type: string
}

// Response for /movie/{movie_id}
interface TMDBMovieDetails {
  id: number
  title: string
  original_title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  genres: Array<{ id: number; name: string }>
  runtime: number | null
  imdb_id: string | null
  popularity: number
  vote_average: number
  vote_count: number
  original_language: string
  adult: boolean
  video: boolean
  status: string
  tagline: string
  budget: number
  revenue: number
  homepage: string | null
  origin_country: string[]
}

// Episodes within /tv/{series_id}/season/{season_number} response
interface TMDBEpisode {
  id: number
  name: string
  overview: string
  air_date: string | null
  episode_number: number
  episode_type: string
  production_code: string
  runtime: number | null
  season_number: number
  show_id: number
  still_path: string | null
  vote_average: number
  vote_count: number
}

// Response for /tv/{series_id}/season/{season_number}
interface TMDBSeasonDetails {
  _id: string
  id: number
  name: string
  overview: string
  air_date: string | null
  poster_path: string | null
  season_number: number
  vote_average: number
  episodes: TMDBEpisode[]
}

// Response for /movie/{id}/external_ids and /tv/{id}/external_ids
interface TMDBExternalIds {
  id: number
  imdb_id: string | null
  wikidata_id: string | null
  facebook_id: string | null
  instagram_id: string | null
  twitter_id: string | null
}

// Items in /search/multi results
interface TMDBMultiSearchResult {
  id: number
  media_type: 'movie' | 'tv' | 'person'
  title?: string
  original_title?: string
  release_date?: string
  video?: boolean
  name?: string
  original_name?: string
  first_air_date?: string
  origin_country?: string[]
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  genre_ids: number[]
  popularity: number
  vote_average: number
  vote_count: number
  original_language: string
  adult: boolean
}

const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

export class TMDB {
  private readonly baseUrl = 'https://api.themoviedb.org/3'
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private get params() {
    return { api_key: this.apiKey }
  }

  /** Axios get that handles TMDB's gzip responses missing Content-Encoding header */
  private async tmdbGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await axios.get<Buffer>(url, { ...config, responseType: 'arraybuffer' })
    const buf = Buffer.from(res.data)
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      const text = await new Promise<string>((resolve, reject) => {
        const gunzip = createGunzip({ finishFlush: zlibConstants.Z_SYNC_FLUSH })
        const chunks: Buffer[] = []
        gunzip.on('data', (chunk: Buffer) => chunks.push(chunk))
        gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        gunzip.on('error', reject)
        gunzip.end(buf)
      })
      return JSON.parse(text) as T
    }
    return JSON.parse(buf.toString('utf8')) as T
  }

  async getShowByImdbId(imdbId: string): Promise<Show | null> {
    const findRes = await this.tmdbGet<{ tv_results: TMDBFindTVResult[] }>(
      `${this.baseUrl}/find/${imdbId}`,
      { params: { ...this.params, external_source: 'imdb_id' } }
    )
    const result = findRes.tv_results[0]
    if (!result) return null

    const tvDetails = await this.tmdbGet<TMDBTVDetails>(
      `${this.baseUrl}/tv/${result.id}`,
      { params: this.params }
    )

    const seasons: Season[] = await Promise.all(
      tvDetails.seasons
        .filter((s) => s.season_number > 0)
        .map((s) => this.fetchSeason(result.id, s.season_number))
    )

    return {
      imdbId,
      title: result.name,
      overview: result.overview,
      posterPath: result.poster_path ? IMAGE_BASE + result.poster_path : undefined,
      backdropPath: result.backdrop_path ? IMAGE_BASE + result.backdrop_path : undefined,
      firstAirDate: result.first_air_date,
      genres: tvDetails.genres.map((g) => g.name),
      seasons,
    }
  }

  private async fetchSeason(tmdbShowId: number, seasonNumber: number): Promise<Season> {
    const res = await this.tmdbGet<TMDBSeasonDetails>(
      `${this.baseUrl}/tv/${tmdbShowId}/season/${seasonNumber}`,
      { params: this.params }
    )
    const episodes: Episode[] = res.episodes.map((e) => ({
      season: seasonNumber,
      episode: e.episode_number,
      title: e.name,
      runtime: e.runtime ?? undefined,
    }))
    return {
      seasonNumber,
      episodeCount: episodes.length,
      episodes,
    }
  }

  async getMovieByImdbId(imdbId: string): Promise<Movie | null> {
    const findRes = await this.tmdbGet<{ movie_results: TMDBFindMovieResult[] }>(
      `${this.baseUrl}/find/${imdbId}`,
      { params: { ...this.params, external_source: 'imdb_id' } }
    )
    const result = findRes.movie_results[0]
    if (!result) return null

    const details = await this.tmdbGet<TMDBMovieDetails>(
      `${this.baseUrl}/movie/${result.id}`,
      { params: this.params }
    )

    return {
      imdbId,
      title: result.title,
      overview: result.overview,
      posterPath: result.poster_path ? IMAGE_BASE + result.poster_path : undefined,
      backdropPath: result.backdrop_path ? IMAGE_BASE + result.backdrop_path : undefined,
      releaseDate: result.release_date,
      genres: details.genres.map((g) => g.name),
      runtime: details.runtime ?? undefined,
    }
  }

  async searchMulti(query: string): Promise<MediaCard[]> {
    const res = await this.tmdbGet<{ results: TMDBMultiSearchResult[] }>(
      `${this.baseUrl}/search/multi`,
      { params: { ...this.params, query } }
    )
    const cards: MediaCard[] = []
    for (const item of (res.results ?? []).slice(0, 10)) {
      if (item.media_type !== 'tv' && item.media_type !== 'movie') continue
      const extRes = await this.tmdbGet<TMDBExternalIds>(
        `${this.baseUrl}/${item.media_type}/${item.id}/external_ids`,
        { params: this.params }
      )
      const imdbId = extRes.imdb_id
      if (!imdbId) continue
      cards.push({
        imdbId,
        title: item.media_type === 'tv' ? (item.name ?? '') : (item.title ?? ''),
        posterPath: item.poster_path ? IMAGE_BASE + item.poster_path : undefined,
        backdropPath: item.backdrop_path ? IMAGE_BASE + item.backdrop_path : undefined,
        type: item.media_type === 'tv' ? 'series' : 'movie',
        year: item.media_type === 'tv' ? item.first_air_date?.slice(0, 4) : item.release_date?.slice(0, 4),
        overview: item.overview,
      })
    }
    return cards
  }

  async getTrendingMovieCards(count = 12): Promise<MediaCard[]> {
    const res = await this.tmdbGet<{ results: TMDBTrendingMovie[] }>(
      `${this.baseUrl}/trending/movie/week`,
      { params: this.params }
    )
    const items = (res.results ?? []).slice(0, count)
    const cards = await Promise.all(
      items.map(async (item): Promise<MediaCard | null> => {
        const ext = await this.tmdbGet<TMDBExternalIds>(
          `${this.baseUrl}/movie/${item.id}/external_ids`,
          { params: this.params }
        )
        const imdbId = ext.imdb_id
        if (!imdbId) return null
        return {
          imdbId,
          title: item.title,
          posterPath: item.poster_path ? IMAGE_BASE + item.poster_path : undefined,
          backdropPath: item.backdrop_path ? IMAGE_BASE + item.backdrop_path : undefined,
          type: 'movie' as const,
          year: item.release_date?.slice(0, 4),
          overview: item.overview,
        } satisfies MediaCard
      })
    )
    return cards.filter((c): c is MediaCard => c !== null)
  }

  async getTrendingSeriesCards(count = 12): Promise<MediaCard[]> {
    const res = await this.tmdbGet<{ results: TMDBTrendingSeries[] }>(
      `${this.baseUrl}/trending/tv/week`,
      { params: this.params }
    )
    const items = (res.results ?? []).slice(0, count)
    const cards = await Promise.all(
      items.map(async (item): Promise<MediaCard | null> => {
        const ext = await this.tmdbGet<TMDBExternalIds>(
          `${this.baseUrl}/tv/${item.id}/external_ids`,
          { params: this.params }
        )
        const imdbId = ext.imdb_id
        if (!imdbId) return null
        return {
          imdbId,
          title: item.name,
          posterPath: item.poster_path ? IMAGE_BASE + item.poster_path : undefined,
          backdropPath: item.backdrop_path ? IMAGE_BASE + item.backdrop_path : undefined,
          type: 'series' as const,
          year: item.first_air_date?.slice(0, 4),
          overview: item.overview,
        } satisfies MediaCard
      })
    )
    return cards.filter((c): c is MediaCard => c !== null)
  }
}
