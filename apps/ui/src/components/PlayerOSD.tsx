import { useState } from 'react'
import type { JSX } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Captions, Music, AlertCircle } from 'lucide-react'
import { ProgressBar } from './ProgressBar.js'
import type { TextTrackInfo, AudioTrackInfo, BufferedRange } from '../hooks/usePlayer.js'

interface PlayerOSDProps {
  title: string
  episode?: string
  videoPaused: boolean
  position: number
  duration: number
  visible: boolean
  volume: number
  muted: boolean
  textTracks: TextTrackInfo[]
  audioTracks: AudioTrackInfo[]
  buffered?: BufferedRange[]
  videoError: string | null
  onSeek?: (position: number) => void
  onPlayPause: () => void
  onRewind: () => void
  onForward: () => void
  onVolumeChange: (v: number) => void
  onToggleMute: () => void
  onSelectTextTrack: (index: number | null) => void
  onSelectAudioTrack: (id: number) => void
}

function TrackSelector({
  icon = <Captions size={16} />,
  items,
  onSelect,
  nullable = true,
}: {
  icon?: JSX.Element
  items: { key: string | number; label: string; active: boolean }[]
  onSelect: (key: string | number | null) => void
  nullable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const active = items.find((i) => i.active)

  return (
    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
      <button
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-tv-sm text-white transition-colors"
      >
        {icon}
        <span>{active?.label ?? (nullable ? 'Off' : '')}</span>
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 right-0 min-w-36 bg-black/90 rounded border border-white/10 overflow-hidden">
          {nullable && (
            <button
              tabIndex={0}
              className="w-full text-left px-4 py-2 text-tv-sm text-white/70 hover:bg-white/10"
              onClick={() => { onSelect(null); setOpen(false) }}
            >
              Off
            </button>
          )}
          {items.map((item) => (
            <button
              key={item.key}
              tabIndex={0}
              className={`w-full text-left px-4 py-2 text-tv-sm hover:bg-white/10 ${item.active ? 'text-white font-semibold' : 'text-white/70'}`}
              onClick={() => { onSelect(item.key); setOpen(false) }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function PlayerOSD({
  title, episode, videoPaused, position, duration,
  visible, volume, muted, textTracks, audioTracks, buffered, videoError,
  onSeek, onPlayPause, onRewind, onForward,
  onVolumeChange, onToggleMute, onSelectTextTrack, onSelectAudioTrack,
}: PlayerOSDProps) {
  const isPlaying = !videoPaused
  const effectiveVolume = muted ? 0 : volume

  const subtitleItems = textTracks.map((t) => ({
    key: t.index,
    label: t.label || t.language || `Track ${t.index + 1}`,
    active: t.active,
  }))

  const audioItems = audioTracks.map((t) => ({
    key: t.id,
    label: t.name,
    active: t.active,
  }))

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-16 pb-12 pt-24"
        >
          <div className="mb-4">
            <div className="text-tv-xl font-bold">{title}</div>
            {episode && (
              <div className="text-tv-base text-white/70">{episode}</div>
            )}
          </div>

          <ProgressBar position={position} duration={duration} buffered={buffered} onSeek={onSeek} />

          <div className="flex items-center gap-4 mt-4">
            <button onClick={onRewind} className="p-2 rounded hover:bg-white/10 transition-colors" title="-10s">
              <RotateCcw size={20} />
            </button>
            <button onClick={onPlayPause} className="p-2 rounded hover:bg-white/10 transition-colors">
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <button onClick={onForward} className="p-2 rounded hover:bg-white/10 transition-colors" title="+30s">
              <RotateCw size={20} />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <button onClick={onToggleMute} className="p-2 rounded hover:bg-white/10 transition-colors">
                {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={effectiveVolume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="w-24 accent-white cursor-pointer"
              />
            </div>

            <TrackSelector
              icon={<Music size={16} />}
              items={audioItems}
              onSelect={(key) => key !== null && onSelectAudioTrack(Number(key))}
              nullable={false}
            />

            <TrackSelector
              items={subtitleItems}
              onSelect={(key) => onSelectTextTrack(key === null ? null : Number(key))}
            />
          </div>

          {videoError && (
            <div className="flex items-center gap-2 mt-3 text-red-300 text-tv-sm">
              <AlertCircle size={16} />
              <span>{videoError}</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
