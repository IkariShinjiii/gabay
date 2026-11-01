import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import type { IconName } from './icons'

// Icons don't change while the app runs, so remember them (including "none") for the whole session.
const cache = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

function load(id: string): Promise<string | null> {
  let p = pending.get(id)
  if (!p) {
    p = window.overlay
      .appIcon(id)
      .catch(() => null)
      .then((url) => {
        cache.set(id, url)
        return url
      })
    pending.set(id, p)
  }
  return p
}

/**
 * An app's own icon, with a neutral glyph while it loads or when the app has none. `lazy` waits until the row is
 * scrolled near view, so a long list (All apps) doesn't ask for hundreds of icons at once.
 */
export default function AppIcon({ id, lazy = false, fallback = 'app-window' }: { id: string; lazy?: boolean; fallback?: IconName }): React.JSX.Element {
  const [url, setUrl] = useState<string | null | undefined>(cache.get(id))
  const [near, setNear] = useState(!lazy)
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (near || cache.has(id)) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((seen) => {
      if (seen.some((s) => s.isIntersecting)) {
        setNear(true)
        io.disconnect()
      }
    }, { rootMargin: '160px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [id, near])

  useEffect(() => {
    let stale = false
    if (cache.has(id)) setUrl(cache.get(id))
    else if (near) {
      setUrl(undefined)
      void load(id).then((u) => !stale && setUrl(u))
    }
    return () => {
      stale = true
    }
  }, [id, near])

  return url ? (
    <img className="app-icon" src={url} alt="" width={22} height={22} draggable={false} />
  ) : (
    <span className="app-icon app-icon-none" ref={ref}>
      <Icon name={fallback} size={16} />
    </span>
  )
}
