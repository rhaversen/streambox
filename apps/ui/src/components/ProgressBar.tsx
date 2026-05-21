import { useState } from 'react'
import type { BufferedRange } from '../hooks/usePlayer.js'

interface ProgressBarProps {
  position: number
  duration: number
  buffered?: BufferedRange[]
  onSeek?: (position: number) => void
}

export function ProgressBar({ position, duration, buffered, onSeek }: ProgressBarProps) {
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)
  const percent = duration > 0 ? (position / duration) * 100 : 0

  function getEventRatio(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSeek || duration === 0) return
    onSeek(getEventRatio(e) * duration)
  }

  function formatTime(seconds: number) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
  }

  function formatRelative(seconds: number) {
    const sign = seconds >= 0 ? '+' : '-'
    return `${sign}${formatTime(Math.abs(seconds))}`
  }

  return (
    <div className="flex items-center gap-4">
      <span className="text-tv-sm text-white/70 tabular-nums w-16 text-right">{formatTime(position)}</span>
      <div
        className="flex-1 h-1.5 bg-white/10 rounded-full cursor-pointer relative"
        onClick={handleClick}
        onMouseMove={(e) => setHoverRatio(getEventRatio(e))}
        onMouseLeave={() => setHoverRatio(null)}
      >
        {buffered && duration > 0 && buffered.map((range, i) => (
          <div
            key={i}
            className="absolute inset-y-0 rounded-full bg-sky-400/50"
            style={{
              left: `${(range.start / duration) * 100}%`,
              width: `${((range.end - range.start) / duration) * 100}%`,
            }}
          />
        ))}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-sky-400"
          style={{ width: `${percent}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full -ml-1.5 shadow"
          style={{ left: `${percent}%` }}
        />
        {hoverRatio !== null && duration > 0 && (
          <>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-px h-4 bg-white/60 pointer-events-none"
              style={{ left: `${hoverRatio * 100}%` }}
            />
            <div
              className="absolute bottom-full mb-3 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-0.5 rounded whitespace-nowrap pointer-events-none"
              style={{ left: `${hoverRatio * 100}%` }}
            >
              {formatRelative(hoverRatio * duration - position)}
            </div>
          </>
        )}
      </div>
      <span className="text-tv-sm text-white/70 tabular-nums w-16">{formatTime(duration)}</span>
    </div>
  )
}
