import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { APP_NAME } from './constants'
import './index.css'

document.title = APP_NAME

// Page errors go to main's short log, which a bug report includes.
window.addEventListener('error', (e) => window.overlay.logError(String(e.message)))
window.addEventListener('unhandledrejection', (e) => window.overlay.logError(String(e.reason)))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
