import { spawn, type ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { log, warn, error } from '../logger.js'

const _require = createRequire(import.meta.url)
const ffmpegPath = _require('ffmpeg-static') as string
const ffprobePath = _require('ffprobe-static') as { path: string }

export const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'media-cache')

const HTTP_FLAGS = [
  '-user_agent', 'Mozilla/5.0 (compatible)',
  '-reconnect', '1',
  '-reconnect_streamed', '1',
  '-reconnect_delay_max', '5',
]

export interface ProbeResult {
  duration: number
  videoCodec: string
  hasAudio: boolean
}

export interface MediaEntry {
  dir: string
  process: ChildProcess | null
  status: 'running' | 'complete' | 'error'
  probe: ProbeResult
}

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
      log(`[MediaStore] Restored: ${name}`)
    }
  }

  makeKey(imdbId: string, season?: number, episode?: number): string {
    return season !== undefined
      ? `${imdbId}_s${String(season).padStart(2, '0')}e${String(episode!).padStart(2, '0')}`
      : imdbId
  }

  getEntry(key: string): MediaEntry | undefined {
    return this.entries.get(key)
  }

  async probe(url: string): Promise<ProbeResult> {
    return new Promise((resolve) => {
      const ff = spawn(ffprobePath.path, [
        '-v', 'quiet', '-print_format', 'json',
        '-analyzeduration', '2000000', '-probesize', '1000000',
        '-show_format', '-show_streams',
        ...HTTP_FLAGS, url,
      ])
      let out = ''
      ff.stdout.on('data', (d: Buffer) => { out += d.toString() })
      ff.on('close', () => {
        try {
          const info = JSON.parse(out) as {
            format?: { duration?: string }
            streams?: Array<{ codec_type?: string; codec_name?: string }>
          }
          const duration = parseFloat(info.format?.duration ?? '0') || 0
          const videoCodec = info.streams?.find((s) => s.codec_type === 'video')?.codec_name ?? ''
          const hasAudio = (info.streams ?? []).some((s) => s.codec_type === 'audio')
          resolve({ duration, videoCodec, hasAudio })
        } catch {
          resolve({ duration: 0, videoCodec: '', hasAudio: false })
        }
      })
      ff.on('error', () => resolve({ duration: 0, videoCodec: '', hasAudio: false }))
    })
  }

  async start(key: string, url: string, probe: ProbeResult): Promise<void> {
    const existing = this.entries.get(key)
    if (existing) {
      log(`[MediaStore] Reusing ${key} (status=${existing.status})`)
      return
    }

    log(`[MediaStore] Starting FFmpeg for ${key} — codec=${probe.videoCodec} dur=${probe.duration.toFixed(0)}s hasAudio=${probe.hasAudio}`)

    const dir = join(BASE_DIR, key)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'probe.json'), JSON.stringify(probe))

    const entry: MediaEntry = { dir, process: null, status: 'running', probe }
    this.entries.set(key, entry)

    const videoArgs = probe.videoCodec !== 'h264'
      ? ['-vf', 'setpts=PTS-STARTPTS,scale=-2:1080', '-c:v', 'libx264', '-preset', 'superfast', '-crf', '22']
      : ['-vf', 'setpts=PTS-STARTPTS', '-c:v', 'libx264', '-preset', 'superfast', '-crf', '22']

    const audioArgs = probe.hasAudio
      ? ['-map', '0:a:0', '-af', 'asetpts=PTS-STARTPTS', '-c:a', 'aac', '-b:a', '192k', '-ac', '2']
      : []

    const ff = spawn(ffmpegPath, [
      '-loglevel', 'warning',
      ...HTTP_FLAGS,
      '-i', url,
      '-map', '0:v:0',
      ...videoArgs,
      ...audioArgs,
      '-f', 'hls',
      '-hls_time', '6',
      '-hls_list_size', '0',
      '-hls_flags', 'independent_segments',
      '-hls_playlist_type', 'event',
      '-hls_segment_filename', 'stream_%05d.ts',
      'stream.m3u8',
    ], { cwd: dir })

    entry.process = ff
    ff.stderr.on('data', (d: Buffer) => warn(`[ffmpeg:${key}] ${d.toString().trimEnd()}`))
    ff.on('error', (err: Error) => {
      error(`[ffmpeg:${key}] ${err.message}`)
      entry.status = 'error'
    })
    ff.on('close', (code) => {
      entry.process = null
      entry.status = code === 0 || code === null ? 'complete' : 'error'
      log(`[MediaStore] FFmpeg ${key} exited — code=${code} status=${entry.status}`)
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

  async waitForFile(entry: MediaEntry, filename: string, timeoutMs = 120_000): Promise<void> {
    const path = join(entry.dir, filename)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try { await fs.access(path); return } catch {}
      if (entry.status === 'error') throw new Error('FFmpeg failed')
      await new Promise<void>((res) => setTimeout(res, 500))
    }
    throw new Error(`Timeout waiting for ${filename}`)
  }
}
