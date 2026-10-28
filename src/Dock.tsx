import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { DockApp, TrayIcon } from './global'
import Icon from './Icon'
import { tr } from './i18n'

/**
 * The dock, at the foot of the panel while the Windows taskbar is hidden: pinned (starred) apps first, then other
 * open apps. One icon per app, like the taskbar.
 *
 * Click: an app that isn't open starts; one that is comes to the front; clicking the app in use minimizes it, or, when
 * it has several windows, brings up the next one. Right-click: open a new window, pin or unpin, close.
 * The mark under an icon: a dot per open window (up to three), wide for the app in use, pulsing for attention.
 */
export default function Dock({ apps, tray, onHold, onInbox }: { apps: DockApp[]; tray: TrayIcon[]; onHold: (held: boolean) => void; onInbox: () => void }): React.JSX.Element {
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
    <>
    <div
      className="dock"
      role="toolbar"
      aria-label={tr('Dock')}
      onWheel={(e) => {
        // A plain wheel scrolls the row sideways when there are more apps than fit.
        e.currentTarget.scrollLeft += e.deltaY + e.deltaX
      }}
    >
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
            className={['dock-app', inUse && 'on', allMin && 'min', attention && 'attn', !open && 'closed'].filter(Boolean).join(' ')}
            title={tip}
            aria-label={tip}
            onClick={() => click(a)}
            onContextMenu={(e) => {
              e.preventDefault()
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
      <button className="dock-app dock-sys" title={tr('Inbox')} aria-label={tr('Inbox')} onClick={onInbox}>
        <Icon name="bell" size={18} />
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
    </>
  )
}
