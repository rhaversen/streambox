import { create } from 'zustand'

type Screen = 'home' | 'browse' | 'detail' | 'player' | 'settings'

interface NavigationStore {
  current: Screen
  history: Screen[]
  navigate: (screen: Screen) => void
  back: () => void
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  current: 'home',
  history: [],
  navigate: (screen) =>
    set((s) => ({ current: screen, history: [...s.history, s.current] })),
  back: () =>
    set((s) => {
      const history = [...s.history]
      const prev = history.pop() ?? 'home'
      return { current: prev, history }
    }),
}))
