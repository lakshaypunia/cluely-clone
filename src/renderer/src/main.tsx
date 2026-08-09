import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const isOverlay = new URLSearchParams(window.location.search).get('overlay') === '1'
if (isOverlay) {
  document.documentElement.classList.add('overlay-mode')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
