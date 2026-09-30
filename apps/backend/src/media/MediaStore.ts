import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { DownloadInsight } from '@streambox/shared-types'
import logger from '../logger.js'
import type { MediaEntry, ProbeResult } from './types.js'
import { ffmpegPath, probeMedia, buildVideoArgs, buildAudioArgs } from './ffmpeg.js'
import { makeKey as makeKeyUtil } from './validation.js'
import {
  HTTP_FLAGS,
  HLS_SEGMENT_DURATION,
  HLS_LIST_SIZE,
  HLS_SEGMENT_FILENAME_PATTERN,
  VIDEO_PRESET,
  VIDEO_CRF,
  VIDEO_SCALE_HEIGHT,
  AUDIO_BITRATE,
  AUDIO_CHANNELS,
  FILE_WAIT_TIMEOUT_MS,
  FILE_WAIT_RETRY_INTERVAL_MS,
} from './constants.js'

export const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'media-cache')

export type { MediaEntry, ProbeResult }

/**
 * MediaStore - HLS Streaming and Caching
 * 
 * Manages FFmpeg transcoding from source URLs to HLS segments.
 * HLS segments are cached permanently for instant re-watch.
 * 
 * Future: Will be refactored to V3 architecture with separate services:
 * - HLSStreamingService: Handle playback transcoding
 * - SourceArchiveService: Preserve original quality in background
 * - MediaCoordinator: Orchestrate between services
 * 
 * See docs/CACHING_PLAN_V3.md for architecture details.
 */
export class MediaStore {
  private entries = new Map<string, MediaEntry>()

  async init(): Promise<void> {
    await fs.mkdir(BASE_DIR, { recursive: true })
    const dirs = await fs.readdir(BASE_DIR).catch(() => [] as string[])
    for (const name of dirs) {
      const dir = join(BASE_DIR, name)
      if (!(await fs.stat(dir).then((s) => s.isDirectory()).catch(() => false))) continue
      const probeRaw = await fs.readFile(join(dir, 'probe.json'), 'utf-8').catch(() => null)
      if (!probeRaw) continue
      const manifest = await fs.readFile(join(dir, 'stream.m3u8'), 'utf-8').catch(() => null)
      if (!manifest?.includes('#EXT-X-ENDLIST')) continue
      const probeData = JSON.parse(probeRaw) as ProbeResult
      this.entries.set(name, {
        dir,
        process: null,
        status: 'complete',
        probe: probeData,
      })
      logger.info(`[MediaStore] Restored: ${name}`)
    }
  }

  makeKey(imdbId: string, season?: number, episode?: number): string {
    return makeKeyUtil(imdbId, season, episode)
  }

  getEntry(key: string): MediaEntry | undefined {
    return this.entries.get(key)
  }

  async probe(url: string): Promise<ProbeResult> {
    return probeMedia(url)
  }

  async start(key: string, url: string, probe: ProbeResult): Promise<void> {
    const existing = this.entries.get(key)
    if (existing) {
      logger.info(`[MediaStore] Reusing ${key} (status=${existing.status})`)
      return
    }

    logger.info(`[MediaStore] Starting FFmpeg for ${key} — codec=${probe.videoCodec} dur=${probe.duration.toFixed(0)}s hasAudio=${probe.hasAudio}`)

    const dir = join(BASE_DIR, key)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'probe.json'), JSON.stringify(probe))

    const entry: MediaEntry = { dir, process: null, status: 'running', probe }
    this.entries.set(key, entry)

    const videoArgs = buildVideoArgs(probe.videoCodec, VIDEO_SCALE_HEIGHT, VIDEO_PRESET, VIDEO_CRF)
    const audioArgs = buildAudioArgs(probe.hasAudio, AUDIO_BITRATE, AUDIO_CHANNELS)

    const ff = spawn(ffmpegPath, [
      '-loglevel', 'warning',
      ...HTTP_FLAGS,
      '-i', url,
      '-map', '0:v:0',
      ...videoArgs,
      ...audioArgs,
      '-f', 'hls',
      '-hls_time', String(HLS_SEGMENT_DURATION),
      '-hls_list_size', String(HLS_LIST_SIZE),
      '-hls_flags', 'independent_segments',
      '-hls_playlist_type', 'event',
      '-hls_segment_filename', HLS_SEGMENT_FILENAME_PATTERN,
      'stream.m3u8',
    ], { cwd: dir })

    entry.process = ff
    ff.stderr.on('data', (d: Buffer) => logger.warn(`[ffmpeg:${key}] ${d.toString().trimEnd()}`))
    ff.on('error', (err: Error) => {
      logger.error(`[ffmpeg:${key}] ffmpeg error`, { error: err })
      entry.status = 'error'
    })
    ff.on('close', (code) => {
      entry.process = null
      entry.status = code === 0 || code === null ? 'complete' : 'error'
      logger.info(`[MediaStore] FFmpeg ${key} exited — code=${code} status=${entry.status}`)
    })

    await this.waitForFile(entry, 'stream.m3u8')
  }

  async getCachedDuration(key: string): Promise<number> {
    const entry = this.entries.get(key)
    if (!entry) return 0
    const manifest = await fs.readFile(join(entry.dir, 'stream.m3u8'), 'utf-8').catch(() => null)
    if (!manifest) return 0
    let total = 0
    for (const match of manifest.matchAll(/#EXTINF:([\.\d]+),/g)) {
      total += parseFloat(match[1])
    }
    return total
  }

  async getDownloadInsight(key: string): Promise<DownloadInsight> {
    const entry = this.entries.get(key)
    if (!entry) {
      return { status: 'none', cachedSeconds: 0 }
    }
    const cachedSeconds = await this.getCachedDuration(key)
    return { status: entry.status, cachedSeconds }
  }

  async getInsightsForImdb(imdbId: string): Promise<Record<string, DownloadInsight>> {
    const keys = [...this.entries.keys()].filter((key) => key === imdbId || key.startsWith(`${imdbId}_`))
    const pairs = await Promise.all(
      keys.map(async (key) => [key, await this.getDownloadInsight(key)] as const)
    )
    return Object.fromEntries(pairs)
  }

  async waitForFile(entry: MediaEntry, filename: string, timeoutMs = FILE_WAIT_TIMEOUT_MS): Promise<void> {
    const path = join(entry.dir, filename)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try { await fs.access(path); return } catch {}
      if (entry.status === 'error') throw new Error('FFmpeg failed')
      await new Promise<void>((res) => setTimeout(res, FILE_WAIT_RETRY_INTERVAL_MS))
    }
    throw new Error(`Timeout waiting for ${filename}`)
  }
}
