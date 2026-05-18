import type { FastifyInstance } from 'fastify'
import type { TMDB } from '../metadata/TMDB.js'

export function registerApiRoutes(fastify: FastifyInstance, tmdb: TMDB): void {
  fastify.get('/api/trending/movies', async () => {
    return tmdb.getTrendingMovieCards()
  })

  fastify.get('/api/trending/series', async () => {
    return tmdb.getTrendingSeriesCards()
  })

  fastify.get<{ Querystring: { q: string } }>('/api/search', async (req) => {
    const { q } = req.query
    if (!q) return []
    return tmdb.searchMulti(q)
  })

  fastify.get<{ Params: { imdbId: string } }>('/api/detail/:imdbId', async (req) => {
    const { imdbId } = req.params
    const show = await tmdb.getShowByImdbId(imdbId)
    if (show) return show
    return tmdb.getMovieByImdbId(imdbId)
  })
}
