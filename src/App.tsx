import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { COLLAPSE_DELAY_MS, HIDE_DELAY_MS, NOTCH, REVEAL_DWELL_MS } from './constants'
import type { DownloadState, LauncherItem, DockApp, TrayIcon, LiveMedia, PowerAction, Settings, Weather } from './global'
import Dock from './Dock'
import ClipboardPanel from './ClipboardPanel'
import { parseCommand, type CommandActions } from './commands'
import Launcher from './Launcher'
import Icon from './Icon'
import PowerPanel from './PowerPanel'
import SettingsPanel from './SettingsPanel'
import NotchStatus, { type NetKind } from './NotchStatus'
import QuickPanel from './QuickPanel'
import { useBattery } from './useBattery'
import StatsPanel from './StatsPanel'
import TodayPanel from './TodayPanel'
import InboxPanel, { type InboxItem } from './InboxPanel'
import NotchToast, { type Toast } from './NotchToast'
import { chime, leftOf, useTimers } from './useTimers'
import { useRecorder } from './useRecorder'
import { applyAccent, resolveAccent } from './accent'
import Welcome from './Welcome'
import UpdateTour, { hasTour } from './UpdateTour'
import NotesPanel from './NotesPanel'
import { notesFor } from './whatsNew'
import { useFocusTimer } from './useFocusTimer'
import { tr, setLanguage, type Language } from './i18n'

const TABS = ['Controls', 'Today', 'Inbox', 'Notes', 'System', 'Clipboard', 'Launch', 'Power', 'Settings'] as const
type Tab = (typeof TABS)[number]

const dot = (c: string): string => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="${c}"/></svg>`)}`
const SAMPLE_TRAY: TrayIcon[] = [
  { id: '1-1', tip: 'Chat', icon: dot('#5865f2') },
  { id: '2-1', tip: 'Games', icon: dot('#9aa4b2') },
  { id: '3-1', tip: 'Music', icon: dot('#1db954') },
  { id: '4-1', tip: 'Security', icon: dot('#3b82f6') },
  { id: '5-1', tip: 'Cloud', icon: dot('#f5a524') },
  { id: '6-1', tip: 'Updates', icon: dot('#e5484d') }
]

const SAMPLE_WINS: DockApp[] = [
  { key: 'a', name: 'Mail', icon: null, pinned: true, wins: [{ id: '1', title: tr('Inbox - Mail'), minimized: false, active: true, attention: false }] },
  { key: 'b', name: 'Browser', icon: null, pinned: true, wins: [
    { id: '2', title: tr('Project notes'), minimized: false, active: false, attention: false },
    { id: '3', title: tr('Recipes'), minimized: true, active: false, attention: false }
  ] },
  { key: 'c', name: 'Files', icon: null, pinned: true, wins: [] },
  { key: 'd', name: 'Chat', icon: null, pinned: false, wins: [{ id: '4', title: tr('Chat'), minimized: false, active: false, attention: true }] }
]

const SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const

/** A soft two-note chime for notifications, made on the spot: no sound file, quiet, and short. */
let noteCtx: AudioContext | null = null
function noteChime(): void {
  try {
    noteCtx ??= new AudioContext()
    const ctx = noteCtx
    void ctx.resume()
    const t0 = ctx.currentTime
    ;[880, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      const t = t0 + i * 0.11
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.12, t + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
      o.connect(g).connect(ctx.destination)
      o.start(t)
      o.stop(t + 0.5)
    })
  } catch {
    // no audio device: stay silent
  }
}

export default function App(): React.JSX.Element {
  const notchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Dev preview (see electron/main.ts): open straight onto the named tab, with no pointer involved.
  const previewParam = new URLSearchParams(location.hash.slice(1)).get('preview')
  const previewTab = TABS.find((t) => t === previewParam)
  // Dev preview of the first-run tour: open on it with no pointer involved.
  const previewWelcome = previewParam === 'Welcome'
  const previewTour = previewParam === 'Tour'
  // Dev preview of the open-apps row, with made-up apps (never the person's real windows).
  const previewDock = new URLSearchParams(location.hash.slice(1)).get('dock') === '1'
  const [expanded, setExpanded] = useState(previewTab !== undefined || previewWelcome || previewTour)
  const [tab, setTab] = useState<Tab>(previewTab ?? 'Today')
  // One bar for everything: text that parses as a command is a command, anything else searches apps (or the clipboard).
  const [input, setInput] = useState('')
  const [barFocused, setBarFocused] = useState(false)
  const [items, setItems] = useState<LauncherItem[]>([])
  const [selected, setSelected] = useState(0)

  // The panel stays open while the pointer is over the notch OR something holds it open: a focused input
  // ('search', 'command', 'todo') or an on-screen confirmation ('power-confirm').
  // `evaluate` is the single place that decides open vs. start-the-collapse-timer.
  const pointerInside = useRef(false)
  // While a Windows notification is showing, the pointer over it reveals Dismiss and Open instead of opening the panel.
  const toastNoteRef = useRef(false)
  const toastHoverRef = useRef(false)
  const showNextRef = useRef<() => void>(() => undefined)
  const toastTimerRef = useRef<number | undefined>(undefined)
  const holds = useRef(new Set<string>())
  const isOpen = useRef(previewTab !== undefined || previewWelcome || previewTour)
  const collapseMs = useRef(COLLAPSE_DELAY_MS) // replaced by the saved setting once it loads
  const timer = useRef<number | undefined>(undefined)

  // The open notch takes the height of what the current tab shows (capped at NOTCH.expanded.height), so the box
  // fits the content instead of stretching it; the spring animates between tabs.
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelHeight, setPanelHeight] = useState<number>(NOTCH.expanded.height)
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setPanelHeight(Math.ceil(el.offsetHeight)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Auto-hide: off-screen until the pointer rests on the top edge. `visibility` mirrors the saved setting.
  const [visibility, setVisibility] = useState<'always' | 'auto'>('always')
  // A full-screen window on the notch's display hides the notch the same way auto-hide does.
  const [fullscreen, setFullscreen] = useState(false)
  const fullscreenRef = useRef(false)
  const [revealed, setRevealed] = useState(false)
  const visibilityRef = useRef<'always' | 'auto'>('always')
  const revealedRef = useRef(false)
  const edgeTimer = useRef<number | undefined>(undefined)
  const hideTimer = useRef<number | undefined>(undefined)

  const hold = useCallback((name: string, on: boolean): void => {
    if (on) holds.current.add(name)
    else holds.current.delete(name)
  }, [])

  const setInteractive = useCallback((interactive: boolean): void => {
    window.overlay.setInteractive(interactive)
  }, [])

  const evaluate = useCallback((): void => {
    if (pointerInside.current || holds.current.size > 0) {
      window.clearTimeout(timer.current)
      timer.current = undefined
      if (!isOpen.current) {
        isOpen.current = true
        setInteractive(true)
        setExpanded(true)
      }
      return
    }
    if (!isOpen.current || timer.current !== undefined) return
    // Collapse (and go click-through again) only after the pointer has stayed out for the delay.
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      if (pointerInside.current || holds.current.size > 0) return
      isOpen.current = false
      setExpanded(false)
      setInput('')
      setInteractive(false)
    }, collapseMs.current)
  }, [setInteractive])

  const [dndUntil, setDndUntil] = useState(0)
  const [language, setLang] = useState<Language>('en')
  setLanguage(language)
  const [activeHotkey, setActiveHotkey] = useState<string | null>(null)
  const [accentName, setAccentName] = useState('mint')

  // --- first-run tour: holds the panel open until finished or skipped ---
  const [welcome, setWelcome] = useState(false)
  const startWelcome = useCallback((): void => {
    setWelcome(true)
    hold('welcome', true)
    evaluate()
  }, [hold, evaluate])
  const finishWelcome = useCallback((): void => {
    setWelcome(false)
    hold('welcome', false)
    void window.overlay.setSettings({ welcomed: true, accent: accentRef.current, seenVersion: versionRef.current })
    evaluate()
  }, [hold, evaluate])
  // --- tour of what's new, after an update that has one (or from Settings) ---
  const [tour, setTour] = useState<string | null>(previewTour ? '1.4.0' : null)
  const startTour = useCallback((version: string): void => {
    setTour(version)
    hold('welcome', true)
    evaluate()
  }, [hold, evaluate])
  const finishTour = useCallback((): void => {
    setTour(null)
    hold('welcome', false)
    evaluate()
  }, [hold, evaluate])
  const accentRef = useRef('mint')
  const versionRef = useRef('')
  // Set once pushToast exists (further down); called from the settings load above.
  const announceUpdate = useRef<(version: string) => void>(() => undefined)
  const pushToastRef = useRef<(t: Omit<Toast, 'id'>) => void>(() => undefined)
  accentRef.current = accentName
  const [place, setPlace] = useState<string | null>(null)
  const [dockOn, setDockOn] = useState(false)
  const applySettings = useCallback((s: Settings): void => {
    collapseMs.current = s.collapseMs
    void resolveAccent(s.accent).then(applyAccent)
    setDndUntil(s.dndUntil)
    setLang((new URLSearchParams(location.hash.slice(1)).get('lang') as Language | null) ?? s.language)
    setPlace(s.place ? `${s.place.lat},${s.place.lon}` : null)
    setDockOn(previewParam ? previewDock : s.hideTaskbar)
    // A preview of the collapsed pill must show it, whatever the saved visibility is.
    const v = previewParam ? 'always' : s.visibility
    visibilityRef.current = v
    setVisibility(v)
  }, [])

  useEffect(() => {
    void window.overlay.getSettings().then((r) => {
      applySettings(r.settings)
      setActiveHotkey(r.activeHotkey)
      setAccentName(r.settings.accent)
      versionRef.current = r.version
      // After an update (not on a first run, which gets the tour): say once what's new.
      if (r.settings.welcomed && r.settings.seenVersion !== r.version && !previewParam) {
        // An automatic update can finish while nobody is at the PC: wait until someone is, then say it.
        void window.overlay.whenPresent().then(() => window.setTimeout(() => announceUpdate.current(r.version), 2500))
        void window.overlay.setSettings({ seenVersion: r.version })
      }
      // Once, a few days in: ask for a review (never over a game, and not on top of the update note).
      const at = r.settings.reviewAt
      if (r.settings.welcomed && at > 0 && !previewParam) {
        window.setTimeout(() => {
          void window.overlay.whenPresent().then(() =>
            window.setTimeout(() => {
              if (fullscreenRef.current) return // try again next start
              void window.overlay.setSettings({ reviewAt: -1 })
              pushToastRef.current({ icon: 'star', title: tr('Enjoying Gabay?'), sub: tr('Rate it in Settings › Rate Gabay'), tone: 'accent', ms: 8000 })
            }, 15_000)
          )
        }, Math.min(Math.max(0, at - Date.now()), 2_000_000_000))
      }
      // First run: open straight into the tour (never in screenshot previews, except the tour's own).
      if (previewWelcome || (!r.settings.welcomed && !previewParam)) startWelcome()
    })
  }, [applySettings])

  // Slide the notch away again once the pointer is gone, nothing holds the panel open and it isn't expanded.
  const scheduleHide = useCallback((): void => {
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = undefined
      if (pointerInside.current || isOpen.current || holds.current.size > 0) return
      revealedRef.current = false
      setRevealed(false)
    }, HIDE_DELAY_MS)
  }, [])

  useEffect(() => {
    // The hit area is the notch's CURRENT rect, so it follows the spring as the notch grows/shrinks.
    // While click-through, Electron forwards mousemove only, which is all this needs.
    const onMove = (e: MouseEvent): void => {
      const r = notchRef.current?.getBoundingClientRect()
      if (!r) return
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (toastNoteRef.current && !isOpen.current) {
        // over a notification toast: show its buttons (the window must take clicks), and keep the toast up
        pointerInside.current = false
        if (inside !== toastHoverRef.current) {
          toastHoverRef.current = inside
          setInteractive(inside)
          window.clearTimeout(toastTimerRef.current)
          window.clearTimeout(toastTimer.current)
          if (!inside) toastTimerRef.current = window.setTimeout(() => showNextRef.current(), 1800)
        }
      } else {
        pointerInside.current = inside
        evaluate()
      }

      // Over a full-screen game or video the top edge belongs to the app (games scroll and aim there); only the hotkey opens Gabay.
      if (visibilityRef.current !== 'auto' && !fullscreenRef.current) return
      if (!revealedRef.current) {
        if (fullscreenRef.current) return
        // Reveal only on a rest at the very top edge within the notch's width, never on a pass through to a tab.
        const atEdge = e.clientY <= 3 && Math.abs(e.clientX - window.innerWidth / 2) <= NOTCH.collapsed.width / 2 + 24
        if (!atEdge) {
          window.clearTimeout(edgeTimer.current)
          edgeTimer.current = undefined
        } else if (edgeTimer.current === undefined) {
          edgeTimer.current = window.setTimeout(() => {
            edgeTimer.current = undefined
            revealedRef.current = true
            setRevealed(true)
            scheduleHide()
          }, REVEAL_DWELL_MS)
        }
      } else if (pointerInside.current || isOpen.current) {
        window.clearTimeout(hideTimer.current)
        hideTimer.current = undefined
      } else if (hideTimer.current === undefined) {
        scheduleHide()
      }
    }
    // Pointer left the whole window while interactive: no mousemove will follow, so treat as outside.
    const onLeave = (): void => {
      pointerInside.current = false
      window.clearTimeout(edgeTimer.current)
      edgeTimer.current = undefined
      evaluate()
      if (revealedRef.current) scheduleHide()
    }
    // Global hotkey: open and put the caret in the search field, even with the pointer elsewhere.
    const offFullscreen = window.overlay.onFullscreen((fs) => {
      fullscreenRef.current = fs
      setFullscreen(fs)
      if (fs && revealedRef.current) scheduleHide()
      if (fs) {
        // The pointer may be what held the panel open; a full-screen app in front means it no longer is.
        pointerInside.current = false
        evaluate()
      }
    })
    // The hotkey opens Launch with the caret in its search field.
    const offSummon = window.overlay.onSummon(() => {
      setTab('Launch')
      window.setTimeout(() => inputRef.current?.focus(), 0)
      evaluate()
    })

    document.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.clearTimeout(timer.current)
      window.clearTimeout(edgeTimer.current)
      window.clearTimeout(hideTimer.current)
      offSummon()
      offFullscreen()
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [evaluate, scheduleHide])

  const onConfirming = useCallback(
    (confirming: boolean): void => {
      hold('power-confirm', confirming)
      evaluate()
    },
    [evaluate, hold]
  )

  // After a power action was sent, drop all holds and let the panel close.
  const onPowerDone = useCallback((): void => {
    holds.current.clear()
    pointerInside.current = false
    evaluate()
  }, [evaluate])

  const onTodoHold = useCallback(
    (held: boolean): void => {
      hold('todo', held)
      evaluate()
    },
    [evaluate, hold]
  )

  // --- clock (collapsed pill): re-render once a minute, aligned to the minute boundary ---
  const fmtClock = (): string => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const [clock, setClock] = useState(fmtClock)
  useEffect(() => {
    let id: number
    const next = (): void => {
      setClock(fmtClock())
      id = window.setTimeout(next, 60_000 - (Date.now() % 60_000) + 50)
    }
    id = window.setTimeout(next, 60_000 - (Date.now() % 60_000) + 50)
    return () => window.clearTimeout(id)
  }, [])

  const focusTimer = useFocusTimer()
  // Desktops have no battery: Chromium then reports a full one that's always charging, so Gabay asks Windows instead.
  const rawBattery = useBattery()
  const [hasBattery, setHasBattery] = useState(true)
  const [hasWifi, setHasWifi] = useState(true)
  useEffect(() => {
    let tries = 0
    let id = 0
    const ask = (): void => {
      void window.overlay.hardware().then(
        (hw) => {
          if (hw) {
            setHasBattery(hw.battery)
            setHasWifi(hw.wifi)
          }
          else if (++tries < 10) id = window.setTimeout(ask, 3000)
        },
        () => undefined
      )
    }
    ask()
    return () => window.clearTimeout(id)
  }, [])
  const battery = hasBattery ? rawBattery : null

  // --- toasts: the collapsed notch grows for a moment (notification, new track, charging, meeting, update) ---
  const [toast, setToast] = useState<Toast | null>(null)
  const queue = useRef<Toast[]>([])
  const toastId = useRef(1)
  const toastTimer = useRef<number | undefined>(undefined)
  // Whether a toast is on screen right now. A ref, not the state: two toasts pushed in the same tick must not both
  // think the notch is free (the second would replace the first before it was ever seen).
  const showing = useRef(false)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const tabRef = useRef(tab)
  tabRef.current = tab
  // Recent Windows notifications, newest first. In memory only (never saved), capped.
  const [inbox, setInbox] = useState<InboxItem[]>([])
  const [unseen, setUnseen] = useState(0)
  const inboxKey = useRef(1)
  const showNext = useCallback((): void => {
    window.clearTimeout(toastTimer.current)
    if (toastHoverRef.current) { toastHoverRef.current = false; window.overlay.setInteractive(false) }
    // While the panel is open a toast would be hidden; keep the queue until it closes.
    const next = expandedRef.current ? null : (queue.current.shift() ?? null)
    showing.current = next !== null
    toastNoteRef.current = next?.noteId !== undefined
    setToast(next)
    if (next) toastTimer.current = window.setTimeout(() => (toastHoverRef.current ? undefined : showNext()), next.ms ?? 4200)
  }, [])
  showNextRef.current = showNext
  const pushToast = useCallback(
    (t: Omit<Toast, 'id'>): void => {
      // Nothing pops over a full-screen video or game; the newest few wait their turn, older ones drop.
      if (fullscreenRef.current) return
      queue.current = [...queue.current, { ...t, id: toastId.current++ }].slice(-3)
      if (!showing.current) showNext()
    },
    [showNext]
  )
  pushToastRef.current = pushToast

  useEffect(() => {
    if (!expanded && !showing.current && queue.current.length) showNext()
  }, [expanded, showNext])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  announceUpdate.current = (version: string): void => {
    if (hasTour(version)) {
      // never over a game or video: try again in a while
      if (fullscreenRef.current) {
        window.setTimeout(() => announceUpdate.current(version), 60_000)
        return
      }
      startTour(version)
      return
    }
    const items = notesFor(version)
    pushToast({
      icon: 'sparkles',
      label: tr('Updated to Gabay {0}', version),
      title: items[0],
      sub: items.length > 1 ? tr("And {0} more in Settings › What's new", items.length - 1) : undefined,
      tone: 'accent',
      ms: 7000
    })
  }

  // --- now playing (live activity in the pill; a toast when the track changes) ---
  const [media, setMedia] = useState<LiveMedia | null>(null)
  const lastTrack = useRef<string | null>(null)
  useEffect(() => {
    const take = (m: LiveMedia | null): void => {
      setMedia(m)
      const key = m ? `${m.title}|${m.artist}` : null
      if (m?.playing && key && lastTrack.current !== null && key !== lastTrack.current && m.title)
        pushToast({ icon: 'music', art: m.art || undefined, title: m.title, sub: m.artist, label: tr('Now playing'), ms: 3200 })
      if (key) lastTrack.current = key
    }
    // Dev preview of the grown pill: sample data, never real events.
    if (previewParam === 'Toast')
      setToast({ id: 0, icon: 'zap', title: tr('Charging'), sub: '76%', ring: 0.76, tone: 'accent', ms: 60_000 })
    if (previewParam === 'WhatsNew')
      setToast({ id: 0, icon: 'sparkles', label: tr('Updated to Gabay 0.32.0'), title: notesFor('0.32.0')[0], sub: tr('And 3 more in Settings › What\'s new'), tone: 'accent', ms: 60_000 })
    if (previewParam === 'Note')
      {
        // &hover shows the buttons that normally appear when the pointer is over the toast
        if (new URLSearchParams(location.hash.slice(1)).has('hover')) document.documentElement.setAttribute('data-preview-hover', '')
        setToast({ id: 0, icon: 'message-square', noteId: 1, label: tr('Messenger'), title: tr('Kevin'), sub: tr('are you coming tonight? we are at the usual place'), ms: 60_000 })
      }
    if (previewParam === 'Inbox')
      setInbox([
        { key: 1, id: 1, app: 'Messenger', title: 'Kevin', body: 'are you coming tonight? we are at the usual place', at: Date.now() - 120_000 },
        { key: 2, id: 2, app: 'Outlook', title: 'Weekly report due', body: null, at: Date.now() - 3_600_000 },
        { key: 3, id: 3, app: 'Discord', title: 'Server', body: 'Someone mentioned you in #general: the patch notes are up, take a look when you can', at: Date.now() - 7_200_000 }
      ])
    if (previewParam === 'Live')
      setMedia({ title: tr('Weightless'), artist: 'Marconi Union', app: 'Spotify.exe', playing: true, duration: 480, art: '' })
    // &demo (dev preview only): a running timer and stopwatch and sample weather, for screenshots.
    if (new URLSearchParams(location.hash.slice(1)).has('demo')) {
      setWeather({ place: 'Iloilo City', temp: 31, code: 2, day: true, high: 33, low: 26, at: 0 })
      timers.add(5)
      timers.add(25)
      timers.swToggle()
    }
    if (previewParam === 'Busy') {
      setWeather({ place: 'Iloilo', temp: 31, code: 2, day: true, high: 33, low: 26, at: 0 })
      setDndUntil(-1)
      setPrivacy({ mic: [], cam: ['Camera'] })
      setDownload({ name: 'setup.exe', bytes: 48_000_000 })
    }
    if (previewParam) return
    void window.overlay.mediaGet().then((m) => {
      setMedia(m)
      lastTrack.current = m ? `${m.title}|${m.artist}` : ''
    })
    const offMedia = window.overlay.onMedia(take)
    const offNote = window.overlay.onNote((n) => {
      const seen = expandedRef.current && tabRef.current === 'Inbox'
      setInbox((l) => [{ key: inboxKey.current++, id: n.id, app: n.app, title: n.title, body: n.body, at: Date.now() }, ...l].slice(0, 50))
      if (!seen) setUnseen((u) => u + 1)
      if (n.quiet || dndRef.current) return
      if (n.sound && !fullscreenRef.current) noteChime() // a toast is held back over a game or video, and so is its sound
      pushToast({
        icon: 'message-square',
        noteId: n.id,
        label: n.app,
        title: n.title ?? n.app,
        sub: n.body ?? (n.title ? undefined : 'New notification'),
        tone: 'plain',
        ms: 5200
      })
    })
    const offUpdate = window.overlay.onUpdate((u) =>
      pushToast({ icon: 'download', title: tr('Gabay {0} is available', u.version), sub: tr('Install it from Settings'), tone: 'accent', ms: 6000 })
    )
    return () => {
      offMedia()
      offNote()
      offUpdate()
    }
  }, [pushToast])

  // --- do not disturb: silences notification toasts until a time, or until turned off (-1) ---
  const [dndTick, setDndTick] = useState(0)
  const dndOn = dndUntil === -1 || Date.now() < dndUntil
  const dndRef = useRef(dndOn)
  dndRef.current = dndOn
  useEffect(() => {
    if (dndUntil <= 0) return
    const ms = dndUntil - Date.now()
    if (ms <= 0) return
    const id = window.setTimeout(() => setDndTick((t) => t + 1), Math.min(ms + 50, 2 ** 31 - 1))
    return () => window.clearTimeout(id)
  }, [dndUntil, dndTick])
  const setDnd = useCallback((until: number): void => {
    setDndUntil(until)
    void window.overlay.setSettings({ dndUntil: until })
  }, [])

  // --- weather (Settings > Weather): every 20 minutes and whenever the place changes ---
  const [weather, setWeather] = useState<Weather | null>(null)
  useEffect(() => {
    if (previewParam) return
    if (!place) {
      setWeather(null)
      return
    }
    const load = (): void => void window.overlay.weatherGet().then(setWeather, () => undefined)
    load()
    const id = window.setInterval(load, 20 * 60_000)
    return () => window.clearInterval(id)
  }, [place])

  // --- open apps (while the Windows taskbar is hidden) ---
  const [wins, setWins] = useState<DockApp[]>(previewDock ? SAMPLE_WINS : [])
  useEffect(() => {
    if (previewParam) return
    return window.overlay.onWindows(setWins)
  }, [])
  useEffect(() => {
    if (expanded && dockOn && !previewParam) void window.overlay.windowsGet().then(setWins, () => undefined)
  }, [expanded, dockOn])
  const [tray, setTray] = useState<TrayIcon[]>(previewDock ? SAMPLE_TRAY : [])
  useEffect(() => {
    if (previewParam) return
    return window.overlay.onTray(setTray)
  }, [])
  useEffect(() => {
    if (expanded && dockOn && !previewParam) void window.overlay.trayGet().then(setTray, () => undefined)
  }, [expanded, dockOn])
  const attention = dockOn && wins.some((a) => a.wins.some((w) => w.attention))

  // --- camera / microphone dot, downloads ---
  const [privacy, setPrivacy] = useState<{ mic: string[]; cam: string[] }>({ mic: [], cam: [] })
  const [download, setDownload] = useState<DownloadState | null>(null)
  useEffect(() => {
    if (previewParam) return
    const offPriv = window.overlay.onPrivacy(setPrivacy)
    const offDl = window.overlay.onDownload(setDownload)
    const offDone = window.overlay.onDownloadDone((name) =>
      pushToast({ icon: 'download', label: tr('Download complete'), title: name, sub: tr('In your Downloads folder'), tone: 'accent' })
    )
    return () => {
      offPriv()
      offDl()
      offDone()
    }
  }, [pushToast])

  // --- timers, stopwatch, focus timer: a chime and a toast when one ends ---
  const timers = useTimers((c) => {
    chime()
    pushToast({ icon: 'timer', label: tr('Timer done'), title: c.label, tone: 'accent', ms: 8000 })
  })
  const focusDone = useRef(false)
  useEffect(() => {
    if (focusTimer.status === 'done' && !focusDone.current) {
      chime()
      pushToast({ icon: 'timer', label: tr('Focus timer'), title: tr('Time is up'), sub: tr('Take a short break'), tone: 'accent', ms: 8000 })
    }
    focusDone.current = focusTimer.status === 'done'
  }, [focusTimer.status, pushToast])

  // --- screen recording and screenshots ---
  const recorder = useRecorder((ok) =>
    pushToast(
      ok
        ? { icon: 'video', label: tr('Recording saved'), title: tr('Videos › Gabay'), tone: 'accent' }
        : { icon: 'video', title: tr('Couldn\'t record the screen'), sub: tr('Try again in a moment'), tone: 'warn' }
    )
  )
  const [recTick, setRecTick] = useState(0)
  useEffect(() => {
    if (recorder.startedAt === null) return
    const id = window.setInterval(() => setRecTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [recorder.startedAt])
  void recTick
  const takeShot = useCallback(async (): Promise<void> => {
    const r = await window.overlay.screenshot().catch(() => null)
    pushToast(
      r
        ? { icon: 'image', art: r.thumb, label: tr('Screenshot saved'), title: tr('Copied to the clipboard'), sub: tr('Pictures › Screenshots'), tone: 'accent' }
        : { icon: 'image', title: tr('Couldn\'t take a screenshot'), tone: 'warn' }
    )
  }, [pushToast])

  // --- battery: plugged in, fully charged, low ---
  const lastBattery = useRef<{ charging: boolean; level: number } | null>(null)
  useEffect(() => {
    if (!battery) return
    const prev = lastBattery.current
    lastBattery.current = { charging: battery.charging, level: battery.level }
    if (!prev) return
    const pct = Math.round(battery.level * 100)
    if (battery.charging && !prev.charging)
      pushToast({ icon: 'zap', title: tr('Charging'), sub: `${pct}%`, ring: battery.level, tone: 'accent', ms: 3200 })
    else if (battery.charging && battery.level >= 1 && prev.level < 1)
      pushToast({ icon: 'battery-full', title: tr('Fully charged'), sub: tr('You can unplug'), tone: 'accent' })
    else if (!battery.charging)
      for (const at of [0.2, 0.1])
        if (battery.level <= at && prev.level > at)
          pushToast({ icon: 'battery-warning', title: tr('Low battery'), sub: tr('{0}% left · plug in soon', pct), ring: battery.level, tone: 'warn', ms: 6000 })
  }, [battery, pushToast])

  // --- calendar heads-up: once per event, 10 minutes before it starts ---
  const warned = useRef(new Set<string>())
  useEffect(() => {
    const check = async (): Promise<void> => {
      const a = await window.overlay.calendarGet(false).catch(() => null)
      if (!a?.connected) return
      const now = Date.now()
      for (const ev of a.events) {
        const key = `${ev.title}|${ev.start}`
        const mins = Math.round((ev.start - now) / 60_000)
        if (ev.allDay || mins < 0 || mins > 10 || warned.current.has(key)) continue
        warned.current.add(key)
        pushToast({
          icon: 'calendar',
          label: mins <= 0 ? tr('Starting now') : tr('In {0} min', mins),
          title: ev.title,
          sub: ev.location || new Date(ev.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          tone: 'accent',
          ms: 7000
        })
      }
    }
    void check()
    const id = window.setInterval(() => void check(), 60_000)
    return () => window.clearInterval(id)
  }, [pushToast])

  // --- gestures on the open notch: scroll over the tab bar for volume, middle-click to play/pause ---
  const [hud, setHud] = useState<number | null>(null)
  const hudTimer = useRef<number | undefined>(undefined)
  const onTabsWheel = (e: React.WheelEvent): void => {
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? -e.deltaY : e.deltaX
    if (!delta) return
    void window.overlay.volumeNudge(Math.sign(delta) * 4).then((r) => {
      if (!r) return
      setHud(r.volume)
      window.clearTimeout(hudTimer.current)
      hudTimer.current = window.setTimeout(() => setHud(null), 1100)
    })
  }
  const onMiddleClick = (e: React.MouseEvent): void => {
    if (e.button !== 1) return
    e.preventDefault()
    void window.overlay.mediaCommand('toggle')
  }

  // Network type for the pill: read on start, when Windows reports going on/offline, and whenever the notch opens or
  // is revealed. No timer: the collapsed notch does no work of its own.
  const [net, setNet] = useState<NetKind>('wifi')
  const refreshNet = useCallback((): void => {
    void window.overlay.networkKind().then(setNet, () => undefined)
  }, [])
  useEffect(() => {
    refreshNet()
    // Once more after the helper is up: it tells wired from Wi-Fi when both are connected.
    const later = window.setTimeout(refreshNet, 8000)
    window.addEventListener('online', refreshNet)
    window.addEventListener('offline', refreshNet)
    return () => {
      window.clearTimeout(later)
      window.removeEventListener('online', refreshNet)
      window.removeEventListener('offline', refreshNet)
    }
  }, [refreshNet])
  useEffect(() => {
    if (expanded || revealed) refreshNet()
  }, [expanded, revealed, refreshNet])
  const [todoVersion, setTodoVersion] = useState(0)

  // --- commands: same actions as the buttons ---
  const [powerRequest, setPowerRequest] = useState<PowerAction | null>(null)

  const commandActions: CommandActions = {
    startTimer: focusTimer.start,
    pauseTimer: focusTimer.pause,
    resetTimer: focusTimer.reset,
    addTodo: async (text) => {
      await window.overlay.addTodo(text)
      setTodoVersion((v) => v + 1)
    },
    openApp: async (name) => {
      const top = (await window.overlay.searchApps(name))[0]
      return top ? window.overlay.launchApp(top.id) : false
    },
    power: (action) => {
      if (action === 'restart' || action === 'shutdown') {
        // Destructive: never run from a typed line. Open the Power tab's confirmation instead.
        setTab('Power')
        setPowerRequest(action)
      } else {
        void window.overlay.runPower(action).then(onPowerDone)
      }
    },
    clearClips: () => window.overlay.clearClips(),
    goTab: (name) => {
      const t = TABS.find((x) => x.toLowerCase() === name.toLowerCase())
      if (t) setTab(t)
      return !!t
    }
  }
  const parsed = tab === 'Launch' ? parseCommand(input, commandActions) : null
  const query = input // the clipboard filter and app search both read the raw text

  // App results show on every tab except Clipboard, but only for text that is not a command.
  // The bar lives on Launch (apps and commands) and Clipboard (filter) only; other tabs show just their content.
  const hasBar = !welcome && (tab === 'Launch' || tab === 'Clipboard')
  // React doesn't fire onBlur for an input that unmounts while focused, so release its hold here, or the panel
  // could never collapse after switching from Launch to a tab without the bar.
  useEffect(() => {
    if (hasBar || !holds.current.has('input')) return
    hold('input', false)
    setBarFocused(false)
    evaluate()
  }, [hasBar, hold, evaluate])
  const showResults = expanded && tab === 'Launch' && !parsed
  // Stale responses are dropped so a slow reply can't overwrite a newer query.
  useEffect(() => {
    if (!showResults) return
    let stale = false
    window.overlay.searchApps(query).then((r) => {
      if (stale) return
      setItems(r)
      setSelected(0)
    })
    return () => {
      stale = true
    }
  }, [query, showResults])

  const release = (): void => {
    setInput('')
    inputRef.current?.blur()
  }

  // After copy-back, release the field and let the panel close.
  const onClipCopied = useCallback((): void => {
    setInput('')
    inputRef.current?.blur()
  }, [])

  const launch = async (item: LauncherItem): Promise<void> => {
    await window.overlay.launchApp(item.id)
    release()
  }

  const toggleStar = async (item: LauncherItem): Promise<void> => {
    const starred = await window.overlay.toggleStar(item.id)
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, starred } : p)))
  }

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, Math.max(items.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      // preventDefault: a confirmation button that autofocuses during this very keydown (restart/shutdown)
      // would otherwise receive the Enter's default action and cancel itself instantly.
      e.preventDefault()
      if (parsed) {
        void Promise.resolve(parsed.run()).then(() => release())
      } else if (showResults && items[selected]) {
        void launch(items[selected])
      }
    } else if (e.key === 'Escape') {
      // First Esc clears the text, second releases focus so the panel can close.
      if (input) setInput('')
      else inputRef.current?.blur()
    }
  }

  // Picking a tab by hand starts it clean: typed text would otherwise keep covering the new tab with app results.
  // The Inbox counts as seen whenever it is on screen (a note that arrived while it sat collapsed must not leave a stale dot).
  useEffect(() => {
    if (expanded && tab === 'Inbox') setUnseen(0)
  }, [expanded, tab])
  const selectTab = useCallback((t: Tab): void => {
    setTab(t)
    if (t === 'Inbox') setUnseen(0)
    setInput('')
  }, [])

  // Ctrl+1..9 switch tabs while the panel is open.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return
      const t = TABS[Number(e.key) - 1]
      if (t) {
        e.preventDefault()
        selectTab(t)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded, selectTab])

  // Collapsed, the notch is the pill, a little wider while media plays, and grows for a toast.
  const showToast = !expanded && toast !== null
  // Only while the pill is on screen: no meter animating behind a full-screen video or an auto-hidden notch.
  const onScreen = revealed || (visibility === 'always' && !fullscreen)
  const recording = recorder.startedAt !== null
  const live = !expanded && !showToast && onScreen && (!!media?.playing || !!download || recording)
  // The pill is as wide as its two sides need (they are equal, so the clock stays centred): about 12 px per icon.
  const leftPx = 12 + (live && media?.playing ? 21 : 0) + (weather ? 41 : 0) + (dndOn ? 16 : 0) + (attention ? 12 : 0)
  const rightPx = (battery ? 34 : 0) + (live && download ? 52 : live && media?.playing ? 20 : 0) + (privacy.cam.length || privacy.mic.length ? 12 : 0)
  const pillWidth = Math.max(live ? NOTCH.live.width : NOTCH.collapsed.width, 2 * Math.max(leftPx, rightPx) + 104)
  // The dock adds its own height on top of the usual cap, so tall tabs aren't squeezed by it.
  const dockShown = dockOn && !welcome && !tour && (wins.length > 0 || tray.length > 0) && tab === 'Launch' // running apps live on Launch only
  const panelCap = NOTCH.expanded.height + (dockShown ? NOTCH.expanded.dock : 0)
  const size = expanded
    ? { width: NOTCH.expanded.width, height: Math.min(panelHeight, panelCap) }
    : showToast
      ? NOTCH.toast
      : { width: pillWidth, height: NOTCH.collapsed.height }
  const bottomRadius = expanded ? 28 : showToast ? NOTCH.toastBottomRadius : NOTCH.collapsedBottomRadius
  const soonest = timers.countdowns
    .filter((c) => c.endAt !== null)
    .sort((a, b) => (a.endAt ?? 0) - (b.endAt ?? 0))[0]

  let body: React.JSX.Element
  if (tour) {
    body = (
      <UpdateTour
        version={tour}
        onDone={finishTour}
        onOpenSettings={() => {
          setTab('Settings')
          finishTour()
        }}
      />
    )
  } else if (welcome) {
    body = <Welcome hotkey={activeHotkey} accent={accentName} onAccent={setAccentName} onDone={finishWelcome} />
  } else if (showResults) {
    body = (
      <Launcher
        items={items}
        selected={selected}
        emptyHint={input.trim() ? tr('No matching apps') : tr('Type to search apps. Star one to pin it here.')}
        onHover={setSelected}
        onLaunch={(it) => void launch(it)}
        onToggleStar={(it) => void toggleStar(it)}
      />
    )
  } else if (expanded && tab === 'Clipboard') {
    body = <ClipboardPanel query={query} onCopied={onClipCopied} />
  } else if (expanded && tab === 'Today') {
    body = <TodayPanel timer={focusTimer} timers={timers} weather={weather} todoVersion={todoVersion} onHold={onTodoHold} />
  } else if (expanded && tab === 'Inbox') {
    body = (
      <InboxPanel
        items={inbox}
        onOpen={(it) => {
          if (it.id !== undefined) void window.overlay.noteOpen(it.id)
          setInbox((l) => l.filter((x) => x.key !== it.key))
        }}
        onDismiss={(it) => {
          if (it.id !== undefined) void window.overlay.noteDismiss(it.id)
          setInbox((l) => l.filter((x) => x.key !== it.key))
        }}
        onClear={() => {
          for (const it of inbox) if (it.id !== undefined) void window.overlay.noteDismiss(it.id)
          setInbox([])
        }}
      />
    )
  } else if (expanded && tab === 'Notes') {
    body = <NotesPanel onHold={onTodoHold} />
  } else if (expanded && tab === 'Power') {
    body = (
      <PowerPanel
        request={powerRequest}
        onRequestHandled={() => setPowerRequest(null)}
        onConfirming={onConfirming}
        onDone={onPowerDone}
      />
    )
  } else if (expanded && tab === 'Settings') {
    body = <SettingsPanel onSettings={applySettings} onHold={onTodoHold} onShowWelcome={startWelcome} onShowTour={startTour} liveHotkey={activeHotkey} />
  } else if (expanded && tab === 'System') {
    // StatsPanel exists only while visible, so its polling stops when the notch collapses or the tab changes.
    body = <StatsPanel />
  } else if (expanded && tab === 'Controls') {
    body = (
      <QuickPanel
        battery={battery}
        dndOn={dndOn}
        dndUntil={dndUntil}
        onDnd={setDnd}
        recording={recording}
        onRecord={() => (recording ? recorder.stop() : void recorder.start())}
        onShot={() => void takeShot()}
      />
    )
  } else {
    body = <div className="body body-center">{tr(tab)}</div>
  }

  return (
    <motion.div
      ref={notchRef}
      className="notch"
      initial={false}
      onMouseDown={onMiddleClick}
      animate={{
        width: size.width,
        height: size.height,
        // Auto-hide parks the collapsed notch just above the screen; it slides in when revealed or expanded.
        y: expanded || revealed || showToast || (visibility === 'always' && !fullscreen) ? 0 : -(NOTCH.collapsed.height + 4),
        // Always flush with the top edge (the concave shoulders are drawn in CSS); only the bottom corners animate.
        borderBottomLeftRadius: bottomRadius,
        borderBottomRightRadius: bottomRadius
      }}
      transition={SPRING}
    >
      {/* The clip layer keeps content inside the animated shape while .notch itself stays unclipped for its shoulders. */}
      <div className="notch-clip">
        {/* Fixed-width panel so it never reflows mid-animation. */}
        <motion.div
          ref={panelRef}
          className="panel"
          initial={false}
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={{ duration: expanded ? 0.2 : 0.1, delay: expanded ? 0.12 : 0 }}
          style={{ pointerEvents: expanded ? 'auto' : 'none', maxHeight: panelCap }}
        >
          {!welcome && (
          <div className="tabs" role="tablist" aria-label={tr('Sections')} onWheel={onTabsWheel}>
            {TABS.map((t, i) => (
              <button
                key={t}
                role="tab"
                aria-selected={t === tab}
                title={`${tr(t)} (Ctrl+${i + 1})`}
                aria-label={t === 'Inbox' && unseen > 0 && tab !== 'Inbox' ? `${tr(t)}, ${tr('New')}` : undefined}
                className={t === tab ? 'tab on' : 'tab'}
                tabIndex={expanded ? 0 : -1}
                onClick={() => selectTab(t)}
              >
                {tr(t)}
                {t === 'Inbox' && unseen > 0 && tab !== 'Inbox' && <span className="tab-badge" aria-hidden="true" />}
                {/* One marker shared by all tabs: Motion slides it from the old tab to the new one. */}
                {t === tab && <motion.span layoutId="tab-marker" className="tab-marker" transition={SPRING} />}
              </button>
            ))}
            <AnimatePresence>
              {hud !== null && (
                <motion.div
                  className="vol-hud"
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.16 }}
                >
                  <Icon name={hud === 0 ? 'volume-x' : hud < 50 ? 'volume-1' : 'volume-2'} size={14} />
                  <span className="vol-hud-bar">
                    <span style={{ transform: `scaleX(${hud / 100})` }} />
                  </span>
                  <span className="vol-hud-val">{hud}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={welcome ? 'welcome' : showResults ? 'results' : tab}
              className="body-wrap"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            >
              {body}
            </motion.div>
          </AnimatePresence>
          {dockShown && <Dock apps={wins} tray={tray} onInbox={() => setTab('Inbox')} onHold={(h) => { hold('menu', h); if (!h) evaluate() }} />}
          {hasBar && (
          <label className={parsed ? 'bar is-command' : 'bar'}>
            <Icon name={parsed ? 'command' : 'search'} size={16} />
            <input
              ref={inputRef}
              placeholder={tab === 'Clipboard' ? tr('Search clipboard') : tr('Search apps, or type a command')}
              aria-label={tr('Search or command')}
              spellCheck={false}
              autoComplete="off"
              value={input}
              tabIndex={expanded ? 0 : -1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKey}
              onFocus={() => {
                hold('input', true)
                setBarFocused(true)
                evaluate()
              }}
              onBlur={() => {
                hold('input', false)
                setBarFocused(false)
                evaluate()
              }}
            />
            {parsed ? (
              <span className="bar-hint on">{parsed.hint} · Enter</span>
            ) : (
              !input && barFocused && <span className="bar-hint">{tr('lock · focus 25 · todo … · open …')}</span>
            )}
          </label>
          )}
        </motion.div>

        {/* Collapsed pill content: clock, or the focus-timer ring while one exists. */}
        <motion.div
          className="status"
          initial={false}
          animate={{ opacity: expanded || showToast ? 0 : 1 }}
          transition={{ duration: 0.12 }}
        >
          <NotchStatus
            clock={clock}
            timer={focusTimer}
            battery={battery}
            wired={!hasWifi}
            net={net}
            media={live ? media : null}
            weather={weather}
            dnd={dndOn}
            privacy={privacy}
            attention={attention}
            recordingMs={recording ? Date.now() - (recorder.startedAt ?? Date.now()) : null}
            stopwatchMs={timers.stopwatch.running ? timers.elapsedMs : null}
            countdown={soonest ? { leftMs: leftOf(soonest, timers.now), totalMs: soonest.totalMs } : null}
            download={live ? download : null}
          />
        </motion.div>
        <AnimatePresence>{showToast && toast && (
            <NotchToast
              key={toast.id}
              toast={toast}
              actions={
                toast.noteId !== undefined
                  ? {
                      onDismiss: () => {
                        void window.overlay.noteDismiss(toast.noteId as number)
                        showNext()
                      },
                      onOpen: () => {
                        void window.overlay.noteOpen(toast.noteId as number)
                        showNext()
                      }
                    }
                  : undefined
              }
            />
          )}</AnimatePresence>
      </div>
    </motion.div>
  )
}
