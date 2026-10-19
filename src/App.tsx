import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { COLLAPSE_DELAY_MS, NOTCH } from './constants'
import type { LauncherItem } from './global'
import Launcher from './Launcher'
import StatsPanel from './StatsPanel'

type Mode = 'click-through' | 'interactive'

const TABS = ['Today', 'System', 'Clipboard', 'Launch'] as const
type Tab = (typeof TABS)[number]
const SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const

export default function App(): React.JSX.Element {
  const notchRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<Mode>('click-through')
  const [tab, setTab] = useState<Tab>('Today')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<LauncherItem[]>([])
  const [selected, setSelected] = useState(0)

  // The panel stays open while the pointer is over the notch OR the search field has focus.
  // `evaluate` is the single place that decides open vs. start-the-collapse-timer.
  const pointerInside = useRef(false)
  const searchFocused = useRef(false)
  const isOpen = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  const setInteractive = useCallback((interactive: boolean): void => {
    window.overlay.setInteractive(interactive)
    setMode(interactive ? 'interactive' : 'click-through')
  }, [])

  const evaluate = useCallback((): void => {
    if (pointerInside.current || searchFocused.current) {
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
      if (pointerInside.current || searchFocused.current) return
      isOpen.current = false
      setExpanded(false)
      setQuery('')
      setInteractive(false)
    }, COLLAPSE_DELAY_MS)
  }, [setInteractive])

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
      searchRef.current?.focus()
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

  // Search results. Stale responses are dropped so a slow reply can't overwrite a newer query.
  const showResults = expanded && (query.trim() !== '' || tab === 'Launch')
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

  const launch = async (item: LauncherItem): Promise<void> => {
    await window.overlay.launchApp(item.id)
    setQuery('')
    searchRef.current?.blur()
  }

  const toggleStar = async (item: LauncherItem): Promise<void> => {
    const starred = await window.overlay.toggleStar(item.id)
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, starred } : p)))
  }

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, Math.max(items.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      const item = items[selected]
      if (item) void launch(item)
    } else if (e.key === 'Escape') {
      // First Esc clears the text, second releases focus so the panel can close.
      if (query) setQuery('')
      else searchRef.current?.blur()
    }
  }

  const size = expanded ? NOTCH.expanded : NOTCH.collapsed

  let body: React.JSX.Element
  if (showResults) {
    body = (
      <Launcher
        items={items}
        selected={selected}
        emptyHint={query.trim() ? 'No matching apps' : 'Type to search apps. Star one to pin it here.'}
        onHover={setSelected}
        onLaunch={(it) => void launch(it)}
        onToggleStar={(it) => void toggleStar(it)}
      />
    )
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
        // Flat at the screen edge when open, pill-shaped when collapsed.
        borderTopLeftRadius: expanded ? 0 : 19,
        borderTopRightRadius: expanded ? 0 : 19,
        borderBottomLeftRadius: expanded ? 28 : 19,
        borderBottomRightRadius: expanded ? 28 : 19
      }}
      transition={SPRING}
    >
      {/* Fixed-width panel so it never reflows mid-animation. */}
      <motion.div
        className="panel"
        initial={false}
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={{ duration: expanded ? 0.2 : 0.1, delay: expanded ? 0.12 : 0 }}
        style={{ pointerEvents: expanded ? 'auto' : 'none' }}
      >
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'tab on' : 'tab'} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <input
          ref={searchRef}
          className="field"
          placeholder="Search apps…"
          spellCheck={false}
          autoComplete="off"
          value={query}
          tabIndex={expanded ? 0 : -1}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          onFocus={() => {
            searchFocused.current = true
            evaluate()
          }}
          onBlur={() => {
            searchFocused.current = false
            evaluate()
          }}
        />
        {body}
        {/* Command bar stays inert until the Today/command milestone. */}
        <div className="field field-inert">Type a command…</div>
      </motion.div>

      {/* Debug label: remove later. */}
      <span className={expanded ? 'debug debug-open' : 'debug'}>{mode}</span>
    </motion.div>
  )
}
