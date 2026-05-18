import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { ContentRow } from '../components/ContentRow.js'
import type { MediaCard } from '@streambox/shared-types'

async function search(query: string): Promise<MediaCard[]> {
  if (!query) return []
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
  return res.json() as Promise<MediaCard[]>
}

export function Browse() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { ref, focusKey } = useFocusable({ focusKey: 'BROWSE' })
  const { data: results = [] } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search(query),
    enabled: query.length > 1,
  })

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="w-full h-full bg-black pt-8 px-16">
        <input
          className="w-full bg-zinc-800 text-tv-lg rounded px-6 py-4 mb-10 outline-none focus:ring-2 focus:ring-white"
          placeholder="Search for a show or movie…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {results.length > 0 && (
          <ContentRow
            focusKey="ROW_SEARCH"
            title="Results"
            items={results}
            onSelect={(item) => navigate(`/detail/${item.imdbId}`)}
          />
        )}
      </div>
    </FocusContext.Provider>
  )
}
