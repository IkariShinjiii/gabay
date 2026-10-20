import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Icon from './Icon'
import type { OpenWindow } from './global'

const REFRESH_MS = 2000
// By window handle plus app: Windows reuses handles, so the handle alone could show another app's icon.
const icons = new Map<string, string | null>()

function WindowIcon({ id, app }: { id: string; app: string }): React.JSX.Element {
  const key = `${id}|${app}`
  const [url, setUrl] = useState<string | null | undefined>(icons.get(key))
  useEffect(() => {
    if (icons.has(key)) {
      setUrl(icons.get(key))
      return
    }
    let stale = false
    void window.overlay
      .windowIcon(id)
      .catch(() => null)
      .then((u) => {
        icons.set(key, u)
        if (!stale) setUrl(u)
      })
    return () => {
      stale = true
    }
  }, [id, key])
  return url ? (
    <img className="win-icon" src={url} alt="" width={28} height={28} draggable={false} />
  ) : (
    <span className="win-icon win-icon-none">
      <Icon name="app-window" size={18} />
    </span>
  )
}

/** Friendly app name from the exe name: "chrome" -> "Chrome", "WindowsTerminal" -> "Windows Terminal". */
const appLabel = (exe: string): string =>
  exe ? exe.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()) : 'App'

/**
 * Open windows, most recently used first, the way a taskbar shows them. Click switches to it; the x closes it
 * (politely: the app can still ask to save). Mounted only while visible, so its refresh stops with the panel.
 */
export default function WindowsPanel({
  query,
  command,
  onSwitched
}: {
  query: string
  /** The bar holds a command: Enter belongs to it, not to the window list. */
  command: boolean
  onSwitched: () => void
}): React.JSX.Element {
  const [list, setList] = useState<OpenWindow[] | null>(null)
  const [sel, setSel] = useState(0)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setList(await window.overlay.listWindows())
    } catch {
      setList((l) => l ?? [])
    }
  }, [])
  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const q = query.trim().toLowerCase()
  const shown = (list ?? []).filter((w) => !q || w.title.toLowerCase().includes(q) || w.app.toLowerCase().includes(q))
  useEffect(() => setSel(0), [q])

  const focus = async (w: OpenWindow): Promise<void> => {
    await window.overlay.focusWindow(w.id)
    onSwitched()
  }
  const close = async (w: OpenWindow): Promise<void> => {
    setList((l) => l?.filter((x) => x.id !== w.id) ?? null) // optimistic; the next refresh is the truth
    await window.overlay.closeWindow(w.id)
    window.setTimeout(() => void refresh(), 400)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') setSel((s) => Math.min(s + 1, shown.length - 1))
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') setSel((s) => Math.max(s - 1, 0))
      else if (e.key === 'Enter' && !command && shown[sel]) void focus(shown[sel])
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (list === null) return <div className="body body-center muted">Finding windows…</div>
  if (!shown.length) return <div className="body body-center muted">{q ? 'No matching windows' : 'No open windows'}</div>

  return (
    <div className="body wins" role="listbox" aria-label="Open windows">
      <AnimatePresence initial={false}>
        {shown.slice(0, 12).map((w, i) => (
          <motion.div
            key={w.id}
            layout="position"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className={i === sel ? 'win sel' : 'win'}
            role="option"
            aria-selected={i === sel}
            onMouseEnter={() => setSel(i)}
          >
            <button className="win-main" title={w.title} onClick={() => void focus(w)}>
              <WindowIcon id={w.id} app={w.app} />
              <span className="win-text">
                <span className="win-title">{w.title}</span>
                <span className="win-app">
                  {appLabel(w.app)}
                  {w.minimized ? ' · minimized' : w.active ? ' · in front' : ''}
                </span>
              </span>
            </button>
            <button className="win-close" aria-label={`Close ${w.title}`} title="Close" onClick={() => void close(w)}>
              <Icon name="x" size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
