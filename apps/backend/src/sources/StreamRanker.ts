import type { StreamCandidate } from '@streambox/shared-types'

const QUALITY_SCORE: Record<StreamCandidate['quality'], number> = {
  '4k':      4000,
  '1080p':   3000,
  '720p':    2000,
  '480p':    1000,
  'unknown': 0,
}

const SOURCE_SCORE: Record<StreamCandidate['source'], number> = {
  'bluray':  400,
  'web-dl':  300,
  'webrip':  200,
  'hdtv':    100,
  'unknown': 0,
}

const CODEC_SCORE: Record<StreamCandidate['codec'], number> = {
  'h264':    2000,
  'hevc':    10,
  'av1':     5,
  'unknown': 0,
}

export class StreamRanker {
  rank(candidates: StreamCandidate[]): StreamCandidate[] {
    return candidates
      .map((c) => ({
        ...c,
        score: QUALITY_SCORE[c.quality] + SOURCE_SCORE[c.source] + CODEC_SCORE[c.codec],
      }))
      .sort((a, b) => b.score - a.score)
  }
}
