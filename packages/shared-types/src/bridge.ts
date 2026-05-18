import type { StreamInfo } from './player.js'

export type BridgeMessage =
  | { type: 'PLAY'; payload: { imdbId: string; season?: number; episode?: number } }
  | { type: 'STREAM_INFO'; payload: StreamInfo }
  | { type: 'NEXT_EPISODE'; payload: Record<string, never> }
  | { type: 'SEEK_STREAM'; payload: { position: number } }
