import { create } from 'zustand'
import type { StreamInfo } from '@streambox/shared-types'

interface PlayerStore {
  streamInfo: StreamInfo
  setStreamInfo: (partial: Partial<StreamInfo>) => void
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  streamInfo: {
    loading: false,
    duration: 0,
    title: '',
  },
  setStreamInfo: (partial) =>
    set((s) => ({ streamInfo: { ...s.streamInfo, ...partial } })),
}))
