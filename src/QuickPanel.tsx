import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Icon from './Icon'
import type { IconName } from './icons'
import type { ProjectMode, QuickAction, QuickState, SettingsKey } from './global'
import type { BatteryInfo } from './useBattery'
import { batteryIcon } from './NotchStatus'

const POLL_MS = 3000

type Tile =
  | { kind: 'view'; view: 'project'; label: string; icon: IconName }
  | { kind: 'toggle'; id: 'wifi' | 'bluetooth' | 'airplane'; label: string; icon: IconName; settings: SettingsKey }
  | { kind: 'link'; label: string; icon: IconName; settings: SettingsKey }

// Two pages, like Windows quick settings. Toggles act directly; the rest open their Windows Settings page, because
// Windows gives apps no supported switch for them (energy saver, night light, hotspot and the like).
const PAGES: Tile[][] = [
  [
    { kind: 'toggle', id: 'wifi', label: 'Wi-Fi', icon: 'wifi', settings: 'network' },
    { kind: 'toggle', id: 'bluetooth', label: 'Bluetooth', icon: 'bluetooth', settings: 'bluetooth' },
    { kind: 'toggle', id: 'airplane', label: 'Airplane mode', icon: 'plane', settings: 'network' },
    { kind: 'link', label: 'Energy saver', icon: 'leaf', settings: 'energy' },
    { kind: 'link', label: 'Accessibility', icon: 'accessibility', settings: 'accessibility' },
    { kind: 'view', view: 'project', label: 'Project', icon: 'presentation' }
  ],
  [
    { kind: 'link', label: 'Live captions', icon: 'captions', settings: 'captions' },
    { kind: 'link', label: 'Night light', icon: 'sun-moon', settings: 'nightlight' },
    { kind: 'link', label: 'Mobile hotspot', icon: 'radio-tower', settings: 'hotspot' },
    { kind: 'link', label: 'Nearby sharing', icon: 'share-2', settings: 'nearby' },
    { kind: 'link', label: 'Cast', icon: 'cast', settings: 'cast' },
    { kind: 'link', label: 'Notifications', icon: 'bell', settings: 'notifications' }
  ]
]

/** Mounted only while the Quick tab is visible; its polling (and the helper process behind it) stops when it unmounts. */
export default function QuickPanel({ battery }: { battery: BatteryInfo | null }): React.JSX.Element {
  const [state, setState] = useState<QuickState | null>(null)
  const [page, setPage] = useState(0)
  // Dev preview can open a sub-view directly (#preview=Quick&sub=project); normal use always starts on the main view.
  const [view, setView] = useState<'main' | 'project'>(() =>
    new URLSearchParams(location.hash.slice(1)).get('sub') === 'project' ? 'project' : 'main'
  )
  const [dir, setDir] = useState(1)
  // While a slider is being dragged its local value wins over polled values, so the thumb doesn't jump back.
  const [dragVol, setDragVol] = useState<number | null>(null)
  const [dragBright, setDragBright] = useState<number | null>(null)
  const sendTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const tick = async (): Promise<void> => {
      try {
        const s = await window.overlay.quickGet()
        if (!cancelled) setState(s)
      } catch {
        // Main refused or is closing; keep the last values.
      }
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearTimeout(sendTimer.current)
    }
  }, [])

  const act = async (action: QuickAction): Promise<void> => {
    try {
      setState(await window.overlay.quickSet(action))
    } catch {
      // Keep the last values.
    }
  }

  // Sliders send at most every 120 ms while moving, then once more with the final value.
  const slide = (kind: 'volume' | 'brightness', value: number): void => {
    if (kind === 'volume') setDragVol(value)
    else setDragBright(value)
    window.clearTimeout(sendTimer.current)
    sendTimer.current = window.setTimeout(() => {
      void act({ kind, value }).then(() => (kind === 'volume' ? setDragVol(null) : setDragBright(null)))
    }, 120)
  }

  if (!state) return <div className="body body-center">Loading…</div>

  if (view === 'project') return <ProjectView onBack={() => setView('main')} />

  const wifiOn = state.radios.wifi
  const btOn = state.radios.bluetooth
  // Windows' real airplane-mode flag. Turning Wi-Fi off with Bluetooth already off is not airplane mode.
  const airplaneOn = state.airplane ?? undefined
  const toggleState = (id: 'wifi' | 'bluetooth' | 'airplane'): boolean | undefined =>
    id === 'wifi' ? wifiOn : id === 'bluetooth' ? btOn : airplaneOn

  const sub = (t: Tile): string | null => {
    if (t.kind !== 'toggle') return null
    if (t.id === 'wifi') return wifiOn ? (state.wifi.ssid ?? 'On') : 'Off'
    const on = toggleState(t.id)
    return on === undefined ? 'Unavailable' : on ? 'On' : 'Off'
  }

  const volume = dragVol ?? (state.volume !== null ? Math.round(state.volume * 100) : null)
  const brightness = dragBright ?? state.brightness
  const volIcon: IconName = state.muted || volume === 0 ? 'volume-x' : (volume ?? 0) < 50 ? 'volume-1' : 'volume-2'

  return (
    <div className="body quick">
      {/* Pages slide like iOS: the new page enters from the side it was picked on. */}
      <div className="q-grid-wrap">
      <AnimatePresence initial={false} custom={dir} mode="popLayout">
      <motion.div
        key={page}
        className="q-grid"
        custom={dir}
        initial={{ x: dir * 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: dir * -60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      >
        {PAGES[page].map((t) => {
          const on = t.kind === 'toggle' ? toggleState(t.id) : undefined
          const disabled = t.kind === 'toggle' && on === undefined
          return (
            <motion.button
              key={t.label}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              className={on ? 'q-tile on' : 'q-tile'}
              aria-pressed={t.kind === 'toggle' ? !!on : undefined}
              disabled={disabled}
              title={t.kind === 'link' ? `Open ${t.label} settings` : t.kind === 'view' ? t.label : `${t.label}: right-click for settings`}
              onClick={() => {
                if (t.kind === 'view') setView(t.view)
                else if (t.kind === 'link') void window.overlay.quickOpen(t.settings)
                else if (t.id === 'airplane') void act({ kind: 'airplane' })
                else void act({ kind: 'radio', radio: t.id, on: !on })
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                if (t.kind !== 'view') void window.overlay.quickOpen(t.settings)
              }}
            >
              <Icon name={t.kind === 'toggle' && t.id === 'wifi' && !on ? 'wifi-off' : t.icon} size={18} />
              <span className="q-label">{t.label}</span>
              {sub(t) && <span className="q-sub">{sub(t)}</span>}
              {t.kind === 'view' && <span className="q-chev"><Icon name="chevron-right" size={14} /></span>}
            </motion.button>
          )
        })}
      </motion.div>
      </AnimatePresence>
      </div>

      <div className="q-sliders">
        {brightness !== null && (
          <label className="q-slider">
            <Icon name="sun" size={16} />
            <input
              type="range"
              className="q-range"
              min={0}
              max={100}
              value={brightness}
              style={{ '--pct': `${brightness}%` } as React.CSSProperties}
              aria-label="Brightness"
              onChange={(e) => slide('brightness', Number(e.target.value))}
            />
            <span className="q-val">{brightness}</span>
          </label>
        )}
        {volume !== null && (
          <label className="q-slider">
            <button
              className="q-icon-btn"
              aria-label={state.muted ? 'Unmute' : 'Mute'}
              title={state.muted ? 'Unmute' : 'Mute'}
              onClick={(e) => {
                e.preventDefault()
                void act({ kind: 'mute' })
              }}
            >
              <Icon name={volIcon} size={16} />
            </button>
            <input
              type="range"
              className="q-range"
              min={0}
              max={100}
              value={volume}
              style={{ '--pct': `${state.muted ? 0 : volume}%` } as React.CSSProperties}
              aria-label="Volume"
              onChange={(e) => slide('volume', Number(e.target.value))}
            />
            <span className="q-val">{state.muted ? 'Muted' : volume}</span>
          </label>
        )}
      </div>

      <div className="q-foot">
        {battery && (
          <span className="q-battery">
            <Icon name={batteryIcon(battery)} size={16} />
            {Math.round(battery.level * 100)}%{battery.charging ? ', charging' : ''}
          </span>
        )}
        {state.layout && <span className="q-layout">{state.layout}</span>}
        <span className="q-dots">
          {PAGES.map((_, i) => (
            <button
              key={i}
              className={i === page ? 'q-dot on' : 'q-dot'}
              aria-label={`Page ${i + 1}`}
              onClick={() => {
                setDir(i > page ? 1 : -1)
                setPage(i)
              }}
            />
          ))}
        </span>
        <button className="q-icon-btn" title="Open Windows Settings" aria-label="Open Windows Settings" onClick={() => void window.overlay.quickOpen('settings')}>
          <Icon name="settings" size={16} />
        </button>
      </div>
    </div>
  )
}

const PROJECT_MODES: { mode: ProjectMode; label: string; icon: IconName }[] = [
  { mode: 'internal', label: 'PC screen only', icon: 'laptop' },
  { mode: 'clone', label: 'Duplicate', icon: 'copy' },
  { mode: 'extend', label: 'Extend', icon: 'columns-2' },
  { mode: 'external', label: 'Second screen only', icon: 'monitor' }
]

/** The Win+P chooser, inside the Quick tab. The current mode carries the accent bar, as in Windows. */
function ProjectView({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [mode, setMode] = useState<ProjectMode | null>(null)
  const [busy, setBusy] = useState<ProjectMode | null>(null)

  useEffect(() => {
    void window.overlay.projectGet().then(setMode, () => undefined)
  }, [])

  const pick = async (m: ProjectMode): Promise<void> => {
    if (busy) return
    setBusy(m)
    await window.overlay.projectSet(m).catch(() => false)
    // Windows takes a moment to rearrange the displays; read the result once it has settled.
    window.setTimeout(() => {
      void window.overlay.projectGet().then(setMode, () => undefined)
      setBusy(null)
    }, 1500)
  }

  return (
    <motion.div
      className="body quick-sub"
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
    >
      <div className="sub-head">
        <button className="q-icon-btn" aria-label="Back" title="Back" onClick={onBack}>
          <Icon name="arrow-left" size={16} />
        </button>
        <span>Project</span>
      </div>
      <div className="proj-list" role="radiogroup" aria-label="Display mode">
        {PROJECT_MODES.map((p) => (
          <motion.button
            key={p.mode}
            role="radio"
            aria-checked={mode === p.mode}
            whileTap={{ scale: 0.98 }}
            className={mode === p.mode ? 'proj-row on' : 'proj-row'}
            disabled={busy !== null}
            onClick={() => void pick(p.mode)}
          >
            {mode === p.mode && <motion.span layoutId="proj-marker" className="proj-marker" />}
            <Icon name={p.icon} size={18} />
            <span>{busy === p.mode ? `${p.label}…` : p.label}</span>
          </motion.button>
        ))}
      </div>
      <button className="sub-link" onClick={() => void window.overlay.quickOpen('display')}>
        More display settings
      </button>
    </motion.div>
  )
}
