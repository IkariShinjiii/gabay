import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Icon from './Icon'
import type { IconName } from './icons'
import type { MediaInfo, ProjectMode, QuickAction, QuickState, SettingsKey } from './global'
import type { BatteryInfo } from './useBattery'
import { batteryIcon } from './NotchStatus'

const POLL_MS = 3000
const PRESS = { whileTap: { scale: 0.96 }, transition: { type: 'spring', stiffness: 600, damping: 32 } } as const

// Second page: everything Windows quick settings has that the first page doesn't. Airplane mode switches directly;
// the rest open their Windows Settings page (Windows gives apps no supported switch for them).
type MoreTile =
  | { kind: 'airplane'; label: string; icon: IconName }
  | { kind: 'view'; label: string; icon: IconName }
  | { kind: 'link'; label: string; icon: IconName; settings: SettingsKey }
const MORE: MoreTile[] = [
  { kind: 'airplane', label: 'Airplane mode', icon: 'plane' },
  { kind: 'link', label: 'Energy saver', icon: 'leaf', settings: 'energy' },
  { kind: 'view', label: 'Project', icon: 'presentation' },
  { kind: 'link', label: 'Accessibility', icon: 'accessibility', settings: 'accessibility' },
  { kind: 'link', label: 'Live captions', icon: 'captions', settings: 'captions' },
  { kind: 'link', label: 'Mobile hotspot', icon: 'radio-tower', settings: 'hotspot' },
  { kind: 'link', label: 'Nearby sharing', icon: 'share-2', settings: 'nearby' },
  { kind: 'link', label: 'Cast', icon: 'cast', settings: 'cast' },
  { kind: 'link', label: 'Notifications', icon: 'bell', settings: 'notifications' }
]

/** A split tile like the reference: the main part acts, the chevron part opens the related Windows Settings page. */
function SplitTile(props: {
  icon: IconName
  label: string
  sub: string
  on: boolean
  disabled?: boolean
  onMain: () => void
  settings: SettingsKey
  mainTitle?: string
}): React.JSX.Element {
  return (
    <div className={props.on ? 'ct on' : 'ct'}>
      <motion.button
        {...PRESS}
        className="ct-main"
        aria-pressed={props.on}
        disabled={props.disabled}
        title={props.mainTitle}
        onClick={props.onMain}
      >
        <span className="ct-well">
          <Icon name={props.icon} size={16} />
        </span>
        <span className="ct-text">
          <span className="ct-label">{props.label}</span>
          <span className="ct-sub">{props.sub}</span>
        </span>
      </motion.button>
      <button
        className="ct-chev"
        aria-label={`${props.label} settings`}
        title={`${props.label} settings`}
        onClick={() => void window.overlay.quickOpen(props.settings)}
      >
        <Icon name="chevron-right" size={14} />
      </button>
    </div>
  )
}

/** Thick slider: the whole bar is the control, the icon and value sit inside it. */
function BigSlider(props: {
  icon: IconName
  label: string
  value: number
  shown: string
  onChange: (v: number) => void
  onIcon?: () => void
  iconLabel?: string
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(100, props.value))
  return (
    <div className="big" style={{ '--pct': `${pct}%` } as React.CSSProperties}>
      <input
        type="range"
        className="big-range"
        min={0}
        max={100}
        value={pct}
        aria-label={props.label}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.onIcon ? (
        <button className={pct > 6 ? 'big-icon on-fill' : 'big-icon'} aria-label={props.iconLabel} title={props.iconLabel} onClick={props.onIcon}>
          <Icon name={props.icon} size={15} />
        </button>
      ) : (
        <span className={pct > 6 ? 'big-icon on-fill' : 'big-icon'}>
          <Icon name={props.icon} size={15} />
        </span>
      )}
      <span className={pct > 88 ? 'big-val on-fill' : 'big-val'}>{props.shown}</span>
    </div>
  )
}

const fmt = (s: number): string => {
  const t = Math.max(0, Math.floor(s))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Now playing, from Windows' media session (any app that reports to the volume flyout: browsers, Spotify, ...). */
function MediaCard({ media, device, onCommand }: { media: MediaInfo; device: string | null; onCommand: (c: 'toggle' | 'next' | 'prev') => void }): React.JSX.Element {
  // Windows only updates the position now and then; extrapolate while playing so the bar moves smoothly.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!media.playing) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [media.playing])
  const elapsed = media.playing && media.updated ? (now - media.updated) / 1000 : 0
  const pos = media.duration ? Math.min(media.duration, media.position + elapsed) : media.position + elapsed
  const pct = media.duration ? (pos / media.duration) * 100 : 0

  return (
    <motion.div
      className="media"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
    >
      {device && (
        <div className="media-src">
          <Icon name="volume-2" size={12} />
          {device}
        </div>
      )}
      <div className="media-main">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={media.title + media.artist}
            className="media-art"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {media.art ? <img src={media.art} alt="" draggable={false} /> : <Icon name="music" size={20} />}
          </motion.div>
        </AnimatePresence>
        <div className="media-text">
          <div className="media-title" title={media.title}>{media.title || 'Unknown title'}</div>
          <div className="media-artist" title={media.artist}>{media.artist}</div>
        </div>
        <div className="media-ctl">
          <motion.button {...PRESS} className="media-btn" aria-label="Previous" title="Previous" onClick={() => onCommand('prev')}>
            <Icon name="skip-back" size={15} />
          </motion.button>
          <motion.button
            {...PRESS}
            className="media-play"
            aria-label={media.playing ? 'Pause' : 'Play'}
            title={media.playing ? 'Pause' : 'Play'}
            onClick={() => onCommand('toggle')}
          >
            <Icon name={media.playing ? 'pause' : 'play'} size={16} />
          </motion.button>
          <motion.button {...PRESS} className="media-btn" aria-label="Next" title="Next" onClick={() => onCommand('next')}>
            <Icon name="skip-forward" size={15} />
          </motion.button>
        </div>
      </div>
      {media.duration > 0 && (
        <div className="media-time">
          <span>{fmt(pos)}</span>
          <div className="media-bar">
            <div className="media-fill" style={{ width: `${pct}%` }} />
          </div>
          <span>{fmt(media.duration)}</span>
        </div>
      )}
    </motion.div>
  )
}

/** Mounted only while the Controls tab is visible; its polling (and the helper process behind it) stops when it unmounts. */
export default function QuickPanel({ battery }: { battery: BatteryInfo | null }): React.JSX.Element {
  const [state, setState] = useState<QuickState | null>(null)
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState(1)
  // Dev preview can open a sub-view directly (#preview=Controls&sub=project); normal use always starts on the main view.
  const [view, setView] = useState<'main' | 'project'>(() =>
    new URLSearchParams(location.hash.slice(1)).get('sub') === 'project' ? 'project' : 'main'
  )
  // While a slider is being dragged its local value wins over polled values, so it doesn't jump back.
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

  // Sliders send once the value has rested for 120 ms, then release the local override.
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
  const volume = dragVol ?? (state.volume !== null ? Math.round(state.volume * 100) : null)
  const brightness = dragBright ?? state.brightness
  const volIcon: IconName = state.muted || volume === 0 ? 'volume-x' : (volume ?? 0) < 50 ? 'volume-1' : 'volume-2'
  const goPage = (i: number): void => {
    setDir(i > page ? 1 : -1)
    setPage(i)
  }

  return (
    <div className="body controls">
      <AnimatePresence initial={false} custom={dir} mode="popLayout">
        {page === 0 ? (
          <motion.div
            key="main"
            className="ct-page"
            initial={{ x: dir * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir * -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div className="ct-row three">
              <SplitTile
                icon={wifiOn === false ? 'wifi-off' : 'wifi'}
                label="Wi-Fi"
                sub={wifiOn === undefined ? 'Unavailable' : wifiOn ? (state.wifi.ssid ?? 'On') : 'Off'}
                on={!!wifiOn}
                disabled={wifiOn === undefined}
                onMain={() => void act({ kind: 'radio', radio: 'wifi', on: !wifiOn })}
                settings="network"
              />
              <SplitTile
                icon="bluetooth"
                label="Bluetooth"
                sub={btOn === undefined ? 'Unavailable' : btOn ? 'On' : 'Off'}
                on={!!btOn}
                disabled={btOn === undefined}
                onMain={() => void act({ kind: 'radio', radio: 'bluetooth', on: !btOn })}
                settings="bluetooth"
              />
              <SplitTile
                icon={state.muted ? 'volume-x' : 'volume-2'}
                label="Audio"
                sub={state.muted ? 'Muted' : (state.audioName ?? 'Output')}
                on={state.volume !== null && !state.muted}
                disabled={state.volume === null}
                mainTitle={state.muted ? 'Unmute' : 'Mute'}
                onMain={() => void act({ kind: 'mute' })}
                settings="sound"
              />
            </div>
            <div className="ct-row two">
              <SplitTile
                icon="moon"
                label="Night light"
                sub="Schedule and strength"
                on={false}
                mainTitle="Open Night light settings"
                onMain={() => void window.overlay.quickOpen('nightlight')}
                settings="nightlight"
              />
              <SplitTile
                icon="contrast"
                label="Dark mode"
                sub={state.dark === null ? 'Unavailable' : state.dark ? 'On' : 'Off'}
                on={!!state.dark}
                disabled={state.dark === null}
                onMain={() => void act({ kind: 'dark', on: !state.dark })}
                settings="colors"
              />
            </div>

            {volume !== null && (
              <BigSlider
                icon={volIcon}
                label="Volume"
                value={state.muted ? 0 : volume}
                shown={state.muted ? 'Muted' : `${volume}%`}
                onChange={(v) => slide('volume', v)}
                onIcon={() => void act({ kind: 'mute' })}
                iconLabel={state.muted ? 'Unmute' : 'Mute'}
              />
            )}
            {brightness !== null && (
              <BigSlider icon="sun" label="Brightness" value={brightness} shown={`${brightness}%`} onChange={(v) => slide('brightness', v)} />
            )}

            {state.media && <MediaCard media={state.media} device={state.audioName} onCommand={(c) => void act({ kind: 'media', command: c })} />}
          </motion.div>
        ) : (
          <motion.div
            key="more"
            className="ct-page"
            initial={{ x: dir * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir * -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div className="more-grid">
              {MORE.map((t) => {
                const on = t.kind === 'airplane' ? !!state.airplane : false
                return (
                  <motion.button
                    key={t.label}
                    {...PRESS}
                    className={on ? 'more-tile on' : 'more-tile'}
                    aria-pressed={t.kind === 'airplane' ? on : undefined}
                    disabled={t.kind === 'airplane' && state.airplane === null}
                    title={t.kind === 'link' ? `Open ${t.label} settings` : t.label}
                    onClick={() => {
                      if (t.kind === 'airplane') void act({ kind: 'airplane' })
                      else if (t.kind === 'view') setView('project')
                      else void window.overlay.quickOpen(t.settings)
                    }}
                  >
                    <span className="ct-well">
                      <Icon name={t.icon} size={16} />
                    </span>
                    <span className="ct-label">{t.label}</span>
                    {t.kind === 'view' && <Icon name="chevron-right" size={13} />}
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="q-foot">
        {battery && (
          <span className="q-battery">
            <Icon name={batteryIcon(battery)} size={16} />
            {Math.round(battery.level * 100)}%{battery.charging ? ', charging' : ''}
          </span>
        )}
        {state.layout && <span className="q-layout">{state.layout}</span>}
        <span className="q-dots">
          {[0, 1].map((i) => (
            <button key={i} className={i === page ? 'q-dot on' : 'q-dot'} aria-label={i === 0 ? 'Controls' : 'More'} onClick={() => goPage(i)} />
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

/** The Win+P chooser, inside the Controls tab. The current mode carries the accent bar, as in Windows. */
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
