import { useState, useEffect, useCallback } from 'react'

export function useFocusGrid(rows: number, cols: number) {
  const [pos, setPos] = useState({ row: 0, col: 0 })

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight': setPos((p) => ({ ...p, col: Math.min(p.col + 1, cols - 1) })); break
        case 'ArrowLeft':  setPos((p) => ({ ...p, col: Math.max(p.col - 1, 0) })); break
        case 'ArrowDown':  setPos((p) => ({ row: Math.min(p.row + 1, rows - 1), col: p.col })); break
        case 'ArrowUp':    setPos((p) => ({ row: Math.max(p.row - 1, 0), col: p.col })); break
      }
    },
    [rows, cols]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  return pos
}
