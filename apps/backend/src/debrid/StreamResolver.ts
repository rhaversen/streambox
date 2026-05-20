import axios from 'axios'
import type { StreamCandidate } from '@streambox/shared-types'
import { Torrentio } from '../sources/Torrentio.js'
import { StreamRanker } from '../sources/StreamRanker.js'
import { log } from '../logger.js'

const REMOVED_FILENAMES = new Set([
  'failed_infringement_v2.mp4'
])

async function resolveDebridFilename(url: string): Promise<string | undefined> {
  try {
    const res = await axios.head(url, { timeout: 5_000, maxRedirects: 10 })
    const disposition = res.headers['content-disposition'] as string | undefined
    if (disposition) {
      const match = /filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i.exec(disposition)
      if (match) return decodeURIComponent(match[1].trim())
    }
    const finalUrl = (res.request as { res?: { responseUrl?: string } })?.res?.responseUrl ?? url
    const pathPart = new URL(finalUrl).pathname.split('/').pop()
    return pathPart ? decodeURIComponent(pathPart) : undefined
  } catch {
    return undefined
  }
}

export class StreamResolver {
  constructor(
    private readonly torrentio: Torrentio,
    private readonly ranker: StreamRanker
  ) {}

  async resolve(imdbId: string, season?: number, episode?: number): Promise<StreamCandidate[]> {
    const candidates = await this.torrentio.search(imdbId, season, episode)
    log(`[StreamResolver] Torrentio returned ${candidates.length} candidates for ${imdbId}`)
    if (candidates.length === 0) return []

    const ranked = this.ranker.rank(candidates)
    const filtered = ranked.filter((c) => c.url)

    for (const candidate of filtered.slice(0, 5)) {
      const debridFilename = await resolveDebridFilename(candidate.url)
      log(`[StreamResolver] Debrid filename: ${debridFilename ?? '(none)'} for ${candidate.quality} ${candidate.source}`)
      if (debridFilename && REMOVED_FILENAMES.has(debridFilename.toLowerCase())) {
        log(`[StreamResolver] Skipping removed content: ${debridFilename}`)
        continue
      }
      candidate.filename = debridFilename
      log(`[StreamResolver] Resolved ${candidate.quality} ${candidate.source}: ${debridFilename}`)
      return [candidate, ...filtered.filter((c) => c !== candidate).slice(0, 4)]
    }

    const resolved = filtered.slice(0, 5)
    log(`[StreamResolver] Resolved ${resolved.length} streams (best: ${resolved[0]?.quality} ${resolved[0]?.source})`)
    return resolved
  }
}
