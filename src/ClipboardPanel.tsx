import Empty from './Empty'
import { useEffect, useState } from 'react'
import Icon from './Icon'
import type { ClipItem } from './global'
import { tr } from './i18n'

const REFRESH_MS = 1000

interface Props {
  query: string
  /** Called after an item was copied back, so the panel can close. */
  onCopied: () => void
}

/** Mounted only while the Clipboard tab is visible in an expanded notch, so the refresh stops on unmount. */
export default function ClipboardPanel({ query, onCopied }: Props): React.JSX.Element {
  const [items, setItems] = useState<ClipItem[]>([])
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    let stale = false
    let timer: number | undefined
    const load = async (): Promise<void> => {
      const r = await window.overlay.listClipboard(query)
      if (stale) return
      setItems(r)
      setSelected((s) => Math.min(s, Math.max(r.length - 1, 0)))
      timer = window.setTimeout(load, REFRESH_MS)
    }
    void load()
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [query])

  const copy = async (item: ClipItem): Promise<void> => {
    await window.overlay.copyClip(item.id)
    onCopied()
  }

  const pin = async (item: ClipItem): Promise<void> => {
    const pinned = await window.overlay.togglePin(item.id)
    setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, pinned } : p)))
  }

  const clear = async (): Promise<void> => {
    await window.overlay.clearClips()
    setItems((prev) => prev.filter((p) => p.pinned))
  }

  if (items.length === 0) {
    return (
      query.trim() ? (
        <Empty icon="search" title={tr('No matching clips')} />
      ) : (
        <Empty icon="copy" title={tr('Nothing copied yet')} hint="Text and images you copy show up here. Pin text to keep it." />
      )
    )
  }

  return (
    <div className="body results">
      <button className="clear" onMouseDown={(e) => e.preventDefault()} onClick={() => void clear()}>
        {tr('Clear history (keeps pinned)')}
      </button>
      {items.map((it, i) => (
        <div
          key={it.id}
          className={i === selected ? 'row on' : 'row'}
          onMouseMove={() => setSelected(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void copy(it)}
        >
          {it.image && <img className="clip-thumb" src={it.image} alt="" draggable={false} />}
          <span className="row-name">{it.preview}</span>
          {!it.image && (
          <button
            className={it.pinned ? 'star on' : 'star'}
            title={it.pinned ? tr('Unpin') : tr('Pin (kept across restarts)')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation()
              void pin(it)
            }}
          >
            <Icon name="pin" size={15} />
          </button>
          )}
        </div>
      ))}
    </div>
  )
}
