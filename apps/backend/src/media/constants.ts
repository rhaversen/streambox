/**
 * Constants for media processing and caching
 */

export const HTTP_FLAGS = [
  '-user_agent', 'Mozilla/5.0 (compatible)',
  '-reconnect', '1',
  '-reconnect_streamed', '1',
  '-reconnect_delay_max', '5',
] as const

export const HLS_SEGMENT_DURATION = 6
export const HLS_LIST_SIZE = 0
export const HLS_SEGMENT_FILENAME_PATTERN = 'stream_%05d.ts'

export const FFPROBE_ANALYZE_DURATION = 2_000_000
export const FFPROBE_PROBE_SIZE = 1_000_000

export const VIDEO_PRESET = 'superfast'
export const VIDEO_CRF = '22'
export const VIDEO_SCALE_HEIGHT = 1080

export const AUDIO_BITRATE = '192k'
export const AUDIO_CHANNELS = 2

export const FILE_WAIT_TIMEOUT_MS = 120_000
export const FILE_WAIT_RETRY_INTERVAL_MS = 500

export const MIN_PLAYABLE_DURATION_SECONDS = 32
