import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { DockApp, TrayIcon, WindowThumb } from './global'
import Icon from './Icon'
import { tr } from './i18n'

/**
 * The dock, at the foot of the panel while the Windows taskbar is hidden: pinned (starred) apps first, then other
 * open apps. One icon per app, like the taskbar.
 *
 * Click: an app that isn't open starts; one that is comes to the front; clicking the app in use minimizes it, or, when
 * it has several windows, brings up the next one. Middle-click or Shift+click: a new window, as on the taskbar.
 * Right-click: open a new window, pick one of its windows, pin or unpin, close. Start and Task view sit at the left end.
 * The mark under an icon: a dot per open window (up to three), wide for the app in use, pulsing for attention.
 * Hover an open app: a picture of each of its windows; click one to bring it up, or its X to close it.
 */
export default function Dock({ apps, tray, unseen, onHold, onInbox }: { apps: DockApp[]; tray: TrayIcon[]; unseen: number; onHold: (held: boolean) => void; onInbox: () => void }): React.JSX.Element {
  const inboxLabel = unseen > 0 ? tr('Inbox, {0} new', unseen) : tr('Inbox')
  const click = (a: DockApp): void => {
    if (a.wins.length === 0) {
      void window.overlay.windowsLaunch(a.key)
      return
    }
    const active = a.wins.find((w) => w.active && !w.minimized)
    // Windows come in last-used order, so the last one is the one used longest ago: clicking again cycles through all.
    const target = !active ? a.wins[0] : a.wins.length > 1 ? a.wins[a.wins.length - 1] : active
    void window.overlay.windowsClick(target.id)
  }
  const menu = async (a: DockApp): Promise<void> => {
    onHold(true)
    await window.overlay.windowsMenu(a.key).catch(() => false)
    onHold(false)
  }
  // --- hover previews: after a short rest on an open app, then instantly while moving between apps ---
  const [peek, setPeek] = useState<{ key: string; x: number; items: WindowThumb[] | null } | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const peekTimer = useRef(0)
  const hideTimer = useRef(0)
  const peekFor = useRef<string | null>(null)
  useEffect(() => () => {
    window.clearTimeout(peekTimer.current)
    window.clearTimeout(hideTimer.current)
  }, [])
  const closePeek = (): void => {
    window.clearTimeout(peekTimer.current)
    window.clearTimeout(hideTimer.current)
    peekFor.current = null
    setPeek(null)
  }
  const peekEnter = (a: DockApp, el: HTMLElement): void => {
    window.clearTimeout(hideTimer.current)
    window.clearTimeout(peekTimer.current)
    if (a.wins.length === 0) {
      if (peek) hideTimer.current = window.setTimeout(closePeek, 200)
      return
    }
    const open = (): void => {
      const area = areaRef.current
      if (!area) return
      const r = el.getBoundingClientRect()
      const p = area.getBoundingClientRect()
      peekFor.current = a.key
      setPeek({ key: a.key, x: r.left + r.width / 2 - p.left, items: null })
      void window.overlay
        .windowsThumbs(a.key)
        .catch(() => [])
        .then((items) => {
          if (peekFor.current === a.key) setPeek((cur) => (cur && cur.key === a.key ? { ...cur, items } : cur))
        })
    }
    if (peek) open()
    else peekTimer.current = window.setTimeout(open, 450)
  }
  const peekLeave = (): void => {
    window.clearTimeout(peekTimer.current)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(closePeek, 220)
  }
  const peekApp = peek ? apps.find((a) => a.key === peek.key) : undefined
  // while the pictures load, show the titles Gabay already knows
  const peekItems: WindowThumb[] =
    peek && peekApp
      ? peek.items && peek.items.length > 0
        ? peek.items
        : peekApp.wins.slice(0, 8).map((w) => ({ id: w.id, title: w.title, thumb: null }))
      : []
  const CARD = 156
  const peekWidth = peekItems.length * CARD + Math.max(0, peekItems.length - 1) * 6 + 14
  const areaWidth = areaRef.current?.clientWidth ?? 480
  const peekLeft = peek ? Math.max(0, Math.min(areaWidth - Math.min(peekWidth, areaWidth), peek.x - peekWidth / 2)) : 0

  // screenshot previews can start with a hover preview open (#…&peek=1)
  useEffect(() => {
    if (new URLSearchParams(location.hash.slice(1)).get('peek') !== '1') return
    const t = window.setTimeout(() => {
      const a = apps.find((x) => x.wins.length > 1) ?? apps.find((x) => x.wins.length > 0)
      const el = a && areaRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(a.key)}"]`)
      if (a && el) peekEnter(a, el)
    }, 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // screenshot previews can start with the drawer open (#…&tray=1)
  const [trayOpen, setTrayOpen] = useState(() => new URLSearchParams(location.hash.slice(1)).get('tray') === '1')
  const showTray = trayOpen && tray.length > 0
  // Left: the app opens its window, so the row closes. Right: the app opens its menu; the panel and the row stay
  // open under it until it closes, so the menu never floats on its own.
  const trayClick = async (id: string, button: 'l' | 'r'): Promise<void> => {
    if (button === 'l') {
      setTrayOpen(false)
      void window.overlay.trayClick(id, 'l')
      return
    }
    onHold(true)
    await window.overlay.trayClick(id, 'r').catch(() => false)
    onHold(false)
  }
  return (
    <div className="dock-area" ref={areaRef}>
    <AnimatePresence>
      {peek && peekApp && peekItems.length > 0 && (
        <motion.div
          key="peek"
          className="peek"
          role="group"
          aria-label={tr('{0} windows', peekApp.name)}
          style={{ left: peekLeft, maxWidth: areaWidth }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          onMouseEnter={() => window.clearTimeout(hideTimer.current)}
          onMouseLeave={peekLeave}
        >
          {peekItems.map((w) => (
            <div key={w.id} className="peek-win">
              <button
                className="peek-pick"
                title={w.title || peekApp.name}
                onClick={() => {
                  closePeek()
                  void window.overlay.windowsFocus(w.id)
                }}
              >
                <span className="peek-title">{w.title || peekApp.name}</span>
                <span className="peek-thumb">
                  {w.thumb ? (
                    <img src={w.thumb} alt="" draggable={false} />
                  ) : peekApp.icon ? (
                    <img className="peek-icon" src={peekApp.icon} alt="" draggable={false} />
                  ) : (
                    <Icon name="app-window" size={24} />
                  )}
                </span>
              </button>
              <button
                className="peek-close"
                title={tr('Close window')}
                aria-label={tr('Close {0}', w.title || peekApp.name)}
                onClick={() => {
                  void window.overlay.windowsClose(w.id)
                  setPeek((cur) => (cur && cur.items ? { ...cur, items: cur.items.filter((x) => x.id !== w.id) } : cur))
                }}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
    <div
      className="dock"
      role="toolbar"
      aria-label={tr('Dock')}
      onWheel={(e) => {
        // A plain wheel scrolls the row sideways when there are more apps than fit.
        closePeek()
        e.currentTarget.scrollLeft += e.deltaY + e.deltaX
      }}
    >
      <span className="dock-start">
        <button className="dock-app dock-sys" title={tr('Start')} aria-label={tr('Start')} onClick={() => void window.overlay.startMenu()}>
          <Icon name="layout-grid" size={18} />
        </button>
        <button className="dock-app dock-sys" title={tr('Task view')} aria-label={tr('Task view')} onClick={() => void window.overlay.taskView()}>
          <Icon name="copy" size={18} />
        </button>
      </span>
      {apps.map((a) => {
        const open = a.wins.length > 0
        const inUse = a.wins.some((w) => w.active && !w.minimized)
        const attention = a.wins.some((w) => w.attention)
        const allMin = open && a.wins.every((w) => w.minimized)
        const tip =
          (a.wins.length === 1 ? a.wins[0].title : a.wins.length > 1 ? tr('{0} ({1} windows)', a.name, a.wins.length) : a.name) +
          (attention ? tr(' · wants your attention') : '')
        return (
          <button
            key={a.key}
            data-key={a.key}
            className={['dock-app', inUse && 'on', allMin && 'min', attention && 'attn', !open && 'closed'].filter(Boolean).join(' ')}
            title={tip}
            aria-label={tip}
            onClick={(e) => {
              closePeek()
              if (e.shiftKey) void window.overlay.windowsLaunch(a.key)
              else click(a)
            }}
            onMouseEnter={(e) => peekEnter(a, e.currentTarget)}
            onMouseLeave={peekLeave}
            onAuxClick={(e) => {
              if (e.button !== 1) return
              e.preventDefault()
              void window.overlay.windowsLaunch(a.key)
            }}
            onMouseDown={(e) => e.button === 1 && e.preventDefault() /* no autoscroll on middle-click */}
            onContextMenu={(e) => {
              e.preventDefault()
              closePeek()
              void menu(a)
            }}
          >
            {a.icon ? <img src={a.icon} alt="" draggable={false} /> : <Icon name="app-window" size={20} />}
            {open && (
              <span className="dock-marks" aria-hidden="true">
                {a.wins.slice(0, 3).map((w) => (
                  <i key={w.id} />
                ))}
              </span>
            )}
          </button>
        )
      })}
      <span className="dock-corner">
      {tray.length > 0 && (
        <button
          className={trayOpen ? 'dock-app dock-sys dock-tray-btn on' : 'dock-app dock-sys dock-tray-btn'}
          title={tr('Tray icons')}
          aria-label={tr('Tray icons')}
          aria-expanded={trayOpen}
          onClick={() => setTrayOpen((o) => !o)}
        >
          <Icon name="chevron-right" size={18} />
        </button>
      )}
      <button className="dock-app dock-sys" title={inboxLabel} aria-label={inboxLabel} onClick={onInbox}>
        <Icon name="bell" size={18} />
        {/* new notifications since the Inbox was last looked at, as on the taskbar's bell */}
        {unseen > 0 && <span className="dock-badge" aria-hidden="true">{unseen > 9 ? '9+' : unseen}</span>}
      </button>
      <button className="dock-app dock-desktop" title={tr('Show desktop')} aria-label={tr('Show desktop')} onClick={() => void window.overlay.showDesktop()}>
        <Icon name="monitor" size={18} />
      </button>
      </span>
    </div>
    <AnimatePresence initial={false}>
      {showTray && (
        <motion.div
          key="tray"
          className="tray-row"
          role="group"
          aria-label={tr('Tray icons')}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 40 }}
          onKeyDown={(e) => e.key === 'Escape' && setTrayOpen(false)}
        >
          <div className="tray-row-inner">
            {tray.map((t, i) => (
              <motion.button
                key={t.id}
                className="tray-drawer-icon"
                title={t.tip}
                aria-label={t.tip || tr('Tray icon')}
                initial={{ y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: Math.min(i, 12) * 0.02, duration: 0.18 }}
                onClick={() => void trayClick(t.id, 'l')}
                onContextMenu={(e) => {
                  e.preventDefault()
                  void trayClick(t.id, 'r')
                }}
              >
                <img src={t.icon} alt="" draggable={false} />
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  )
}
