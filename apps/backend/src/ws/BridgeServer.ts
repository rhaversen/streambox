import type { FastifyInstance } from 'fastify'
import type { BridgeMessage, StreamInfo, Show } from '@streambox/shared-types'
import type { StreamResolver } from '../debrid/StreamResolver.js'
import type { TMDB } from '../metadata/TMDB.js'
import type { MediaStore } from '../media/MediaStore.js'
import { log, error } from '../logger.js'

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
  private messageQueue = Promise.resolve()

  constructor(
    private readonly resolver: StreamResolver,
    private readonly tmdb: TMDB,
    private readonly store: MediaStore,
  ) {}

  register(fastify: FastifyInstance): void {
    fastify.get('/ws', { websocket: true }, (socket: import('ws').WebSocket) => {
      this.clients.add(socket)

      socket.send(JSON.stringify({ type: 'STREAM_INFO', payload: this.streamInfo } satisfies BridgeMessage))

      socket.on('message', (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(raw.toString()) as BridgeMessage
          this.messageQueue = this.messageQueue
            .then(() => this.handleMessage(msg))
            .catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err)
              error('[BridgeServer] handleMessage error:', err)
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
        log(`[BridgeServer] PLAY imdbId=${imdbId} season=${season ?? '-'} episode=${episode ?? '-'}`)
        const t0 = Date.now()

        this.updateInfo({ loading: true, title: imdbId, episode: undefined, streamUrl: null, errorMessage: undefined })

        const best = await this.resolver.resolve(imdbId, season, episode)
        if (!best) {
          this.updateInfo({ loading: false, errorMessage: 'No streams found' })
          return
        }
        const isShow = season !== undefined

        const [probe, meta] = await Promise.all([
          this.store.probe(best.url),
          isShow ? this.tmdb.getShowByImdbId(imdbId) : this.tmdb.getMovieByImdbId(imdbId),
        ])
        log(`[BridgeServer] probe: codec=${probe.videoCodec} dur=${probe.duration.toFixed(0)}s hasAudio=${probe.hasAudio}`)

        if (probe.duration <= 32 && !probe.hasAudio) {
          this.updateInfo({ loading: false, errorMessage: 'No playable stream found' })
          return
        }


        const key = this.store.makeKey(imdbId, season, episode)
        await this.store.start(key, best.url, probe)
        log(`[pipeline] total: ${Date.now() - t0}ms`)

        this.currentImdbId = imdbId
        this.currentSeason = season
        this.currentEpisode = episode
        this.currentShow = isShow && meta && 'seasons' in meta ? meta : undefined

        const title = meta?.title ?? imdbId
        const episodeLabel =
          season !== undefined && episode !== undefined
            ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
            : undefined

        this.updateInfo({
          loading: false,
          title,
          episode: episodeLabel,
          streamUrl: `http://localhost:4000/api/hls/${key}/stream.m3u8`,
          duration: probe.duration,
          errorMessage: undefined,
        })
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
    if ('streamUrl' in partial) {
      log(`[BridgeServer] → streamUrl=${partial.streamUrl ?? 'null'}`)
    }
    this.broadcast({ type: 'STREAM_INFO', payload: this.streamInfo })
  }

  broadcast(msg: BridgeMessage): void {
    const json = JSON.stringify(msg)
    for (const client of this.clients) {
      if (client.readyState === 1) client.send(json)
    }
  }
}

