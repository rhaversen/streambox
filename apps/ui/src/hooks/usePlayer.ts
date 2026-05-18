import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { bridge } from '../ws/bridge.js'
import { usePlayerStore } from '../store/playerStore.js'

export interface TextTrackInfo {
  index: number
  label: string
  language: string
  kind: string
  active: boolean
}

export interface AudioTrackInfo {
  id: number
  name: string
  lang?: string
  active: boolean
}

export interface BufferedRange {
  start: number
  end: number
}

export function usePlayer() {
  const { streamInfo, setStreamInfo } = usePlayerStore()
  const [videoPaused, setVideoPaused] = useState(true)
  const [position, setPosition] = useState(0)
  const [localDuration, setLocalDuration] = useState(0)
  const [osdVisible, setOsdVisible] = useState(false)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMutedState] = useState(false)
  const [textTracks, setTextTracksState] = useState<TextTrackInfo[]>([])
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([])
  const [buffered, setBuffered] = useState<BufferedRange[]>([])
  const [videoError, setVideoError] = useState<string | null>(null)
  const osdTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    return bridge.subscribe((msg) => {
      if (msg.type === 'STREAM_INFO') setStreamInfo(msg.payload)
    })
  }, [setStreamInfo])

  // Load new stream via hls.js whenever the manifest URL changes
  useEffect(() => {
    const video = videoRef.current
    const url = streamInfo.streamUrl
    if (!video) return

    hlsRef.current?.destroy()
    hlsRef.current = null
    video.removeAttribute('src')
    video.load()
    setVideoError(null)
    setPosition(streamInfo.streamStartTime ?? 0)
    setLocalDuration(0)
    setVideoPaused(true)
    setAudioTracks([])
    setBuffered([])

    if (!url) return

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false, startPosition: 0, backBufferLength: 90 })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      const syncAudioTracks = () => {
        const tracks = hls.audioTracks
        const current = hls.audioTrack
        setAudioTracks(tracks.map((t, i) => ({
          id: i,
          name: t.name || `Track ${i + 1}`,
          lang: t.lang,
          active: i === current,
        })))
      }
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, syncAudioTracks)
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, syncAudioTracks)
      hls.once(Hls.Events.MANIFEST_PARSED, () => { void video.play(); syncAudioTracks() })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        console.error('[hls.js]', data.type, data.details, data.fatal, data.error)
        if (data.fatal) setVideoError(`HLS ${data.type}: ${data.details}`)
      })
    } else {
      video.src = url
      void video.play()
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [streamInfo.streamUrl])

  // Video element event listeners
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => setPosition(video.currentTime + (streamInfo.streamStartTime ?? 0))
    const onDurationChange = () => {
      if (isFinite(video.duration) && video.duration > 0) setLocalDuration(video.duration)
    }
    const onPlaying = () => { setVideoPaused(false); setVideoError(null) }
    const onPause = () => setVideoPaused(true)
    const onEnded = () => bridge.send({ type: 'NEXT_EPISODE', payload: {} })
    const onVolumeChange = () => { setVolumeState(video.volume); setMutedState(video.muted) }
    const onError = () => {
      const err = video.error
      if (err) setVideoError(`MediaError ${err.code}: ${err.message || mediaErrorMessage(err.code)}`)
    }
    const refreshTextTracks = () => {
      const tt: TextTrackInfo[] = []
      for (let i = 0; i < video.textTracks.length; i++) {
        const t = video.textTracks[i]!
        if (t.kind === 'subtitles' || t.kind === 'captions') {
          tt.push({ index: i, label: t.label || `Track ${i + 1}`, language: t.language, kind: t.kind, active: t.mode === 'showing' })
        }
      }
      setTextTracksState(tt)
    }

    video.textTracks.addEventListener('addtrack', refreshTextTracks)
    video.textTracks.addEventListener('removetrack', refreshTextTracks)
    const refreshBuffered = () => {
      const ranges: BufferedRange[] = []
      for (let i = 0; i < video.buffered.length; i++) {
        ranges.push({ start: video.buffered.start(i), end: video.buffered.end(i) })
      }
      setBuffered(ranges)
    }
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('volumechange', onVolumeChange)
    video.addEventListener('error', onError)
    video.addEventListener('progress', refreshBuffered)
    return () => {
      video.textTracks.removeEventListener('addtrack', refreshTextTracks)
      video.textTracks.removeEventListener('removetrack', refreshTextTracks)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('volumechange', onVolumeChange)
      video.removeEventListener('error', onError)
      video.removeEventListener('progress', refreshBuffered)
    }
  })

  const duration = streamInfo.duration > 0 ? streamInfo.duration : localDuration

  function showOsd() {
    setOsdVisible(true)
    clearTimeout(osdTimer.current)
    osdTimer.current = setTimeout(() => setOsdVisible(false), 4_000)
  }

  function play(imdbId: string, season?: number, episode?: number) {
    bridge.send({ type: 'PLAY', payload: { imdbId, season, episode } })
  }

  function pause() { videoRef.current?.pause(); showOsd() }
  function resume() { void videoRef.current?.play(); showOsd() }

  function seek(contentPosition: number) {
    const video = videoRef.current
    if (!video) return
    const startTime = streamInfo.streamStartTime ?? 0
    const videoTime = contentPosition - startTime
    let isBuffered = false
    for (let i = 0; i < video.buffered.length; i++) {
      if (videoTime >= video.buffered.start(i) && videoTime <= video.buffered.end(i)) {
        isBuffered = true
        break
      }
    }
    if (isBuffered) {
      video.currentTime = videoTime
    } else {
      bridge.send({ type: 'SEEK_STREAM', payload: { position: contentPosition } })
    }
    showOsd()
  }

  function setVolume(v: number) {
    const video = videoRef.current
    if (!video) return
    video.volume = Math.max(0, Math.min(1, v))
    video.muted = v === 0
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
  }

  function selectTextTrack(index: number | null) {
    const video = videoRef.current
    if (!video) return
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i]!.mode = i === index ? 'showing' : 'disabled'
    }
    setTextTracksState((prev) => prev.map((t) => ({ ...t, active: t.index === index })))
  }

  function selectAudioTrack(id: number) {
    if (hlsRef.current) hlsRef.current.audioTrack = id
  }

  return {
    streamInfo, videoPaused, position, duration,
    osdVisible, videoRef,
    volume, muted, textTracks, audioTracks, buffered, videoError,
    play, pause, resume, seek, showOsd,
    setVolume, toggleMute, selectTextTrack, selectAudioTrack,
  }
}

function mediaErrorMessage(code: number): string {
  switch (code) {
    case 1: return 'Fetching aborted'
    case 2: return 'Network error'
    case 3: return 'Decoding error'
    case 4: return 'Format or codec not supported'
    default: return 'Unknown error'
  }
}
