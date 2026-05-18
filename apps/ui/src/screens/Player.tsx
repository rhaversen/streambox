import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePlayer } from '../hooks/usePlayer.js'
import { PlayerOSD } from '../components/PlayerOSD.js'

export function Player() {
  const { imdbId, season, episode } = useParams<{ imdbId: string; season?: string; episode?: string }>()
  const { streamInfo, videoPaused, position, duration, osdVisible, videoRef, play, pause, resume, seek, showOsd,
    volume, muted, textTracks, audioTracks, buffered, videoError, setVolume, toggleMute, selectTextTrack, selectAudioTrack,
  } = usePlayer()
  const navigate = useNavigate()
  const sentRef = useRef<string | null>(null)

  useEffect(() => {
    if (!imdbId) return
    const key = `${imdbId}/${season ?? ''}/${episode ?? ''}`
    if (sentRef.current === key) return
    sentRef.current = key
    play(
      imdbId,
      season !== undefined ? Number(season) : undefined,
      episode !== undefined ? Number(episode) : undefined
    )
    showOsd()
  }, [imdbId, season, episode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      showOsd()
      switch (e.key) {
        case ' ':
          e.preventDefault()
          videoPaused ? resume() : pause()
          break
        case 'ArrowRight':
          seek(position + 30)
          break
        case 'ArrowLeft':
          seek(Math.max(0, position - 10))
          break
        case 'Escape':
          navigate(-1)
          break
      }
    }
    const handleMouseMove = () => showOsd()
    window.addEventListener('keydown', handleKey)
    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [videoPaused, position, pause, resume, seek, navigate, showOsd])

  return (
    <div className="fixed inset-0 bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
      />

      <PlayerOSD
        title={streamInfo.title}
        episode={streamInfo.episode}
        videoPaused={videoPaused}
        position={position}
        duration={duration}
        visible={osdVisible}
        volume={volume}
        muted={muted}
        textTracks={textTracks}
        audioTracks={audioTracks}
        buffered={buffered}
        videoError={videoError}
        onSeek={seek}
        onPlayPause={() => videoPaused ? resume() : pause()}
        onRewind={() => seek(Math.max(0, position - 10))}
        onForward={() => seek(position + 30)}
        onVolumeChange={setVolume}
        onToggleMute={toggleMute}
        onSelectTextTrack={selectTextTrack}
        onSelectAudioTrack={selectAudioTrack}
      />

      {videoError && (
        <div className="absolute top-4 left-4 right-4 z-50 bg-red-900/90 text-red-200 text-xs font-mono p-3 rounded break-all">
          {videoError}
        </div>
      )}

      {streamInfo.loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          {streamInfo.title && (
            <span className="text-tv-base text-white/70">{streamInfo.title}</span>
          )}
        </div>
      )}

      {!streamInfo.loading && !streamInfo.streamUrl && !streamInfo.errorMessage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <span className="text-tv-lg text-white/40">Nothing playing</span>
          <span className="text-tv-sm text-white/25">Select something to watch</span>
        </div>
      )}

      {streamInfo.errorMessage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
          <span className="text-tv-xl text-red-400">Playback error</span>
          <span className="text-tv-base text-white/50">{streamInfo.errorMessage}</span>
        </div>
      )}
    </div>
  )
}
