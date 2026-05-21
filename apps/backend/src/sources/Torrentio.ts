import axios from 'axios'
import type { StreamCandidate } from '@streambox/shared-types'

interface TorrentioStream {
  name: string
  title: string
  url?: string
}

interface TorrentioResponse {
  streams: TorrentioStream[]
}

export class Torrentio {
  private readonly baseUrl: string

  constructor(baseUrl = 'https://torrentio.strem.fun', rdToken?: string) {
    this.baseUrl = rdToken
      ? `${baseUrl}/realdebrid=${rdToken}`
      : baseUrl
  }

  async search(imdbId: string, season?: number, episode?: number): Promise<StreamCandidate[]> {
    const type = season !== undefined ? 'series' : 'movie'
    const id =
      season !== undefined && episode !== undefined
        ? `${imdbId}:${season}:${episode}`
        : imdbId

    const url = `${this.baseUrl}/stream/${type}/${id}.json`
    const res = await axios.get<TorrentioResponse>(url, { timeout: 10_000 })
    return res.data.streams.map((s) => this.parseStream(s))
  }

  private parseStream(stream: TorrentioStream): StreamCandidate {
    const name = stream.name ?? ''
    const title = stream.title ?? ''
    return {
      url: stream.url ?? '',
      quality: this.parseQuality(name + ' ' + title),
      source: this.parseSource(name + ' ' + title),
      codec: this.parseCodec(name + ' ' + title),
    }
  }

  private parseQuality(text: string): StreamCandidate['quality'] {
    const t = text.toLowerCase()
    if (t.includes('2160p') || t.includes('4k') || t.includes('uhd')) return '4k'
    if (t.includes('1080p') || t.includes('1080')) return '1080p'
    if (t.includes('720p') || t.includes('720')) return '720p'
    if (t.includes('480p')) return '480p'
    return 'unknown'
  }

  private parseSource(text: string): StreamCandidate['source'] {
    const t = text.toLowerCase()
    if (t.includes('bluray') || t.includes('blu-ray') || t.includes('remux')) return 'bluray'
    if (t.includes('web-dl') || t.includes('webdl')) return 'web-dl'
    if (t.includes('webrip') || t.includes('web-rip')) return 'webrip'
    if (t.includes('hdtv')) return 'hdtv'
    return 'unknown'
  }

  private parseCodec(text: string): StreamCandidate['codec'] {
    const t = text.toLowerCase()
    if (t.includes('av1')) return 'av1'
    if (t.includes('hevc') || t.includes('h.265') || t.includes('x265')) return 'hevc'
    if (t.includes('h.264') || t.includes('x264') || t.includes('avc')) return 'h264'
    return 'unknown'
  }
}
