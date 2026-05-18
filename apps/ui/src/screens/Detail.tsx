import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation'
import type { MediaItem, Show, Season } from '@streambox/shared-types'
import { isShow } from '@streambox/shared-types'

async function fetchDetail(imdbId: string): Promise<MediaItem> {
  const res = await fetch(`/api/detail/${imdbId}`)
  return res.json() as Promise<MediaItem>
}

export function Detail() {
  const { imdbId = '' } = useParams()
  const navigate = useNavigate()
  const { ref, focusKey } = useFocusable({ focusKey: 'DETAIL' })
  const [seasonIndex, setSeasonIndex] = useState(0)

  const { data: item } = useQuery({
    queryKey: ['detail', imdbId],
    queryFn: () => fetchDetail(imdbId),
    enabled: !!imdbId,
  })

  if (!item) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <span className="text-tv-lg text-white/50">Loading…</span>
      </div>
    )
  }

  function handlePlay(season?: number, episode?: number) {
    if (season !== undefined && episode !== undefined) {
      navigate(`/player/${imdbId}/${season}/${episode}`)
    } else {
      navigate(`/player/${imdbId}`)
    }
  }

  const show = isShow(item) ? item : null
  const movie = !isShow(item) ? item : null
  const currentSeason = show?.seasons[seasonIndex] ?? null
  const year = show?.firstAirDate.slice(0, 4) ?? movie?.releaseDate.slice(0, 4)
  const meta = [year, movie?.runtime ? `${movie.runtime}m` : null, ...item.genres.slice(0, 3)]
    .filter(Boolean).join(' · ')

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="w-full h-full bg-black overflow-hidden relative">
        {item.backdropPath && (
          <div
            className="absolute inset-0"
            style={{ backgroundImage: `url(${item.backdropPath})`, backgroundSize: 'cover', backgroundPosition: 'center top' }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/30" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
          </div>
        )}

        <div className="relative z-10 flex h-full">
          <div className="flex flex-col px-16 pt-20 max-w-2xl flex-1 min-h-0">
            {meta && <div className="text-white/50 text-tv-sm mb-2 tracking-wide">{meta}</div>}
            <h1 className="text-tv-2xl font-black mb-4">{item.title}</h1>
            <p className="text-tv-base text-white/70 mb-8 line-clamp-3">{item.overview}</p>

            <div className="flex gap-4 mb-10">
              {show ? (
                <PlayButton label="Play S1E1" onPress={() => handlePlay(1, 1)} focusKey="PLAY_BTN" />
              ) : (
                <PlayButton label="Play" onPress={() => handlePlay()} focusKey="PLAY_BTN" />
              )}
            </div>

            {show && (
              <>
                {show.seasons.length > 1 && (
                  <div className="flex gap-2 mb-6 flex-wrap">
                    {show.seasons.map((s, i) => (
                      <button
                        key={s.seasonNumber}
                        onClick={() => setSeasonIndex(i)}
                        className={`px-5 py-2 rounded text-tv-sm font-semibold transition-colors ${
                          i === seasonIndex ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'
                        }`}
                      >
                        S{s.seasonNumber}
                      </button>
                    ))}
                  </div>
                )}
                {currentSeason && <EpisodeList season={currentSeason} onPlay={handlePlay} />}
              </>
            )}
          </div>

          {item.posterPath && (
            <div className="hidden xl:flex flex-col pt-20 pr-16 w-52 shrink-0">
              <img src={item.posterPath} alt={item.title} className="w-full rounded-xl shadow-2xl" />
            </div>
          )}
        </div>
      </div>
    </FocusContext.Provider>
  )
}

function PlayButton({ label, onPress, focusKey }: { label: string; onPress: () => void; focusKey: string }) {
  const { ref, focused } = useFocusable({ focusKey, onEnterPress: onPress })
  return (
    <button
      ref={ref}
      onClick={onPress}
      className={`px-10 py-4 text-tv-lg font-bold rounded ${focused ? 'bg-white text-black' : 'bg-white/20 text-white'}`}
    >
      {label}
    </button>
  )
}

function EpisodeList({ season, onPlay }: { season: Season; onPlay: (s: number, e: number) => void }) {
  return (
    <div className="min-h-0 flex-1 flex flex-col">
      <div className="text-white/40 text-tv-sm uppercase tracking-widest mb-3">
        Season {season.seasonNumber} · {season.episodeCount} episodes
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto pr-2">
        {season.episodes.map((ep) => (
          <EpisodeRow
            key={ep.episode}
            season={season.seasonNumber}
            episode={ep.episode}
            title={ep.title}
            runtime={ep.runtime}
            onPlay={onPlay}
          />
        ))}
      </div>
    </div>
  )
}

function EpisodeRow({
  season,
  episode,
  title,
  runtime,
  onPlay,
}: {
  season: number
  episode: number
  title: string
  runtime?: number
  onPlay: (s: number, e: number) => void
}) {
  const fk = `EP-${season}-${episode}`
  const { ref, focused } = useFocusable({ focusKey: fk, onEnterPress: () => onPlay(season, episode) })
  return (
    <div
      ref={ref}
      onClick={() => onPlay(season, episode)}
      className={`flex items-center gap-4 px-5 py-3 rounded cursor-pointer transition-colors ${
        focused ? 'bg-white text-black' : 'bg-white/5 hover:bg-white/10 text-white'
      }`}
    >
      <span className={`text-tv-sm shrink-0 w-7 tabular-nums ${focused ? 'text-black/40' : 'text-white/35'}`}>
        {String(episode).padStart(2, '0')}
      </span>
      <span className="text-tv-sm font-medium flex-1 truncate">{title}</span>
      {runtime !== undefined && (
        <span className={`text-tv-sm shrink-0 tabular-nums ${focused ? 'text-black/40' : 'text-white/35'}`}>
          {runtime}m
        </span>
      )}
    </div>
  )
}
