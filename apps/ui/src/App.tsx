import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { FocusProvider } from './components/FocusProvider.js'
import { Home } from './screens/Home.js'
import { Browse } from './screens/Browse.js'
import { Detail } from './screens/Detail.js'
import { Player } from './screens/Player.js'
import { Settings } from './screens/Settings.js'

const queryClient = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FocusProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/detail/:imdbId" element={<Detail />} />
            <Route path="/player/:imdbId/:season?/:episode?" element={<Player />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </BrowserRouter>
      </FocusProvider>
    </QueryClientProvider>
  )
}
