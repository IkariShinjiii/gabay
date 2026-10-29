import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import MiniDock from './MiniDock'
import { APP_NAME } from './constants'
import './index.css'

document.title = APP_NAME

// Page errors go to main's short log, which a bug report includes.
window.addEventListener('error', (e) => window.overlay.logError(String(e.message)))
window.addEventListener('unhandledrejection', (e) => window.overlay.logError(String(e.reason)))

// The other screens' notches load this same page in its dock-only mode (#mini=1).
const mini = new URLSearchParams(location.hash.slice(1)).get('mini') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {mini ? <MiniDock /> : <App />}
  </StrictMode>
)
