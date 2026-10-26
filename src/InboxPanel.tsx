import { useEffect, useState } from 'react'
import Empty from './Empty'
import Icon from './Icon'
import { tr } from './i18n'

/** A Windows notification kept for this session only: it lives in memory, never on disk, and is gone when Gabay quits. */
export interface InboxItem {
  key: number
  /** Id Windows gave it, for Open and Dismiss; absent when the helper sent none. */
  id?: number
  app: string
  title: string | null
  body: string | null
  at: number
}

interface Props {
  items: InboxItem[]
  onOpen: (item: InboxItem) => void
  onDismiss: (item: InboxItem) => void
  onClear: () => void
}

function ago(at: number): string {
  const m = Math.floor((Date.now() - at) / 60_000)
  if (m < 1) return tr('now')
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

const lines = (it: InboxItem): React.JSX.Element => (
  <>
    <span className="inbox-app">
      {it.app} · {ago(it.at)}
    </span>
    {it.title && <span className="inbox-title">{it.title}</span>}
    {it.body && <span className="inbox-body">{it.body}</span>}
  </>
)

export default function InboxPanel({ items, onOpen, onDismiss, onClear }: Props): React.JSX.Element {
  // Re-render each 30 s so "2m" keeps counting while the tab is open.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  if (items.length === 0) {
    return <Empty icon="bell" title={tr('No notifications')} hint={tr('New Windows notifications are listed here, including ones silenced by Do not disturb. They are not saved.')} />
  }
  return (
    <div className="body results">
      <button className="clear" onMouseDown={(e) => e.preventDefault()} onClick={onClear}>
        {tr('Clear all')}
      </button>
      {items.map((it) => (
        <div key={it.key} className="row inbox-row">
          {/* A real button, so the keyboard reaches it; without an id Windows can't open the app, so it is plain text. */}
          {it.id === undefined ? (
            <span className="inbox-text">{lines(it)}</span>
          ) : (
            <button className="inbox-text inbox-open" title={tr('Open')} onMouseDown={(e) => e.preventDefault()} onClick={() => onOpen(it)}>
              {lines(it)}
            </button>
          )}
          <button
            className="star"
            title={tr('Dismiss')}
            aria-label={tr('Dismiss')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation()
              onDismiss(it)
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
