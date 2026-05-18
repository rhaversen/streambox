import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { init } from '@noriginmedia/norigin-spatial-navigation'
import { App } from './App.js'

const storedScale = localStorage.getItem('ui-scale')
if (storedScale) {
  document.documentElement.style.setProperty('--ui-scale', storedScale)
}

init({
  debug: false,
  visualDebug: false,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
