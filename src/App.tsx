import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { COLLAPSE_DELAY_MS, NOTCH } from './constants'

type Mode = 'click-through' | 'interactive'

const TABS = ['Today', 'System', 'Clipboard', 'Launch']
const SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const

export default function App(): React.JSX.Element {
  const notchRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<Mode>('click-through')

  useEffect(() => {
    let inside = false
    let timer: number | undefined

    const setInteractive = (interactive: boolean): void => {
      window.overlay.setInteractive(interactive)
      setMode(interactive ? 'interactive' : 'click-through')
    }

    const enter = (): void => {
      window.clearTimeout(timer)
      timer = undefined
      if (inside) return
      inside = true
      setInteractive(true)
      setExpanded(true)
    }

    // Collapse (and go click-through again) only after the pointer has stayed out for the delay.
    const leave = (): void => {
      if (!inside || timer !== undefined) return
      timer = window.setTimeout(() => {
        timer = undefined
        inside = false
        setExpanded(false)
        setInteractive(false)
      }, COLLAPSE_DELAY_MS)
    }

    // The hit area is the notch's CURRENT rect, so it follows the spring as the notch grows/shrinks.
    // While click-through, Electron forwards mousemove only, which is all this needs.
    const onMove = (e: MouseEvent): void => {
      const r = notchRef.current?.getBoundingClientRect()
      if (!r) return
      const over =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (over) enter()
      else leave()
    }

    document.addEventListener('mousemove', onMove)
    // Pointer left the whole window while interactive: no mousemove will follow, so treat as outside.
    document.documentElement.addEventListener('mouseleave', leave)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', leave)
    }
  }, [])

  const size = expanded ? NOTCH.expanded : NOTCH.collapsed

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
      {/* Panel content: inert placeholders, no tab logic yet. Fixed width so it never reflows mid-animation. */}
      <motion.div
        className="panel"
        initial={false}
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={{ duration: expanded ? 0.2 : 0.1, delay: expanded ? 0.12 : 0 }}
        style={{ pointerEvents: expanded ? 'auto' : 'none' }}
      >
        <div className="tabs">
          {TABS.map((t, i) => (
            <span key={t} className={i === 0 ? 'tab on' : 'tab'}>
              {t}
            </span>
          ))}
        </div>
        <div className="field">Search apps…</div>
        <div className="body" />
        <div className="field">Type a command…</div>
      </motion.div>

      {/* Debug label: remove later. */}
      <span className={expanded ? 'debug debug-open' : 'debug'}>{mode}</span>
    </motion.div>
  )
}
