import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { createGunzip, constants as zlibConstants } from 'zlib'
import type { Show, Movie, Episode, Season, MediaCard } from '@streambox/shared-types'

interface TMDBTrendingMovie {
  id: number
  title: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  overview: string
}

interface TMDBTrendingSeries {
  id: number
  name: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  overview: string
}

interface TMDBShowResult {
  id: number
  name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  first_air_date: string
  genres: Array<{ id: number; name: string }>
}

interface TMDBMovieResult {
  id: number
  title: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  genres: Array<{ id: number; name: string }>
  runtime: number | null
  imdb_id: string
}

interface TMDBEpisode {
  episode_number: number
  name: string
  overview: string
  air_date: string
  still_path: string | null
  runtime: number | null
}

interface TMDBSeason {
  season_number: number
  episode_count: number
  episodes: TMDBEpisode[]
  poster_path: string | null
}

interface TMDBExternalIds {
  imdb_id: string | null
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
    const findRes = await this.tmdbGet<{ tv_results: TMDBShowResult[] }>(
      `${this.baseUrl}/find/${imdbId}`,
      { params: { ...this.params, external_source: 'imdb_id' } }
    )
    const result = findRes.tv_results[0]
    if (!result) return null

    const seasonsRes = await this.tmdbGet<{ seasons: TMDBSeason[] }>(
      `${this.baseUrl}/tv/${result.id}`,
      { params: this.params }
    )

    const seasons: Season[] = await Promise.all(
      seasonsRes.seasons
        .filter((s) => s.season_number > 0)
        .map((s) => this.fetchSeason(result.id, s.season_number, s.poster_path))
    )

    return {
      imdbId,
      tmdbId: result.id,
      title: result.name,
      overview: result.overview,
      posterPath: result.poster_path ? IMAGE_BASE + result.poster_path : undefined,
      backdropPath: result.backdrop_path ? IMAGE_BASE + result.backdrop_path : undefined,
      firstAirDate: result.first_air_date,
      genres: (result.genres ?? []).map((g) => g.name),
      seasons,
    }
  }

  private async fetchSeason(tmdbShowId: number, seasonNumber: number, posterPath: string | null): Promise<Season> {
    const res = await this.tmdbGet<TMDBSeason>(
      `${this.baseUrl}/tv/${tmdbShowId}/season/${seasonNumber}`,
      { params: this.params }
    )
    const episodes: Episode[] = res.episodes.map((e) => ({
      tmdbId: tmdbShowId,
      season: seasonNumber,
      episode: e.episode_number,
      title: e.name,
      overview: e.overview,
      airDate: e.air_date,
      stillPath: e.still_path ? IMAGE_BASE + e.still_path : undefined,
      runtime: e.runtime ?? undefined,
    }))
    return {
      seasonNumber,
      episodeCount: episodes.length,
      episodes,
      posterPath: posterPath ? IMAGE_BASE + posterPath : undefined,
    }
  }

  async getMovieByImdbId(imdbId: string): Promise<Movie | null> {
    const findRes = await this.tmdbGet<{ movie_results: TMDBMovieResult[] }>(
      `${this.baseUrl}/find/${imdbId}`,
      { params: { ...this.params, external_source: 'imdb_id' } }
    )
    const result = findRes.movie_results[0]
    if (!result) return null

    return {
      imdbId,
      tmdbId: result.id,
      title: result.title,
      overview: result.overview,
      posterPath: result.poster_path ? IMAGE_BASE + result.poster_path : undefined,
      backdropPath: result.backdrop_path ? IMAGE_BASE + result.backdrop_path : undefined,
      releaseDate: result.release_date,
      genres: (result.genres ?? []).map((g) => g.name),
      runtime: result.runtime ?? undefined,
    }
  }

  async searchMulti(query: string): Promise<MediaCard[]> {
    const res = await this.tmdbGet<{ results: Array<{
      id: number; media_type: string; name?: string; title?: string
      poster_path?: string; backdrop_path?: string
      release_date?: string; first_air_date?: string; overview?: string
    }> }>(
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
        tmdbId: item.id,
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
          tmdbId: item.id,
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
          tmdbId: item.id,
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
