import type { FastifyInstance } from 'fastify'
import type { BridgeMessage, StreamInfo, Show } from '@streambox/shared-types'
import type { StreamResolver } from '../debrid/StreamResolver.js'
import type { TMDB } from '../metadata/TMDB.js'
import { randomUUID } from 'crypto'
import { probeStream, startHlsStream, StreamCancelledError } from '../routes/hls.js'

export class BridgeServer {
  private clients = new Set<import('ws').WebSocket>()
  private streamInfo: StreamInfo = {
    loading: false,
    duration: 0,
    title: '',
  }

  private currentImdbId?: string
  private currentSeason?: number
  private currentEpisode?: number
  private currentShow?: Show

  constructor(
    private readonly resolver: StreamResolver,
    private readonly tmdb: TMDB,
  ) {}

  register(fastify: FastifyInstance): void {
    fastify.get('/ws', { websocket: true }, (socket: import('ws').WebSocket) => {
      this.clients.add(socket)

      socket.send(JSON.stringify({ type: 'STREAM_INFO', payload: this.streamInfo } satisfies BridgeMessage))

      socket.on('message', (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(raw.toString()) as BridgeMessage
          void this.handleMessage(msg).catch((err: unknown) => {
            if (err instanceof StreamCancelledError) return
            const message = err instanceof Error ? err.message : String(err)
            console.error('[BridgeServer] handleMessage error:', err)
            this.updateInfo({ loading: false, errorMessage: message })
          })
        } catch { /* ignore malformed */ }
      })

      socket.on('close', () => this.clients.delete(socket))
    })
  }

  private async handleMessage(msg: BridgeMessage): Promise<void> {
    switch (msg.type) {
      case 'PLAY': {
        const { imdbId, season, episode } = msg.payload
        const t0 = Date.now()

        this.updateInfo({ loading: true, title: imdbId, episode: undefined, streamUrl: null, errorMessage: undefined })

        const candidates = await this.resolver.resolve(imdbId, season, episode)
        console.log(`[pipeline] torrentio: ${Date.now() - t0}ms`)

        if (!candidates.length) {
          this.updateInfo({ loading: false, errorMessage: 'No streams found' })
          return
        }

        const best = candidates[0]!
        const isShow = season !== undefined
        const t1 = Date.now()

        const [probeResult, meta] = await Promise.all([
          probeStream(best.url),
          isShow ? this.tmdb.getShowByImdbId(imdbId) : this.tmdb.getMovieByImdbId(imdbId),
        ])
        console.log(`[pipeline] probe + tmdb (parallel): ${Date.now() - t1}ms, ${probeResult.audioStreams.length} audio track(s)`)

        const t2 = Date.now()
        const manifestUrl = await startHlsStream(best.url, randomUUID(), probeResult.videoCodec, probeResult.audioStreams)
        console.log(`[pipeline] hls first segment: ${Date.now() - t2}ms`)
        console.log(`[pipeline] total: ${Date.now() - t0}ms`)

        this.currentImdbId = imdbId
        this.currentSeason = season
        this.currentEpisode = episode
        this.currentShow = isShow && meta && 'seasons' in meta ? meta : undefined

        const title = meta?.title ?? imdbId
        const episodeLabel =
          season !== undefined && episode !== undefined
            ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
            : undefined

        this.updateInfo({ loading: false, title, episode: episodeLabel, streamUrl: manifestUrl, duration: probeResult.duration, errorMessage: undefined })
        break
      }
      case 'NEXT_EPISODE':
        await this.handleNextEpisode()
        break
    }
  }

  private async handleNextEpisode(): Promise<void> {
    if (!this.currentImdbId || this.currentSeason === undefined || this.currentEpisode === undefined || !this.currentShow) return

    const season = this.currentShow.seasons.find((s) => s.seasonNumber === this.currentSeason)
    const nextInSeason = season?.episodes.find((e) => e.episode === this.currentEpisode! + 1)

    if (nextInSeason) {
      await this.handleMessage(
        { type: 'PLAY', payload: { imdbId: this.currentImdbId, season: this.currentSeason, episode: nextInSeason.episode } }
      )
      return
    }

    const nextSeason = this.currentShow.seasons.find((s) => s.seasonNumber === this.currentSeason! + 1)
    const firstEpisode = nextSeason?.episodes[0]
    if (firstEpisode) {
      await this.handleMessage(
        { type: 'PLAY', payload: { imdbId: this.currentImdbId, season: nextSeason!.seasonNumber, episode: firstEpisode.episode } }
      )
    }
  }

  private updateInfo(partial: Partial<StreamInfo>): void {
    this.streamInfo = { ...this.streamInfo, ...partial }
    this.broadcast({ type: 'STREAM_INFO', payload: this.streamInfo })
  }

  broadcast(msg: BridgeMessage): void {
    const json = JSON.stringify(msg)
    for (const client of this.clients) {
      if (client.readyState === 1) client.send(json)
    }
  }
}
