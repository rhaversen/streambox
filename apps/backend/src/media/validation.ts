/**
 * Validation utilities for media keys and filenames
 */

const KEY_RE = /^[a-zA-Z0-9_]+$/
const FILENAME_RE = /^(stream\.m3u8|stream_\d{5}\.ts)$/
const RANGE_KEY_RE = /^r\d+$/

/**
 * Validate a media cache key (e.g., "tt1234567_s01e01")
 */
export function isValidKey(key: string): boolean {
  return KEY_RE.test(key)
}

/**
 * Validate an HLS filename (stream.m3u8 or stream_00000.ts)
 */
export function isValidFilename(filename: string): boolean {
  return FILENAME_RE.test(filename)
}

/**
 * Validate a range key (e.g., "r0", "r3420")
 */
export function isValidRangeKey(rangeKey: string): boolean {
  return RANGE_KEY_RE.test(rangeKey)
}

/**
 * Build a cache key from IMDB ID and optional season/episode
 */
export function makeKey(imdbId: string, season?: number, episode?: number): string {
  return season !== undefined
    ? `${imdbId}_s${String(season).padStart(2, '0')}e${String(episode!).padStart(2, '0')}`
    : imdbId
}

/**
 * Parse range start position from range key (e.g., "r3420" -> 3420)
 */
export function parseRangeKey(rangeKey: string): number | null {
  if (!isValidRangeKey(rangeKey)) return null
  return parseInt(rangeKey.slice(1), 10)
}
