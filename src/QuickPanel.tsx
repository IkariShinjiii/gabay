import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Icon from './Icon'
import type { IconName } from './icons'
import type { MediaInfo, MixerApp, OutputDevice, ProjectMode, QuickAction, QuickState, SettingsKey, WifiNetwork } from './global'
import type { BatteryInfo } from './useBattery'
import { batteryIcon } from './NotchStatus'
import { tr } from './i18n'

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
const ROW = ['', 'one', 'two', 'three'] as const
const radioSeen = { wifi: false, bt: false }

function SplitTile(props: {
  icon: IconName
  label: string
  sub: string
  on: boolean
  disabled?: boolean
  onMain: () => void
  /** Windows Settings page the chevron opens (unless onMore is given). Neither: no chevron. */
  settings?: SettingsKey
  mainTitle?: string
  /** Label for the chevron when it does something other than open Settings. */
  moreTitle?: string
  /** Chevron opens a list inside Gabay instead of Windows Settings. */
  onMore?: () => void
}): React.JSX.Element {
  return (
    <div className={(props.on ? 'ct on' : 'ct') + (props.onMore || props.settings ? '' : ' solo')}>
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
      {(props.onMore || props.settings) && (
        <button
          className="ct-chev"
          aria-label={props.moreTitle ?? (props.onMore ? tr('{0} options', props.label) : tr('{0} settings', props.label))}
          title={props.moreTitle ?? (props.onMore ? tr('{0} options', props.label) : tr('{0} settings', props.label))}
          onClick={() => (props.onMore ? props.onMore() : props.settings && void window.overlay.quickOpen(props.settings))}
        >
          <Icon name="chevron-right" size={14} />
        </button>
      )}
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
  // Lyrics (Settings > Lyrics): synced lines for this track, if lrclib.net has them.
  const [lyrics, setLyrics] = useState<{ t: number; text: string }[] | null>(null)
  useEffect(() => {
    let stale = false
    setLyrics(null)
    void window.overlay.lyricsGet(media.title, media.artist, media.duration).then((l) => !stale && setLyrics(l), () => undefined)
    return () => {
      stale = true
    }
  }, [media.title, media.artist, media.duration])
  // Lines need a finer clock than the progress bar.
  useEffect(() => {
    if (!media.playing || !lyrics) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [media.playing, lyrics])

  // Seeking: drag or click the bar; the dragged position shows until Windows reports the new one.
  const [seekTo, setSeekTo] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const seekFrom = (clientX: number): number => {
    const r = barRef.current?.getBoundingClientRect()
    return r && media.duration ? Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * media.duration : 0
  }
  const sentSeek = useRef<number | null>(null)
  const seekTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(seekTimer.current), [])
  useEffect(() => {
    if (sentSeek.current !== null && Math.abs(media.position - sentSeek.current) < 3) {
      sentSeek.current = null
      setSeekTo(null)
    }
  }, [media.position])

  const elapsed = media.playing && media.updated ? (now - media.updated) / 1000 : 0
  const livePos = media.duration ? Math.min(media.duration, media.position + elapsed) : media.position + elapsed
  const pos = seekTo ?? livePos
  const pct = media.duration ? (pos / media.duration) * 100 : 0
  let line = -1
  if (lyrics) for (let i = 0; i < lyrics.length && lyrics[i].t <= pos + 0.3; i++) line = i

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
          <motion.button {...PRESS} className="media-btn" aria-label={tr('Previous')} title={tr('Previous')} onClick={() => onCommand('prev')}>
            <Icon name="skip-back" size={15} />
          </motion.button>
          <motion.button
            {...PRESS}
            className="media-play"
            aria-label={media.playing ? tr('Pause') : tr('Play')}
            title={media.playing ? tr('Pause') : tr('Play')}
            onClick={() => onCommand('toggle')}
          >
            <Icon name={media.playing ? 'pause' : 'play'} size={16} />
          </motion.button>
          <motion.button {...PRESS} className="media-btn" aria-label={tr('Next')} title={tr('Next')} onClick={() => onCommand('next')}>
            <Icon name="skip-forward" size={15} />
          </motion.button>
        </div>
      </div>
      {media.duration > 0 && (
        <div className="media-time">
          <span>{fmt(pos)}</span>
          <div
            ref={barRef}
            className={seekTo !== null ? 'media-bar seeking' : 'media-bar'}
            role="slider"
            aria-label={tr('Position')}
            aria-valuemin={0}
            aria-valuemax={Math.round(media.duration)}
            aria-valuenow={Math.round(pos)}
            tabIndex={0}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setSeekTo(seekFrom(e.clientX))
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) setSeekTo(seekFrom(e.clientX))
            }}
            onPointerUp={(e) => {
              const to = seekFrom(e.clientX)
              setSeekTo(to)
              sentSeek.current = to
              void window.overlay.mediaSeek(to)
              window.clearTimeout(seekTimer.current)
              seekTimer.current = window.setTimeout(() => {
                sentSeek.current = null
                setSeekTo(null)
              }, 4000)
            }}
            onKeyDown={(e) => {
              const step = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0
              if (!step) return
              e.preventDefault()
              void window.overlay.mediaSeek(Math.max(0, Math.min(media.duration, livePos + step)))
            }}
          >
            <div className="media-fill" style={{ width: `${pct}%` }} />
            <div className="media-knob" style={{ left: `${pct}%` }} />
          </div>
          <span>{fmt(media.duration)}</span>
        </div>
      )}
      {lyrics && line >= 0 && (
        <div className="lyrics" aria-live="off">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={line}
              className="lyric-now"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {lyrics[line].text || '♪'}
            </motion.div>
          </AnimatePresence>
          {lyrics[line + 1]?.text && <div className="lyric-next">{lyrics[line + 1].text}</div>}
        </div>
      )}
    </motion.div>
  )
}

// The last state seen, so reopening the tab paints at once; main also keeps one from a warm-up right after launch.
let cache: QuickState | null = null

/** Mounted only while the Controls tab is visible; its polling (and the helper process behind it) stops when it unmounts. */
export default function QuickPanel(props: {
  battery: BatteryInfo | null
  dndOn: boolean
  dndUntil: number
  onDnd: (until: number) => void
  recording: boolean
  onRecord: () => void
  onShot: () => void
  /** Opens Clipboard or Power, which live behind buttons here instead of in the tab bar. */
  onOpen: (tab: 'Clipboard' | 'Power') => void
}): React.JSX.Element {
  const { battery } = props
  const [state, setStateRaw] = useState<QuickState | null>(cache)
  const setState = (s: QuickState): void => {
    cache = s
    setStateRaw(s)
  }
  // Whether the default microphone is muted; null when the PC has none (the tile then stays out).
  const [micMuted, setMicMuted] = useState<boolean | null>(null)
  useEffect(() => {
    // Right after start the helper may not be up yet; ask again a few times before deciding there is no mic.
    let alive = true
    let timer: number | undefined
    const ask = (left: number): void => {
      void window.overlay.micGet().then((m) => {
        if (!alive) return
        if (m !== null) setMicMuted(m)
        else if (left > 0) timer = window.setTimeout(() => ask(left - 1), 2000)
      }, () => undefined)
    }
    ask(4)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [])
  // Media already there when the tab opens shows at once; only media that appears later animates in.
  const mediaAtMount = useRef(!!cache?.media)
  const [page, setPage] = useState(0)
  const [dir, setDir] = useState(1)
  // Dev preview can open a sub-view directly (#preview=Controls&sub=project); normal use always starts on the main view.
  const [view, setView] = useState<'main' | 'project' | 'wifi' | 'bt' | 'mixer' | 'dnd'>(() =>
{
    const sub = new URLSearchParams(location.hash.slice(1)).get('sub')
    return sub === 'project' || sub === 'wifi' || sub === 'bt' || sub === 'mixer' || sub === 'dnd' ? sub : 'main'
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

  if (!state) return <div className="body body-center">{tr('Loading…')}</div>
  if (view === 'project') return <ProjectView onBack={() => setView('main')} />
  if (view === 'wifi') return <WifiView onBack={() => setView('main')} />
  if (view === 'bt') return <BluetoothView onBack={() => setView('main')} />
  if (view === 'mixer') return <MixerView onBack={() => setView('main')} />
  if (view === 'dnd') return <DndView until={props.dndUntil} on={props.dndOn} onPick={props.onDnd} onBack={() => setView('main')} />

  // Dev preview with &demo: neutral sample names, so screenshots never show the real network's name.
  const demo = new URLSearchParams(location.hash.slice(1)).has('demo')
  const media: MediaInfo | null = demo
    ? { title: 'Weightless', artist: 'Marconi Union', playing: true, position: 92, duration: 480, updated: Date.now(), art: null }
    : state.media
  const wifiOn = state.radios.wifi
  const btOn = state.radios.bluetooth
  // Desktops often have no Wi-Fi or Bluetooth: those tiles (and airplane mode, with neither) are left out. Once seen,
  // a radio stays shown, so one failed read doesn't make a tile blink away.
  if (wifiOn !== undefined) radioSeen.wifi = true
  if (btOn !== undefined) radioSeen.bt = true
  const hasWifi = demo || radioSeen.wifi
  const hasBt = demo || radioSeen.bt
  const hasRadio = hasWifi || hasBt
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
            <div className={`ct-row ${ROW[1 + (hasWifi ? 1 : 0) + (hasBt ? 1 : 0)]}`}>
              {hasWifi && (
                <SplitTile
                  icon={wifiOn === false ? 'wifi-off' : 'wifi'}
                  label={tr('Wi-Fi')}
                  sub={wifiOn === undefined ? tr('Unavailable') : wifiOn ? (demo ? tr('Home Wi-Fi') : (state.wifi.ssid ?? tr('On'))) : tr('Off')}
                  on={!!wifiOn}
                  disabled={wifiOn === undefined}
                  onMain={() => void act({ kind: 'radio', radio: 'wifi', on: !wifiOn })}
                  settings="network"
                  onMore={() => setView('wifi')}
                />
              )}
              {hasBt && (
                <SplitTile
                  icon="bluetooth"
                  label={tr('Bluetooth')}
                  sub={btOn === undefined ? tr('Unavailable') : btOn ? tr('On') : tr('Off')}
                  on={!!btOn}
                  disabled={btOn === undefined}
                  onMain={() => void act({ kind: 'radio', radio: 'bluetooth', on: !btOn })}
                  settings="bluetooth"
                  onMore={() => setView('bt')}
                />
              )}
              <SplitTile
                icon={state.muted ? 'volume-x' : 'volume-2'}
                label={tr('Audio')}
                sub={state.muted ? tr('Muted') : (state.audioName ?? tr('Output'))}
                on={state.volume !== null && !state.muted}
                disabled={state.volume === null}
                mainTitle={state.muted ? tr('Unmute') : tr('Mute')}
                onMain={() => void act({ kind: 'mute' })}
                settings="sound"
                onMore={() => setView('mixer')}
                moreTitle={tr('Volume per app')}
              />
            </div>
            <div className={`ct-row ${ROW[1 + (hasRadio ? 1 : 0) + (micMuted !== null ? 1 : 0)]}`}>
              {hasRadio && (
                <SplitTile
                  icon="plane"
                  label={tr('Airplane')}
                  sub={state.airplane === null ? tr('Unavailable') : state.airplane ? tr('On') : tr('Off')}
                  on={!!state.airplane}
                  disabled={state.airplane === null}
                  onMain={() => void act({ kind: 'airplane' })}
                  settings="airplane"
                />
              )}
              <SplitTile
                icon="contrast"
                label={tr('Dark mode')}
                sub={state.dark === null ? tr('Unavailable') : state.dark ? tr('On') : tr('Off')}
                on={!!state.dark}
                disabled={state.dark === null}
                onMain={() => void act({ kind: 'dark', on: !state.dark })}
                settings="colors"
              />
              {micMuted !== null && (
                <SplitTile
                  icon="mic"
                  label={tr('Microphone')}
                  sub={micMuted ? tr('Muted') : tr('Live')}
                  on={micMuted}
                  mainTitle={micMuted ? tr('Unmute the microphone') : tr('Mute the microphone')}
                  onMain={() => void window.overlay.micSet(!micMuted).then(setMicMuted, () => undefined)}
                />
              )}
            </div>
            <div className="ct-row three">
              <SplitTile
                icon="moon-star"
                label={tr('Focus')}
                sub={props.dndOn ? (props.dndUntil === -1 ? tr('Silenced') : tr('Until {0}', new Date(props.dndUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))) : tr('Off')}
                on={props.dndOn}
                mainTitle={props.dndOn ? tr('Turn off') : tr('Silence notifications until you turn it off')}
                onMain={() => props.onDnd(props.dndOn ? 0 : -1)}
                onMore={() => setView('dnd')}
                moreTitle={tr('Silence notifications for a while')}
              />
              <SplitTile
                icon="camera"
                label={tr('Screenshot')}
                sub={tr('Whole screen')}
                on={false}
                mainTitle={tr('Save a screenshot and copy it')}
                onMain={props.onShot}
                onMore={() => void window.overlay.snip()}
                moreTitle={tr('Snip part of the screen')}
              />
              <SplitTile
                icon={props.recording ? 'square' : 'video'}
                label={props.recording ? tr('Stop') : tr('Record')}
                sub={props.recording ? tr('Recording…') : tr('Screen + sound')}
                on={props.recording}
                mainTitle={props.recording ? tr('Stop and save the recording') : tr('Record the screen to Videos › Gabay')}
                onMain={props.onRecord}
              />
            </div>

            {volume !== null && (
              <BigSlider
                icon={volIcon}
                label={tr('Volume')}
                value={state.muted ? 0 : volume}
                format={(v) => (state.muted ? 'Muted' : `${v}%`)}
                onSlide={(v, done) => slide('volume', v, done)}
                onIcon={() => void act({ kind: 'mute' })}
                iconLabel={state.muted ? tr('Unmute') : tr('Mute')}
              />
            )}
            {brightness !== null && (
              <BigSlider
                icon="sun"
                label={tr('Brightness')}
                value={brightness}
                format={(v) => `${v}%`}
                onSlide={(v, done) => slide('brightness', v, done)}
              />
            )}

            {media && (
              <MediaCard
                media={media}
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
              {MORE.filter((t) => hasWifi || t.label !== 'Mobile hotspot').map((t) => {
                const on = t.kind === 'airplane' ? !!state.airplane : false
                return (
                  <motion.button
                    key={t.label}
                    {...PRESS}
                    className={on ? 'more-tile on' : 'more-tile'}
                    aria-pressed={t.kind === 'airplane' ? on : undefined}
                    disabled={t.kind === 'airplane' && state.airplane === null}
                    title={t.kind === 'link' ? tr('Open {0} settings', tr(t.label)) : tr(t.label)}
                    onClick={() => {
                      if (t.kind === 'airplane') void act({ kind: 'airplane' })
                      else if (t.kind === 'view') setView('project')
                      else void window.overlay.quickOpen(t.settings)
                    }}
                  >
                    <span className="ct-well">
                      <Icon name={t.icon} size={16} />
                    </span>
                    <span className="ct-label">{tr(t.label)}</span>
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
            <button key={i} className={i === page ? 'q-dot on' : 'q-dot'} aria-label={i === 0 ? tr('Controls') : tr('More')} onClick={() => goPage(i)} />
          ))}
        </span>
        <button className="q-icon-btn" title={tr('Clipboard')} aria-label={tr('Clipboard')} onClick={() => props.onOpen('Clipboard')}>
          <Icon name="scissors" size={16} />
        </button>
        <button className="q-icon-btn" title={tr('Power')} aria-label={tr('Power')} onClick={() => props.onOpen('Power')}>
          <Icon name="power" size={16} />
        </button>
        <button className="q-icon-btn" title={tr('Open Windows Settings')} aria-label={tr('Open Windows Settings')} onClick={() => void window.overlay.quickOpen('settings')}>
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
        <button className="q-icon-btn" aria-label={tr('Back')} title={tr('Back')} onClick={onBack}>
          <Icon name="arrow-left" size={16} />
        </button>
        <span>{tr('Project')}</span>
      </div>
      <div className="proj-list" role="radiogroup" aria-label={tr('Display mode')}>
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
            <span>{busy === p.mode ? `${tr(p.label)}…` : tr(p.label)}</span>
          </motion.button>
        ))}
      </div>
      <button className="sub-link" onClick={() => void window.overlay.quickOpen('display')}>
        {tr('More display settings')}
      </button>
    </motion.div>
  )
}

function SubHead({ title, onBack, onRefresh, busy }: { title: string; onBack: () => void; onRefresh?: () => void; busy?: boolean }): React.JSX.Element {
  return (
    <div className="sub-head">
      <button className="q-icon-btn" aria-label={tr('Back')} title={tr('Back')} onClick={onBack}>
        <Icon name="arrow-left" size={16} />
      </button>
      <span>{title}</span>
      {onRefresh && (
        <button className={busy ? 'q-icon-btn sub-refresh spin' : 'q-icon-btn sub-refresh'} aria-label={tr('Refresh')} title={tr('Scan again')} onClick={onRefresh}>
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
      <SubHead title={tr('Wi-Fi')} onBack={onBack} onRefresh={() => void scan()} busy={busy} />
      {data === null ? (
        <div className="sub-empty">{tr('Scanning…')}</div>
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
              title={n.connected ? tr('Connected') : n.known ? tr('Connect') : tr('Join in Windows Settings')}
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
            {tr('Disconnect')}
          </button>
        )}
        <button className="sub-link" onClick={() => void window.overlay.quickOpen('wifi')}>
          {tr('More Wi-Fi settings')}
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
      <SubHead title={tr('Bluetooth')} onBack={onBack} onRefresh={() => void load()} busy={busy} />
      {list === null ? (
        <div className="sub-empty">{tr('Looking for devices…')}</div>
      ) : sorted.length === 0 ? (
        <div className="sub-empty">{tr('No paired devices, or Bluetooth is off.')}</div>
      ) : (
        <div className="net-list">
          {sorted.map((d) => (
            <button key={d.name} className={d.connected ? 'net-row on' : 'net-row'} onClick={() => void window.overlay.quickOpen('bluetooth')} title={tr('Manage in Windows Settings')}>
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
          {tr('Add or connect a device')}
        </button>
      </div>
    </motion.div>
  )
}

/** Volume per app, like Windows' volume mixer: every app that is playing (or has played) sound. */
const mixerIcons = new Map<number, string | null>()
function MixerView({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [apps, setApps] = useState<MixerApp[] | null>(null)
  const [icons, setIcons] = useState<Record<number, string | null>>({})
  const busy = useRef(new Map<number, boolean>())
  const pending = useRef(new Map<number, number>())
  const [outs, setOuts] = useState<OutputDevice[]>([])
  const [outOpen, setOutOpen] = useState(() => {
    try {
      return localStorage.getItem('gabay.soundOutputs') !== 'closed'
    } catch {
      return true
    }
  })
  const toggleOuts = (): void => {
    setOutOpen((o) => {
      try {
        localStorage.setItem('gabay.soundOutputs', o ? 'closed' : 'open')
      } catch {
        /* storage unavailable: the choice just lasts until the panel closes */
      }
      return !o
    })
  }
  const loadOuts = useCallback(async (): Promise<void> => {
    setOuts(await window.overlay.outputList().catch(() => []))
  }, [])
  const pickOut = async (d: OutputDevice): Promise<void> => {
    if (d.current) return
    setOuts((l) => l.map((o) => ({ ...o, current: o.id === d.id }))) // show the change at once; the list re-reads below
    await window.overlay.outputSet(d.id).catch(() => false)
    await loadOuts()
  }

  useEffect(() => {
    let stale = false
    const load = async (): Promise<void> => {
      const [list] = await Promise.all([window.overlay.mixerList().catch(() => []), loadOuts()])
      if (stale) return
      setApps(list)
      for (const a of list) {
        if (mixerIcons.has(a.pid)) continue
        mixerIcons.set(a.pid, null)
        void window.overlay.mixerIcon(a.pid).then((u) => {
          mixerIcons.set(a.pid, u)
          if (!stale) setIcons((m) => ({ ...m, [a.pid]: u }))
        })
      }
    }
    void load()
    const id = window.setInterval(() => void load(), 3000)
    return () => {
      stale = true
      window.clearInterval(id)
    }
  }, [])

  // One request per app in flight; the newest value waits (same as the main sliders).
  const pump = (pid: number): void => {
    const v = pending.current.get(pid)
    if (busy.current.get(pid) || v === undefined) return
    pending.current.delete(pid)
    busy.current.set(pid, true)
    void window.overlay
      .mixerSet(pid, v)
      .catch(() => false)
      .finally(() => {
        busy.current.set(pid, false)
        pump(pid)
      })
  }

  return (
    <motion.div className="body quick-sub" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
      <SubHead title={tr('Sound')} onBack={onBack} />
      {outs.length > 1 && (
        <>
          <button className="sub-fold" aria-expanded={outOpen} onClick={toggleOuts}>
            <span>{tr('Output')}</span>
            {!outOpen && <span className="sub-fold-now">{outs.find((d) => d.current)?.name}</span>}
            <span className="sub-fold-chev" style={{ transform: outOpen ? 'rotate(90deg)' : undefined }}>
              <Icon name="chevron-right" size={13} />
            </span>
          </button>
          {outOpen && (
            <div className="net-list">
              {outs.map((d) => (
                <motion.button key={d.id} whileTap={{ scale: 0.98 }} className={d.current ? 'net-row on' : 'net-row'} title={d.current ? tr('In use') : tr('Play sound here')} onClick={() => void pickOut(d)}>
                  <span className="ct-well small">
                    <Icon name={d.kind === 'display' ? 'monitor' : 'volume-2'} size={13} />
                  </span>
                  <span className="net-name">{d.name}</span>
                  <span className="net-state">{d.current ? <Icon name="check" size={12} /> : null}</span>
                </motion.button>
              ))}
            </div>
          )}
          <div className="sub-note">{tr('Volume per app')}</div>
        </>
      )}
      {apps === null ? (
        <div className="sub-empty">{tr('Looking for apps…')}</div>
      ) : apps.length === 0 ? (
        <div className="sub-empty">{tr('No apps are playing sound.')}</div>
      ) : (
        <div className="mixer" style={{ maxHeight: Math.max(110, 320 - (outs.length > 1 ? (outOpen ? outs.length * 38 : 0) + 52 : 0)) }}>
          {apps.map((a) => (
            <div key={a.pid} className="mix-row">
              <div className="mix-head">
                {(icons[a.pid] ?? mixerIcons.get(a.pid)) ? (
                  <img src={(icons[a.pid] ?? mixerIcons.get(a.pid)) as string} alt="" width={18} height={18} draggable={false} />
                ) : (
                  <Icon name={a.pid === 0 ? 'bell' : 'app-window'} size={16} />
                )}
                <span>{a.name}</span>
              </div>
              <BigSlider
                icon={a.volume === 0 ? 'volume-x' : a.volume < 50 ? 'volume-1' : 'volume-2'}
                label={tr('{0} volume', a.name)}
                value={a.volume}
                format={(v) => `${v}%`}
                onSlide={(v) => {
                  pending.current.set(a.pid, Math.round(v))
                  pump(a.pid)
                }}
              />
            </div>
          ))}
        </div>
      )}
      <div className="sub-links">
        <button className="sub-link" onClick={() => void window.overlay.quickOpen('sound')}>
          {tr('Sound settings')}
        </button>
      </div>
    </motion.div>
  )
}

/** Do not disturb for a while: notification toasts stay quiet; everything else still shows. */
function DndView({ on, until, onPick, onBack }: { on: boolean; until: number; onPick: (until: number) => void; onBack: () => void }): React.JSX.Element {
  const at = (h: number): number => {
    const d = new Date()
    d.setHours(h, 0, 0, 0)
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1)
    return d.getTime()
  }
  const options: { label: string; until: number }[] = [
    { label: 'For 1 hour', until: Date.now() + 3_600_000 },
    { label: 'Until this evening (6 PM)', until: at(18) },
    { label: 'Until tomorrow morning (7 AM)', until: at(7) },
    { label: 'Until I turn it off', until: -1 }
  ].filter((o) => o.until === -1 || o.until - Date.now() < 24 * 3_600_000)
  const pick = (u: number): void => {
    onPick(u)
    onBack()
  }
  return (
    <motion.div className="body quick-sub" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
      <SubHead title={tr('Focus · do not disturb')} onBack={onBack} />
      <div className="sub-note">
        {on
          ? until === -1
            ? tr('On until you turn it off.')
            : tr('On until {0}.', new Date(until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
          : tr('Notifications stay out of the notch. Charging, timers and calendar alerts still show.')}
      </div>
      <div className="net-list">
        {options.map((o) => (
          <motion.button key={o.label} whileTap={{ scale: 0.98 }} className="net-row" onClick={() => pick(o.until)}>
            <span className="ct-well small">
              <Icon name="moon" size={13} />
            </span>
            <span className="net-name">{tr(o.label)}</span>
          </motion.button>
        ))}
        {on && (
          <motion.button whileTap={{ scale: 0.98 }} className="net-row" onClick={() => pick(0)}>
            <span className="ct-well small">
              <Icon name="x" size={13} />
            </span>
            <span className="net-name">{tr('Turn off')}</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}
