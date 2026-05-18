import { spawn, type ChildProcess } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import type { FastifyInstance } from 'fastify'

const _require = createRequire(import.meta.url)
const ffmpegPath = _require('ffmpeg-static') as string
const ffprobePath = _require('ffprobe-static') as { path: string }

const BASE_DIR = join(tmpdir(), 'streambox-hls')

const HTTP_FLAGS = [
  '-user_agent', 'Mozilla/5.0 (compatible)',
  '-reconnect', '1',
  '-reconnect_at_eof', '1',
  '-reconnect_streamed', '1',
  '-reconnect_delay_max', '5',
]

let activeProcess: ChildProcess | null = null
let activeDir: string | null = null
let activeGeneration = 0

export class StreamCancelledError extends Error {
  constructor() { super('Stream superseded by new request') }
}

export interface AudioStreamInfo {
  index: number
  language?: string
  title?: string
}

export async function probeStream(url: string): Promise<{ duration: number; videoCodec: string; audioStreams: AudioStreamInfo[] }> {
  return new Promise((resolve) => {
    const ff = spawn(ffprobePath.path, [
      '-v', 'quiet', '-print_format', 'json',
      '-analyzeduration', '2000000',
      '-probesize', '1000000',
      '-show_format', '-show_streams',
      ...HTTP_FLAGS, url,
    ])
    let out = ''
    ff.stdout.on('data', (d: Buffer) => { out += d.toString() })
    ff.on('close', () => {
      try {
        const info = JSON.parse(out) as {
          format?: { duration?: string }
          streams?: Array<{
            index: number
            codec_type?: string
            codec_name?: string
            tags?: { language?: string; title?: string }
          }>
        }
        const duration = parseFloat(info.format?.duration ?? '0') || 0
        const videoStream = info.streams?.find((s) => s.codec_type === 'video')
        const videoCodec = videoStream?.codec_name ?? ''
        const audioStreams: AudioStreamInfo[] = (info.streams ?? [])
          .filter((s) => s.codec_type === 'audio')
          .map((s, i) => ({
            index: i,
            language: s.tags?.language && s.tags.language !== 'und' ? s.tags.language : undefined,
            title: s.tags?.title || undefined,
          }))
        resolve({ duration, videoCodec, audioStreams })
      } catch { resolve({ duration: 0, videoCodec: '', audioStreams: [] }) }
    })
    ff.on('error', () => resolve({ duration: 0, videoCodec: '', audioStreams: [] }))
  })
}

export async function probeDuration(url: string): Promise<{ duration: number; videoCodec: string }> {
  return probeStream(url)
}

export async function startHlsStream(
  url: string,
  sessionId: string,
  videoCodec: string,
  audioStreams: AudioStreamInfo[] = [],
  startTime = 0,
): Promise<string> {
  const myGeneration = ++activeGeneration

  activeProcess?.kill('SIGTERM')
  activeProcess = null
  const prevDir = activeDir

  const dir = join(BASE_DIR, sessionId)
  await fs.mkdir(dir, { recursive: true })
  activeDir = dir

  if (prevDir) void fs.rm(prevDir, { recursive: true, force: true }).catch(() => {})

  const needsTranscode = videoCodec !== 'h264'
  const videoArgs = needsTranscode
    ? ['-vf', 'scale=-2:1080', '-c:v', 'libx264', '-preset', 'superfast', '-crf', '22']
    : ['-c:v', 'copy']

  if (needsTranscode) console.log(`[hls] Transcoding HEVC→H.264 for session ${sessionId}`)

  const multiAudio = audioStreams.length > 1

  let ffArgs: string[]
  let manifestFile: string

  if (multiAudio) {
    console.log(`[hls] Multi-audio HLS: ${audioStreams.length} tracks for session ${sessionId}`)
    const audioMaps = audioStreams.flatMap((_, i) => ['-map', `0:a:${i}`])
    const varStreamParts = [
      'v:0,agroup:audio',
      ...audioStreams.map((s, i) => {
        let entry = `a:${i},agroup:audio`
        const raw = s.title || s.language || `Track_${i + 1}`
        const name = raw.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || `Track_${i + 1}`
        if (s.language) entry += `,language:${s.language}`
        entry += `,name:${name}`
        return entry
      }),
    ]
    ffArgs = [
      '-loglevel', 'warning',
      ...HTTP_FLAGS,
      ...(startTime > 0 ? ['-ss', startTime.toString()] : []),
      '-i', url,
      '-map', '0:v:0',
      ...audioMaps,
      ...videoArgs,
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '0',
      '-hls_flags', 'independent_segments',
      '-var_stream_map', varStreamParts.join(' '),
      '-master_pl_name', 'master.m3u8',
      '-hls_segment_filename', 'stream_%v_%05d.ts',
      'stream_%v.m3u8',
    ]
    manifestFile = 'master.m3u8'
  } else {
    ffArgs = [
      '-loglevel', 'warning',
      ...HTTP_FLAGS,
      ...(startTime > 0 ? ['-ss', startTime.toString()] : []),
      '-i', url,
      '-map', '0:v:0',
      '-map', '0:a:0',
      ...videoArgs,
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '0',
      '-hls_playlist_type', 'event',
      '-hls_flags', 'independent_segments',
      '-hls_segment_filename', 'seg%05d.ts',
      'stream.m3u8',
    ]
    manifestFile = 'stream.m3u8'
  }

  const ff = spawn(ffmpegPath, ffArgs, { cwd: dir })

  activeProcess = ff
  ff.stderr.on('data', (d: Buffer) => console.warn(`[ffmpeg] ${d.toString().trimEnd()}`))
  ff.on('error', (err: Error) => console.error(`[ffmpeg] ${err.message}`))
  ff.on('close', (code) => {
    if (activeProcess === ff) activeProcess = null
    if (code !== 0 && code !== null) console.warn(`[ffmpeg] exited with code ${code}`)
  })

  await waitForFile(join(dir, manifestFile), myGeneration)

  if (multiAudio) {
    const masterPath = join(dir, manifestFile)
    const content = await fs.readFile(masterPath, 'utf-8')
    let idx = 0
    const patched = content.replace(/NAME="audio_\d+"/g, () => {
      const s = audioStreams[idx++]
      const name = (s?.title || s?.language || `Track ${idx}`)
        .replace(/"/g, "'").trim() || `Track ${idx}`
      return `NAME="${name}"`
    })
    await fs.writeFile(masterPath, patched, 'utf-8')
  }

  return `http://localhost:4000/api/hls/${sessionId}/${manifestFile}`
}

async function waitForFile(filePath: string, generation: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (generation !== activeGeneration) throw new StreamCancelledError()
    try { await fs.access(filePath); return } catch { /* not ready yet */ }
    await new Promise<void>((r) => setTimeout(r, 250))
  }
  throw new Error('HLS stream timed out waiting for first segment')
}

const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const FILENAME_RE = /^(master\.m3u8|stream(?:_[a-zA-Z0-9_]+)?\.m3u8|seg\d{5}\.ts|stream_[a-zA-Z0-9_]+_\d{5}\.ts)$/

export function registerHlsRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { sessionId: string; filename: string } }>(
    '/api/hls/:sessionId/:filename',
    async (req, reply) => {
      const { sessionId, filename } = req.params
      if (!SESSION_RE.test(sessionId) || !FILENAME_RE.test(filename)) {
        return reply.status(400).send()
      }
      const filePath = join(BASE_DIR, sessionId, filename)
      try {
        const content = await fs.readFile(filePath)
        reply.header('Content-Type', filename.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t')
        reply.header('Content-Length', String(content.length))
        reply.header('Cache-Control', 'no-cache')
        return reply.send(content)
      } catch {
        return reply.status(404).send()
      }
    },
  )
}

export async function initHlsDir(): Promise<void> {
  await fs.rm(BASE_DIR, { recursive: true, force: true }).catch(() => {})
  await fs.mkdir(BASE_DIR, { recursive: true })
}
