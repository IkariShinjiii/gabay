import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Icon from './Icon'
import type { IconName } from './icons'
import type { MediaInfo, ProjectMode, QuickAction, QuickState, SettingsKey, WifiNetwork } from './global'
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
  /** Chevron opens a list inside Gabay instead of Windows Settings. */
  onMore?: () => void
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
        aria-label={props.onMore ? `${props.label} list` : `${props.label} settings`}
        title={props.onMore ? `Show ${props.label} list` : `${props.label} settings`}
        onClick={() => (props.onMore ? props.onMore() : void window.overlay.quickOpen(props.settings))}
      >
        <Icon name="chevron-right" size={14} />
      </button>
    </div>
  )
}

const clamp = (v: number): number => Math.max(0, Math.min(100, v))

/**
 * iOS-style slider: the whole bar is the control. Dragging moves the value relative to where the pointer went down (it
 * doesn't jump), follows the pointer every frame with no easing, and stretches a little past either end like
 * Control Center. A tap without a drag jumps to that spot. Values stream to the parent while dragging.
 */
function BigSlider(props: {
  icon: IconName
  label: string
  value: number
  format: (v: number) => string
  onSlide: (v: number, done: boolean) => void
  onIcon?: () => void
  iconLabel?: string
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; start: number; w: number; moved: boolean } | null>(null)
  const [local, setLocal] = useState<number | null>(null) // wins over props while dragging and until the system catches up
  const [held, setHeld] = useState(false)
  const [stretch, setStretch] = useState(0) // -1..1: how far past an end the drag went
  const hold = useRef<number | undefined>(undefined)

  // Let go of the local value once the polled value agrees, or after a grace period (see finish).
  useEffect(() => {
    if (local !== null && !held && Math.abs(props.value - local) <= 1) setLocal(null)
  }, [props.value, local, held])
  useEffect(() => () => window.clearTimeout(hold.current), [])

  const v = local ?? props.value
  const pct = clamp(v)

  const finish = (value: number): void => {
    props.onSlide(value, true)
    window.clearTimeout(hold.current)
    hold.current = window.setTimeout(() => setLocal(null), 2000)
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    const el = ref.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, start: pct, w: el.getBoundingClientRect().width, moved: false }
    window.clearTimeout(hold.current)
    setHeld(true)
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    if (!d.moved && Math.abs(dx) < 3) return
    d.moved = true
    const raw = d.start + (dx / d.w) * 100
    const next = clamp(raw)
    const over = raw - next
    setStretch(over === 0 ? 0 : Math.sign(over) * Math.min(1, Math.sqrt(Math.abs(over) / 60)))
    if (next !== v) {
      setLocal(next)
      props.onSlide(next, false)
    }
  }
  const onUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    drag.current = null
    setHeld(false)
    setStretch(0)
    let value = local ?? pct
    if (!d.moved) {
      const r = ref.current?.getBoundingClientRect()
      if (r) value = clamp(((e.clientX - r.left) / r.width) * 100)
      setLocal(value)
    }
    finish(value)
  }
  // Scroll wheel: up raises, down lowers, 2% a notch (trackpads send smaller deltas and move it finer).
  const wheelDone = useRef<number | undefined>(undefined)
  const onWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    e.stopPropagation() // the Controls tab flips pages on wheel; a slider keeps it
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? -e.deltaY : e.deltaX
    if (!delta) return
    const next = clamp((local ?? pct) + Math.sign(delta) * Math.min(6, Math.max(1, Math.abs(delta) / 50)))
    if (next === (local ?? pct)) return
    setLocal(next)
    props.onSlide(next, false)
    window.clearTimeout(wheelDone.current)
    wheelDone.current = window.setTimeout(() => finish(next), 250)
  }
  useEffect(() => () => window.clearTimeout(wheelDone.current), [])

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? 10 : 5
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? clamp(pct + step)
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? clamp(pct - step)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? 100
              : null
    if (next === null) return
    e.preventDefault()
    setLocal(next)
    finish(next)
  }

  const shown = Math.round(pct)
  const sx = 1 + (held ? 0.015 : 0) + Math.abs(stretch) * 0.035
  const sy = held ? 1.1 - Math.abs(stretch) * 0.04 : 1
  return (
    <div
      ref={ref}
      className={held ? 'big held' : 'big'}
      role="slider"
      tabIndex={0}
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
      aria-valuetext={props.format(shown)}
      style={{
        transform: `scale(${sx}, ${sy})`,
        transformOrigin: stretch < 0 ? 'right center' : stretch > 0 ? 'left center' : 'center'
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
      onWheel={onWheel}
    >
      <div className="big-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      {props.onIcon ? (
        <button className={pct > 6 ? 'big-icon on-fill' : 'big-icon'} aria-label={props.iconLabel} title={props.iconLabel} onClick={props.onIcon}>
          <Icon name={props.icon} size={15} />
        </button>
      ) : (
        <span className={pct > 6 ? 'big-icon on-fill' : 'big-icon'}>
          <Icon name={props.icon} size={15} />
        </span>
      )}
      <span className={pct > 88 ? 'big-val on-fill' : 'big-val'}>{props.format(shown)}</span>
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
function MediaCard({
  media,
  device,
  onCommand,
  animateIn
}: {
  media: MediaInfo
  device: string | null
  onCommand: (c: 'toggle' | 'next' | 'prev') => void
  animateIn: boolean
}): React.JSX.Element {
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
      initial={animateIn ? { opacity: 0, y: 8 } : false}
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

// The last state seen, so reopening the tab paints at once; main also keeps one from a warm-up right after launch.
let cache: QuickState | null = null

/** Mounted only while the Controls tab is visible; its polling (and the helper process behind it) stops when it unmounts. */
export default function QuickPanel({ battery }: { battery: BatteryInfo | null }): React.JSX.Element {
  const [state, setStateRaw] = useState<QuickState | null>(cache)
  const setState = (s: QuickState): void => {
    cache = s
    setStateRaw(s)
  }
  // Media already there when the tab opens shows at once; only media that appears later animates in.
  const mediaAtMount = useRef(!!cache?.media)
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState(1)
  // Dev preview can open a sub-view directly (#preview=Controls&sub=project); normal use always starts on the main view.
  const [view, setView] = useState<'main' | 'project' | 'wifi' | 'bt'>(() =>
{
    const sub = new URLSearchParams(location.hash.slice(1)).get('sub')
    return sub === 'project' || sub === 'wifi' || sub === 'bt' ? sub : 'main'
  }
  )
  // Slider values stream to the system one at a time: while one is in flight only the newest waiting value is kept.
  const wheelLock = useRef(0)
  const busy = useRef({ volume: false, brightness: false })
  const pending = useRef<{ volume?: number; brightness?: number }>({})

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
    if (!cache)
      void window.overlay.quickPeek().then((s) => {
        if (!cancelled && s) setStateRaw((cur) => cur ?? s)
      })
    void tick()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  const act = async (action: QuickAction): Promise<void> => {
    try {
      setState(await window.overlay.quickSet(action))
    } catch {
      // Keep the last values.
    }
  }

  const pump = (kind: 'volume' | 'brightness'): void => {
    const v = pending.current[kind]
    if (busy.current[kind] || v === undefined) return
    pending.current[kind] = undefined
    busy.current[kind] = true
    void window.overlay
      .quickSlide(kind, v)
      .catch(() => undefined)
      .finally(() => {
        busy.current[kind] = false
        pump(kind)
      })
  }
  const unmuting = useRef(false)
  const slide = (kind: 'volume' | 'brightness', value: number, done: boolean): void => {
    // Dragging volume up while muted unmutes, as on a phone.
    if (kind === 'volume' && state?.muted && value > 0 && !unmuting.current) {
      unmuting.current = true
      void act({ kind: 'mute' }).finally(() => (unmuting.current = false))
    }
    pending.current[kind] = Math.round(value)
    pump(kind)
    void done
  }

  if (!state) return <div className="body body-center">Loading…</div>
  if (view === 'project') return <ProjectView onBack={() => setView('main')} />
  if (view === 'wifi') return <WifiView onBack={() => setView('main')} />
  if (view === 'bt') return <BluetoothView onBack={() => setView('main')} />

  const wifiOn = state.radios.wifi
  const btOn = state.radios.bluetooth
  const volume = state.volume !== null ? Math.round(state.volume * 100) : null
  const brightness = state.brightness
  const volIcon: IconName = state.muted || volume === 0 ? 'volume-x' : (volume ?? 0) < 50 ? 'volume-1' : 'volume-2'
  const goPage = (i: number): void => {
    if (i === page || i < 0 || i > 1) return
    setDir(i > page ? 1 : -1)
    setPage(i)
  }
  // Wheel anywhere else on the tab flips pages: down/right for the next one. One flip per gesture.
  const onWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    if (Math.abs(delta) < 4 || Date.now() < wheelLock.current) return
    wheelLock.current = Date.now() + 450
    goPage(page + (delta > 0 ? 1 : -1))
  }

  return (
    <div className="body controls" onWheel={onWheel}>
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
                onMore={() => setView('wifi')}
              />
              <SplitTile
                icon="bluetooth"
                label="Bluetooth"
                sub={btOn === undefined ? 'Unavailable' : btOn ? 'On' : 'Off'}
                on={!!btOn}
                disabled={btOn === undefined}
                onMain={() => void act({ kind: 'radio', radio: 'bluetooth', on: !btOn })}
                settings="bluetooth"
                onMore={() => setView('bt')}
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
                icon="plane"
                label="Airplane mode"
                sub={state.airplane === null ? 'Unavailable' : state.airplane ? 'On' : 'Off'}
                on={!!state.airplane}
                disabled={state.airplane === null}
                onMain={() => void act({ kind: 'airplane' })}
                settings="airplane"
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
                format={(v) => (state.muted ? 'Muted' : `${v}%`)}
                onSlide={(v, done) => slide('volume', v, done)}
                onIcon={() => void act({ kind: 'mute' })}
                iconLabel={state.muted ? 'Unmute' : 'Mute'}
              />
            )}
            {brightness !== null && (
              <BigSlider
                icon="sun"
                label="Brightness"
                value={brightness}
                format={(v) => `${v}%`}
                onSlide={(v, done) => slide('brightness', v, done)}
              />
            )}

            {state.media && (
              <MediaCard
                media={state.media}
                device={state.audioName}
                animateIn={!mediaAtMount.current}
                onCommand={(c) => void act({ kind: 'media', command: c })}
              />
            )}
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

function SubHead({ title, onBack, onRefresh, busy }: { title: string; onBack: () => void; onRefresh?: () => void; busy?: boolean }): React.JSX.Element {
  return (
    <div className="sub-head">
      <button className="q-icon-btn" aria-label="Back" title="Back" onClick={onBack}>
        <Icon name="arrow-left" size={16} />
      </button>
      <span>{title}</span>
      {onRefresh && (
        <button className={busy ? 'q-icon-btn sub-refresh spin' : 'q-icon-btn sub-refresh'} aria-label="Refresh" title="Scan again" onClick={onRefresh}>
          <Icon name="refresh-cw" size={14} />
        </button>
      )}
    </div>
  )
}

/** Signal strength as 1-4 bars. */
function Bars({ level }: { level: number }): React.JSX.Element {
  const n = level >= 75 ? 4 : level >= 50 ? 3 : level >= 25 ? 2 : 1
  return (
    <span className="sig" aria-label={`Signal ${level}%`}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= n ? 'on' : ''} style={{ height: `${i * 25}%` }} />
      ))}
    </span>
  )
}

/** Nearby networks. Saved ones connect in place; new ones open Windows Settings, so passwords never touch Gabay. */
function WifiView({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [data, setData] = useState<{ networks: WifiNetwork[]; error: 'off' | 'location' | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)

  const scan = useCallback(async (): Promise<void> => {
    setBusy(true)
    setData(await window.overlay.listWifi().catch(() => ({ networks: [], error: 'off' as const })))
    setBusy(false)
  }, [])
  useEffect(() => {
    void scan()
  }, [scan])

  const pick = async (n: WifiNetwork): Promise<void> => {
    if (n.connected) return
    if (!n.known) {
      void window.overlay.quickOpen('wifi')
      return
    }
    setJoining(n.ssid)
    await window.overlay.connectWifi(n.ssid)
    window.setTimeout(() => {
      setJoining(null)
      void scan()
    }, 2500)
  }

  return (
    <motion.div className="body quick-sub" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
      <SubHead title="Wi-Fi" onBack={onBack} onRefresh={() => void scan()} busy={busy} />
      {data === null ? (
        <div className="sub-empty">Scanning…</div>
      ) : data.networks.length === 0 ? (
        <div className="sub-empty">
          {data.error === 'location' ? 'Windows needs Location turned on to list networks.' : 'No networks found. Is Wi-Fi on?'}
        </div>
      ) : (
        <div className="net-list">
          {data.networks.map((n) => (
            <motion.button
              key={n.ssid}
              whileTap={{ scale: 0.98 }}
              className={n.connected ? 'net-row on' : 'net-row'}
              title={n.connected ? 'Connected' : n.known ? 'Connect' : 'Join in Windows Settings'}
              onClick={() => void pick(n)}
            >
              <Bars level={n.signal} />
              <span className="net-name">{n.ssid}</span>
              <span className="net-state">
                {joining === n.ssid ? 'Connecting…' : n.connected ? 'Connected' : n.known ? 'Saved' : ''}
                {n.secure && !n.connected && <Icon name="lock" size={11} />}
              </span>
            </motion.button>
          ))}
        </div>
      )}
      <div className="sub-links">
        {data?.networks.some((n) => n.connected) && (
          <button className="sub-link" onClick={() => void window.overlay.disconnectWifi().then(() => window.setTimeout(() => void scan(), 1200))}>
            Disconnect
          </button>
        )}
        <button className="sub-link" onClick={() => void window.overlay.quickOpen('wifi')}>
          More Wi-Fi settings
        </button>
      </div>
    </motion.div>
  )
}

/** Paired devices and whether each is connected. Connecting is done in Windows Settings (no supported API for it). */
function BluetoothView({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [list, setList] = useState<{ name: string; connected: boolean }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    setList(await window.overlay.listBluetooth().catch(() => []))
    setBusy(false)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const sorted = (list ?? []).slice().sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name))
  return (
    <motion.div className="body quick-sub" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
      <SubHead title="Bluetooth" onBack={onBack} onRefresh={() => void load()} busy={busy} />
      {list === null ? (
        <div className="sub-empty">Looking for devices…</div>
      ) : sorted.length === 0 ? (
        <div className="sub-empty">No paired devices, or Bluetooth is off.</div>
      ) : (
        <div className="net-list">
          {sorted.map((d) => (
            <button key={d.name} className={d.connected ? 'net-row on' : 'net-row'} onClick={() => void window.overlay.quickOpen('bluetooth')} title="Manage in Windows Settings">
              <span className="ct-well small">
                <Icon name="bluetooth" size={13} />
              </span>
              <span className="net-name">{d.name}</span>
              <span className="net-state">{d.connected ? 'Connected' : 'Paired'}</span>
            </button>
          ))}
        </div>
      )}
      <div className="sub-links">
        <button className="sub-link" onClick={() => void window.overlay.quickOpen('bluetooth')}>
          Add or connect a device
        </button>
      </div>
    </motion.div>
  )
}
