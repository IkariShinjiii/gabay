import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { COLLAPSE_DELAY_MS, NOTCH } from './constants'
import type { LauncherItem, PowerAction } from './global'
import ClipboardPanel from './ClipboardPanel'
import { parseCommand, type CommandActions } from './commands'
import Launcher from './Launcher'
import Icon from './Icon'
import PowerPanel from './PowerPanel'
import SettingsPanel from './SettingsPanel'
import NotchStatus from './NotchStatus'
import StatsPanel from './StatsPanel'
import TodayPanel from './TodayPanel'
import { useFocusTimer } from './useFocusTimer'

const TABS = ['Today', 'System', 'Clipboard', 'Launch', 'Power', 'Settings'] as const
type Tab = (typeof TABS)[number]

const SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const

export default function App(): React.JSX.Element {
  const notchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<Tab>('Today')
  // One bar for everything: text that parses as a command is a command, anything else searches apps (or the clipboard).
  const [input, setInput] = useState('')
  const [barFocused, setBarFocused] = useState(false)
  const [items, setItems] = useState<LauncherItem[]>([])
  const [selected, setSelected] = useState(0)

  // The panel stays open while the pointer is over the notch OR something holds it open: a focused input
  // ('search', 'command', 'todo') or an on-screen confirmation ('power-confirm').
  // `evaluate` is the single place that decides open vs. start-the-collapse-timer.
  const pointerInside = useRef(false)
  const holds = useRef(new Set<string>())
  const isOpen = useRef(false)
  const collapseMs = useRef(COLLAPSE_DELAY_MS) // replaced by the saved setting once it loads
  const timer = useRef<number | undefined>(undefined)

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

  useEffect(() => {
    void window.overlay.getSettings().then((r) => (collapseMs.current = r.settings.collapseMs))
  }, [])

  useEffect(() => {
    // The hit area is the notch's CURRENT rect, so it follows the spring as the notch grows/shrinks.
    // While click-through, Electron forwards mousemove only, which is all this needs.
    const onMove = (e: MouseEvent): void => {
      const r = notchRef.current?.getBoundingClientRect()
      if (!r) return
      pointerInside.current =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      evaluate()
    }
    // Pointer left the whole window while interactive: no mousemove will follow, so treat as outside.
    const onLeave = (): void => {
      pointerInside.current = false
      evaluate()
    }
    // Global hotkey: open and put the caret in the search field, even with the pointer elsewhere.
    const offSummon = window.overlay.onSummon(() => {
      inputRef.current?.focus()
      evaluate()
    })

    document.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.clearTimeout(timer.current)
      offSummon()
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [evaluate])

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
  const parsed = parseCommand(input, commandActions)
  const query = input // the clipboard filter and app search both read the raw text

  // App results show on every tab except Clipboard, but only for text that is not a command.
  const showResults = expanded && tab !== 'Clipboard' && !parsed && (input.trim() !== '' || tab === 'Launch')
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
  const selectTab = useCallback((t: Tab): void => {
    setTab(t)
    setInput('')
  }, [])

  // Ctrl+1..6 switch tabs while the panel is open.
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

  const size = expanded ? NOTCH.expanded : NOTCH.collapsed

  let body: React.JSX.Element
  if (showResults) {
    body = (
      <Launcher
        items={items}
        selected={selected}
        emptyHint={input.trim() ? 'No matching apps' : 'Type to search apps. Star one to pin it here.'}
        onHover={setSelected}
        onLaunch={(it) => void launch(it)}
        onToggleStar={(it) => void toggleStar(it)}
      />
    )
  } else if (expanded && tab === 'Clipboard') {
    body = <ClipboardPanel query={query} onCopied={onClipCopied} />
  } else if (expanded && tab === 'Today') {
    body = <TodayPanel timer={focusTimer} todoVersion={todoVersion} onHold={onTodoHold} />
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
    body = <SettingsPanel onCollapseMs={(ms) => (collapseMs.current = ms)} />
  } else if (expanded && tab === 'System') {
    // StatsPanel exists only while visible, so its polling stops when the notch collapses or the tab changes.
    body = <StatsPanel />
  } else {
    body = <div className="body body-center">{tab}</div>
  }

  return (
    <motion.div
      ref={notchRef}
      className="notch"
      initial={false}
      animate={{
        width: size.width,
        height: size.height,
        // Always flush with the top edge (the concave shoulders are drawn in CSS); only the bottom corners animate.
        borderBottomLeftRadius: expanded ? 28 : NOTCH.collapsedBottomRadius,
        borderBottomRightRadius: expanded ? 28 : NOTCH.collapsedBottomRadius
      }}
      transition={SPRING}
    >
      {/* The clip layer keeps content inside the animated shape while .notch itself stays unclipped for its shoulders. */}
      <div className="notch-clip">
        {/* Fixed-width panel so it never reflows mid-animation. */}
        <motion.div
          className="panel"
          initial={false}
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={{ duration: expanded ? 0.2 : 0.1, delay: expanded ? 0.12 : 0 }}
          style={{ pointerEvents: expanded ? 'auto' : 'none' }}
        >
          <div className="tabs" role="tablist" aria-label="Sections">
            {TABS.map((t, i) => (
              <button
                key={t}
                role="tab"
                aria-selected={t === tab}
                title={`${t} (Ctrl+${i + 1})`}
                className={t === tab ? 'tab on' : 'tab'}
                tabIndex={expanded ? 0 : -1}
                onClick={() => selectTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {body}
          <label className={parsed ? 'bar is-command' : 'bar'}>
            <Icon name={parsed ? 'command' : 'search'} size={16} />
            <input
              ref={inputRef}
              placeholder={tab === 'Clipboard' ? 'Search clipboard, or type a command' : 'Search apps, or type a command'}
              aria-label="Search or command"
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
              !input && barFocused && <span className="bar-hint">lock · focus 25 · todo … · open …</span>
            )}
          </label>
        </motion.div>

        {/* Collapsed pill content: clock, or the focus-timer ring while one exists. */}
        <motion.div
          className="status"
          initial={false}
          animate={{ opacity: expanded ? 0 : 1 }}
          transition={{ duration: 0.12 }}
        >
          <NotchStatus clock={clock} timer={focusTimer} />
        </motion.div>
      </div>
    </motion.div>
  )
}
