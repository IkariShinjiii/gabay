import { useEffect, useState } from 'react'
import Icon from './Icon'

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

/** An app's own icon, with a neutral glyph while it loads or when the app has none. */
export default function AppIcon({ id }: { id: string }): React.JSX.Element {
  const [url, setUrl] = useState<string | null | undefined>(cache.get(id))

  useEffect(() => {
    let stale = false
    if (cache.has(id)) setUrl(cache.get(id))
    else {
      setUrl(undefined)
      void load(id).then((u) => !stale && setUrl(u))
    }
    return () => {
      stale = true
    }
  }, [id])

  return url ? (
    <img className="app-icon" src={url} alt="" width={22} height={22} draggable={false} />
  ) : (
    <span className="app-icon app-icon-none">
      <Icon name="app-window" size={16} />
    </span>
  )
}
