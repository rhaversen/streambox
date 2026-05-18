import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { ContentRow } from '../components/ContentRow.js'
import type { MediaCard } from '@streambox/shared-types'

async function fetchTrendingMovies(): Promise<MediaCard[]> {
  const res = await fetch('/api/trending/movies')
  return res.json() as Promise<MediaCard[]>
}

async function fetchTrendingSeries(): Promise<MediaCard[]> {
  const res = await fetch('/api/trending/series')
  return res.json() as Promise<MediaCard[]>
}

export function Home() {
  const navigate = useNavigate()
  const { data: movies = [] } = useQuery({ queryKey: ['trending-movies'], queryFn: fetchTrendingMovies })
  const { data: series = [] } = useQuery({ queryKey: ['trending-series'], queryFn: fetchTrendingSeries })
  const { ref, focusKey } = useFocusable({ focusKey: 'HOME' })

  function handleSelect(item: MediaCard) {
    navigate(`/detail/${item.imdbId}`)
  }

  const featured = [...series, ...movies][0]

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="w-full h-full bg-black overflow-y-auto scrollbar-none">
        {featured?.backdropPath && (
          <div className="relative w-full h-[56rem] mb-4 flex-shrink-0">
            <img
              src={featured.backdropPath}
              alt={featured.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
            <div className="absolute bottom-20 left-16 max-w-3xl">
              <p className="text-tv-sm uppercase tracking-widest text-zinc-400 mb-3">
                {featured.type === 'series' ? 'Series' : 'Movie'} · {featured.year}
              </p>
              <h1 className="text-tv-4xl font-black tracking-tight leading-none mb-4">{featured.title}</h1>
              {featured.overview && (
                <p className="text-tv-sm text-zinc-300 line-clamp-3 leading-relaxed">{featured.overview}</p>
              )}
            </div>
          </div>
        )}
        {!featured?.backdropPath && (
          <div className="px-16 pt-12 mb-8">
            <h1 className="text-tv-2xl font-black tracking-tight">Streambox</h1>
          </div>
        )}
        <ContentRow
          focusKey="ROW_SERIES"
          title="Trending Series"
          items={series}
          onSelect={handleSelect}
        />
        <ContentRow
          focusKey="ROW_MOVIES"
          title="Trending Movies"
          items={movies}
          onSelect={handleSelect}
        />
      </div>
    </FocusContext.Provider>
  )
}
