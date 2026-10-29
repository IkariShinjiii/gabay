import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { HIDE_DELAY_MS, NOTCH, REVEAL_DWELL_MS } from './constants'
import type { DockApp, DockLook, TrayIcon } from './global'
import Dock from './Dock'
import { SAMPLE_TRAY, SAMPLE_WINS } from './App'
import { applyAccent, resolveAccent } from './accent'
import { setLanguage, type Language } from './i18n'

const SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const
const OPEN_DWELL_MS = 120 // a pass across the top edge on the way to a tab doesn't open it
const CLOSE_MS = 400
const fmtClock = (): string => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * The notch on every other screen while the Windows taskbar is hidden: a slim strip with the time that opens to just
 * the dock, so each screen keeps a way to switch apps. Window previews open below the dock here.
 * Preview with `#mini=1&preview=1` (sample apps) and `&open=1` (opened).
 */
export default function MiniDock(): React.JSX.Element {
  const hash = new URLSearchParams(location.hash.slice(1))
  const preview = hash.get('preview') !== null
  const [apps, setApps] = useState<DockApp[]>(preview ? SAMPLE_WINS : [])
  const [tray, setTray] = useState<TrayIcon[]>(preview ? SAMPLE_TRAY : [])
  const [open, setOpen] = useState(preview && hash.get('open') === '1')
  const [clock, setClock] = useState(fmtClock)
  const [lang, setLang] = useState<Language>('en')
  setLanguage(lang)
  const [auto, setAuto] = useState(false) // auto-hide: parked above the screen until the pointer rests on the edge
  const [revealed, setRevealed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const notchRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)
  const held = useRef(false) // a right-click menu is up
  const openTimer = useRef(0)
  const closeTimer = useRef(0)
  const edgeTimer = useRef(0)
  const hideTimer = useRef(0)
  const state = useRef({ auto: false, revealed: false, fullscreen: false })
  state.current = { auto, revealed, fullscreen }

  // the look follows the main notch's settings
  useEffect(() => {
    const apply = (l: DockLook): void => {
      void resolveAccent(l.accent).then(applyAccent)
      setLang((hash.get('lang') as Language | null) ?? (l.language as Language))
      setAuto(l.visibility === 'auto')
    }
    void window.overlay.dockLook().then(apply, () => undefined)
    return window.overlay.onDockLook(apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (preview) return
    const offW = window.overlay.onWindows((w) => setApps(w as DockApp[]))
    const offT = window.overlay.onTray((t) => setTray(t as TrayIcon[]))
    void window.overlay.windowsGet().then(setApps, () => undefined)
    void window.overlay.trayGet().then(setTray, () => undefined)
    return () => {
      offW()
      offT()
    }
  }, [preview])

  useEffect(() => {
    let id = 0
    const next = (): void => {
      setClock(fmtClock())
      id = window.setTimeout(next, 60_000 - (Date.now() % 60_000) + 50)
    }
    id = window.setTimeout(next, 60_000 - (Date.now() % 60_000) + 50)
    return () => window.clearTimeout(id)
  }, [])

  const show = (o: boolean): void => {
    if (openRef.current === o) return
    openRef.current = o
    setOpen(o)
    window.overlay.setInteractive(o)
    // asked on opening: catches what no shell message reports (a switch of virtual desktop)
    if (o && !preview) void window.overlay.windowsGet().then(setApps, () => undefined)
  }
  const scheduleClose = (): void => {
    window.clearTimeout(openTimer.current)
    openTimer.current = 0
    if (!openRef.current || closeTimer.current) return
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = 0
      if (!held.current) show(false)
    }, CLOSE_MS)
  }

  useEffect(() => {
    if (preview) return
    // While click-through, Electron forwards mousemove only, which is all this needs. The window previews hang below
    // the notch but belong to it, so the test is "over anything of the notch's", not its rectangle.
    const onMove = (e: MouseEvent): void => {
      const s = state.current
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const inside = !!el?.closest('.mini') && !s.fullscreen && (!s.auto || s.revealed || openRef.current)
      if (inside) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = 0
        window.clearTimeout(hideTimer.current)
        hideTimer.current = 0
        if (!openRef.current && !openTimer.current) {
          openTimer.current = window.setTimeout(() => {
            openTimer.current = 0
            show(true)
          }, OPEN_DWELL_MS)
        }
        return
      }
      scheduleClose()
      if (!s.auto || s.fullscreen) return
      // auto-hide: a rest at the very top edge within the notch's width brings it down
      const atEdge = e.clientY <= 3 && Math.abs(e.clientX - window.innerWidth / 2) <= NOTCH.collapsed.width / 2 + 24
      if (!s.revealed) {
        if (!atEdge) {
          window.clearTimeout(edgeTimer.current)
          edgeTimer.current = 0
        } else if (!edgeTimer.current) {
          edgeTimer.current = window.setTimeout(() => {
            edgeTimer.current = 0
            setRevealed(true)
          }, REVEAL_DWELL_MS)
        }
      } else if (!openRef.current && !hideTimer.current) {
        hideTimer.current = window.setTimeout(() => {
          hideTimer.current = 0
          if (!openRef.current) setRevealed(false)
        }, HIDE_DELAY_MS)
      }
    }
    const onLeave = (): void => {
      window.clearTimeout(edgeTimer.current)
      edgeTimer.current = 0
      scheduleClose()
      if (state.current.revealed && !hideTimer.current) {
        hideTimer.current = window.setTimeout(() => {
          hideTimer.current = 0
          if (!openRef.current) setRevealed(false)
        }, HIDE_DELAY_MS)
      }
    }
    const offFs = window.overlay.onFullscreen((fs) => {
      setFullscreen(fs)
      if (fs) {
        held.current = false
        show(false)
      }
    })
    const offClose = window.overlay.onDockClose(() => {
      held.current = false
      for (const t of [openTimer, closeTimer, edgeTimer, hideTimer]) {
        window.clearTimeout(t.current)
        t.current = 0
      }
      setRevealed(false)
      show(false)
    })
    document.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      offFs()
      offClose()
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
      for (const t of [openTimer, closeTimer, edgeTimer, hideTimer]) window.clearTimeout(t.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview])

  const parked = fullscreen || (auto && !revealed && !open)
  const hasDock = apps.length > 0 || tray.length > 0
  return (
    <motion.div
      ref={notchRef}
      className={open ? 'notch mini open' : 'notch mini'}
      initial={false}
      animate={{
        width: open ? NOTCH.expanded.width : NOTCH.collapsed.width,
        y: parked ? -(NOTCH.collapsed.height + 4) : 0,
        borderBottomLeftRadius: open ? 24 : NOTCH.collapsedBottomRadius,
        borderBottomRightRadius: open ? 24 : NOTCH.collapsedBottomRadius
      }}
      transition={SPRING}
    >
      <div className="mini-clock">{clock}</div>
      {open && hasDock && (
        <motion.div className="mini-body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16, delay: 0.08 }}>
          <Dock
            apps={apps}
            tray={tray}
            unseen={0}
            peekBelow
            onHold={(h) => {
              held.current = h
              if (!h) scheduleClose()
            }}
          />
        </motion.div>
      )}
    </motion.div>
  )
}
