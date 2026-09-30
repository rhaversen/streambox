import type { ChildProcess } from 'child_process'

/**
 * Result from probing a media file with ffprobe
 */
export interface ProbeResult {
  duration: number
  videoCodec: string
  hasAudio: boolean
}

/**
 * Media entry representing cached content
 * 
 * Each entry has a directory with HLS segments transcoded from source.
 */
export interface MediaEntry {
  dir: string
  process: ChildProcess | null
  status: 'running' | 'complete' | 'error'
  probe: ProbeResult
}
