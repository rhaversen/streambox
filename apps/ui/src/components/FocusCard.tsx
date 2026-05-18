import { useEffect } from 'react'
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { motion } from 'framer-motion'

interface FocusCardProps {
  title: string
  posterUrl?: string
  year?: string
  onSelect?: () => void
  focusKey: string
}

export function FocusCard({ title, posterUrl, year, onSelect, focusKey }: FocusCardProps) {
  const { ref, focused } = useFocusable({ focusKey, onEnterPress: onSelect })

  useEffect(() => {
    if (focused) {
      ref.current?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
    }
  }, [focused, ref])

  return (
    <motion.div
      ref={ref}
      animate={{ scale: focused ? 1.08 : 1 }}
      transition={{ duration: 0.15 }}
      className={`
        relative flex-shrink-0 w-48 h-72 rounded-lg overflow-hidden cursor-pointer
        ${focused ? 'ring-4 ring-white' : 'ring-0'}
      `}
      onClick={onSelect}
    >
      {posterUrl ? (
        <img src={posterUrl} alt={title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-zinc-800 flex items-end p-3">
          <span className="text-tv-sm font-semibold line-clamp-2">{title}</span>
        </div>
      )}
      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 transition-opacity duration-150 ${focused ? 'opacity-100' : 'opacity-0'}`}>
        <span className="text-tv-sm font-semibold line-clamp-2">{title}</span>
        {year && <span className="text-tv-xs text-zinc-400 block mt-0.5">{year}</span>}
      </div>
    </motion.div>
  )
}
