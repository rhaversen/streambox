import type { StreamCandidate } from '@streambox/shared-types'
import { Torrentio } from '../sources/Torrentio.js'
import { StreamRanker } from '../sources/StreamRanker.js'

export class StreamResolver {
  constructor(
    private readonly torrentio: Torrentio,
    private readonly ranker: StreamRanker
  ) {}

  async resolve(imdbId: string, season?: number, episode?: number): Promise<StreamCandidate[]> {
    const candidates = await this.torrentio.search(imdbId, season, episode)
    console.log(`[StreamResolver] Torrentio returned ${candidates.length} candidates for ${imdbId}`)
    if (candidates.length === 0) return []

    const ranked = this.ranker.rank(candidates)
    const resolved = ranked.filter((c) => c.url).slice(0, 5)

    console.log(`[StreamResolver] Resolved ${resolved.length} streams (best: ${resolved[0]?.quality} ${resolved[0]?.source})`)
    return resolved
  }
}
