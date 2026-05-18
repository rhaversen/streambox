import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation'
import { FocusCard } from './FocusCard.js'
import type { MediaCard } from '@streambox/shared-types'

interface ContentRowProps {
  title: string
  items: MediaCard[]
  focusKey: string
  onSelect?: (item: MediaCard) => void
}

export function ContentRow({ title, items, focusKey, onSelect }: ContentRowProps) {
  const { ref, focusKey: resolvedKey } = useFocusable({ focusKey })

  return (
    <FocusContext.Provider value={resolvedKey}>
      <div ref={ref} className="mb-12">
        <h2 className="text-tv-lg font-bold mb-4 px-16">{title}</h2>
        <div className="flex gap-4 px-16 overflow-x-auto scrollbar-none pb-4">
          {items.map((item) => (
            <FocusCard
              key={item.imdbId}
              focusKey={`${focusKey}-${item.imdbId}`}
              title={item.title}
              posterUrl={item.posterPath}
              year={item.year}
              onSelect={() => onSelect?.(item)}
            />
          ))}
        </div>
      </div>
    </FocusContext.Provider>
  )
}
