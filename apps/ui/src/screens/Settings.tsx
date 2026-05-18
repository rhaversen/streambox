import { useState } from 'react'
import { useFocusable, FocusContext } from '@noriginmedia/norigin-spatial-navigation'

const SCALE_MIN = 0.6
const SCALE_MAX = 1.2
const SCALE_STEP = 0.05
const SCALE_DEFAULT = 0.833

function getStoredScale(): number {
  const stored = localStorage.getItem('ui-scale')
  return stored ? parseFloat(stored) : SCALE_DEFAULT
}

function applyScale(value: number) {
  document.documentElement.style.setProperty('--ui-scale', String(value))
  localStorage.setItem('ui-scale', String(value))
}

export function Settings() {
  const { ref, focusKey } = useFocusable({ focusKey: 'SETTINGS' })
  const [scale, setScale] = useState(getStoredScale)

  function handleScaleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = parseFloat(e.target.value)
    setScale(value)
    applyScale(value)
  }

  const scalePercent = Math.round((scale / SCALE_DEFAULT) * 100)

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="w-full h-full bg-zinc-900 px-16 pt-20">
        <h1 className="text-tv-2xl font-black mb-10">Settings</h1>
        <div className="flex flex-col gap-6 max-w-xl">
          <div className="bg-zinc-800 rounded px-6 py-5">
            <div className="text-tv-base font-semibold mb-1">UI Scale</div>
            <div className="text-tv-sm text-white/50 mb-4">{scalePercent}%</div>
            <input
              type="range"
              min={SCALE_MIN}
              max={SCALE_MAX}
              step={SCALE_STEP}
              value={scale}
              onChange={handleScaleChange}
              aria-label="UI Scale"
              title={`${scalePercent}%`}
              className="w-full accent-white"
            />
            <div className="flex justify-between text-tv-sm text-white/30 mt-1">
              <span>{Math.round(SCALE_MIN / SCALE_DEFAULT * 100)}%</span>
              <span>{Math.round(SCALE_MAX / SCALE_DEFAULT * 100)}%</span>
            </div>
          </div>
          <SettingRow label="Real-Debrid Token" hint="Set via .env on the backend" />
          <SettingRow label="TMDB API Key" hint="Set via .env on the backend" />
        </div>
      </div>
    </FocusContext.Provider>
  )
}

function SettingRow({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="bg-zinc-800 rounded px-6 py-4">
      <div className="text-tv-base font-semibold">{label}</div>
      <div className="text-tv-sm text-white/50">{hint}</div>
    </div>
  )
}
