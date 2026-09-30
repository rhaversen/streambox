import { spawn, type ChildProcess } from 'child_process'
import { createRequire } from 'module'
import type { ProbeResult } from './types.js'
import { HTTP_FLAGS, FFPROBE_ANALYZE_DURATION, FFPROBE_PROBE_SIZE } from './constants.js'

const _require = createRequire(import.meta.url)
const ffmpegPath = _require('ffmpeg-static') as string
const ffprobePath = _require('ffprobe-static') as { path: string }

export { ffmpegPath, ffprobePath }

/**
 * Probe a media file to extract duration, codec, and audio info
 */
export async function probeMedia(url: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const ff = spawn(ffprobePath.path, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-analyzeduration', String(FFPROBE_ANALYZE_DURATION),
      '-probesize', String(FFPROBE_PROBE_SIZE),
      '-show_format',
      '-show_streams',
      ...HTTP_FLAGS,
      url,
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

/**
 * Build FFmpeg video transcode arguments based on codec
 */
export function buildVideoArgs(videoCodec: string, targetHeight: number, preset: string, crf: string): string[] {
  const needsTranscode = videoCodec !== 'h264'
  
  if (needsTranscode) {
    return [
      '-vf', `setpts=PTS-STARTPTS,scale=-2:${targetHeight}`,
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', crf,
    ]
  } else {
    return [
      '-vf', 'setpts=PTS-STARTPTS',
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', crf,
    ]
  }
}

/**
 * Build FFmpeg audio transcode arguments
 */
export function buildAudioArgs(hasAudio: boolean, bitrate: string, channels: number): string[] {
  if (!hasAudio) return []
  
  return [
    '-map', '0:a:0',
    '-af', 'asetpts=PTS-STARTPTS',
    '-c:a', 'aac',
    '-b:a', bitrate,
    '-ac', String(channels),
  ]
}

/**
 * Parse FFmpeg progress output to extract time in seconds
 * Progress format: "out_time_us=42500000" or "out_time=00:00:42.50"
 */
export function parseProgressTime(line: string): number | null {
  // Parse microseconds format: out_time_us=42500000
  const usMatch = line.match(/out_time_us=(\d+)/)
  if (usMatch) {
    return parseInt(usMatch[1], 10) / 1_000_000
  }
  
  // Parse timestamp format: out_time=00:00:42.50
  const timeMatch = line.match(/out_time=(\d{2}):(\d{2}):(\d{2}\.\d+)/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10)
    const minutes = parseInt(timeMatch[2], 10)
    const seconds = parseFloat(timeMatch[3])
    return hours * 3600 + minutes * 60 + seconds
  }
  
  return null
}
