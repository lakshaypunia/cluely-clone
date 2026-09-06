import './assets/main.css'

import { createRoot } from 'react-dom/client'
import App from './App'

const isOverlay = new URLSearchParams(window.location.search).get('overlay') === '1'
if (isOverlay) {
  document.documentElement.classList.add('overlay-mode')
}

// No StrictMode: its dev-only double-invoke of effects double-registers the
// window.electron.ipcRenderer.on(...) listeners this app relies on for
// global-shortcut push events (capture:result, shortcut:send, etc.) —
// harmless for the idempotent ones, but it duplicated queued screenshots.
createRoot(document.getElementById('root')!).render(<App />)
