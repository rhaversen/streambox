import axios from 'axios'
import type { StreamCandidate } from '@streambox/shared-types'
import { Torrentio } from '../sources/Torrentio.js'
import { log } from '../logger.js'

const MIN_BYTES = 5 * 1_048_576 // 5 MB
const CONCURRENCY = 5

async function fetchContentLength(url: string): Promise<number | undefined> {
  try {
    const headRes = await axios.head(url, { timeout: 5_000, maxRedirects: 10 })
    const raw = headRes.headers['content-length']
    if (raw) return parseInt(raw as string, 10)

    const rangeRes = await axios.get<import('stream').Readable>(url, {
      timeout: 5_000,
      maxRedirects: 10,
      headers: { Range: 'bytes=0-0' },
      responseType: 'stream',
    })
    rangeRes.data.destroy()
    const contentRange = rangeRes.headers['content-range'] as string | undefined
    const match = contentRange && /\/(\d+)$/.exec(contentRange)
    return match ? parseInt(match[1], 10) : undefined
  } catch {
    return undefined
  }
}

const QUALITY: Record<StreamCandidate['quality'], number> = { '4k': 4, '1080p': 3, '720p': 2, '480p': 1, 'unknown': 0 }
const SOURCE: Record<StreamCandidate['source'], number> = { 'bluray': 4, 'web-dl': 3, 'webrip': 2, 'hdtv': 1, 'unknown': 0 }
const CODEC: Record<StreamCandidate['codec'], number> = { 'h264': 2, 'hevc': 0, 'av1': 0, 'unknown': 0 }

function score(c: StreamCandidate): number {
  return QUALITY[c.quality] + SOURCE[c.source] + CODEC[c.codec]
}

export class StreamResolver {
  constructor(private readonly torrentio: Torrentio) {}

  async resolve(imdbId: string, season?: number, episode?: number): Promise<StreamCandidate | null> {
    const candidates = await this.torrentio.search(imdbId, season, episode)
    log(`[StreamResolver] ${candidates.length} candidates for ${imdbId}`)
    if (candidates.length === 0) return null

    const sorted = candidates
      .filter((c) => c.url)
      .sort((a, b) => score(b) - score(a))

    const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`

    for (let i = 0; i < sorted.length; i += CONCURRENCY) {
      const batch = sorted.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        batch.map(async (candidate) => ({ candidate, contentLength: await fetchContentLength(candidate.url) }))
      )
      for (const { candidate, contentLength } of results) {
        const sizeStr = contentLength !== undefined ? mb(contentLength) : '(unknown)'
        if (contentLength !== undefined && contentLength < MIN_BYTES) {
          log(`[StreamResolver] Skipping small (${sizeStr}): ${candidate.quality} ${candidate.source}`)
          continue
        }
        log(`[StreamResolver] Resolved: ${candidate.quality} ${candidate.source} (${sizeStr})`)
        return candidate
      }
    }

    log(`[StreamResolver] All candidates below size threshold for ${imdbId}`)
    return null
  }
}
