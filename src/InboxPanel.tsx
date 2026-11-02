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
  /** Clears every notification from one app. */
  onClearApp: (app: string) => void
  onClear: () => void
}

/** How many of an app's notifications show before "Show N more". */
const SHOWN = 3

function ago(at: number): string {
  const m = Math.floor((Date.now() - at) / 60_000)
  if (m < 1) return tr('now')
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

/** Notifications by app, newest app first; each app's own list stays newest first. */
function byApp(items: InboxItem[]): { app: string; items: InboxItem[] }[] {
  const groups = new Map<string, InboxItem[]>()
  for (const it of items) {
    const list = groups.get(it.app)
    if (list) list.push(it)
    else groups.set(it.app, [it])
  }
  return [...groups].map(([app, list]) => ({ app, items: list }))
}

const lines = (it: InboxItem): React.JSX.Element => (
  <>
    <span className="inbox-line">
      <span className={it.title ? 'inbox-title' : 'inbox-title inbox-title-none'}>{it.title ?? tr('New notification')}</span>
      <span className="inbox-time">{ago(it.at)}</span>
    </span>
    {it.body && <span className="inbox-body">{it.body}</span>}
  </>
)

export default function InboxPanel({ items, onOpen, onDismiss, onClearApp, onClear }: Props): React.JSX.Element {
  // Re-render each 30 s so "2m" keeps counting while the tab is open.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  // Apps whose whole list is showing (by name; forgotten when the tab closes).
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  if (items.length === 0) {
    return <Empty icon="bell" title={tr('No notifications')} hint={tr('New Windows notifications are listed here, including ones silenced by Do not disturb. They are not saved.')} />
  }
  const toggle = (app: string): void =>
    setOpen((s) => {
      const next = new Set(s)
      if (!next.delete(app)) next.add(app)
      return next
    })
  return (
    <div className="body results inbox">
      <button className="clear" onMouseDown={(e) => e.preventDefault()} onClick={onClear}>
        {tr('Clear all')}
      </button>
      {byApp(items).map((g) => {
        const all = open.has(g.app)
        // folded only when that hides at least two ("Show 1 more" would take as much room as the one it hides)
        const hidden = g.items.length > SHOWN + 1 ? g.items.length - SHOWN : 0
        const shown = all || !hidden ? g.items : g.items.slice(0, SHOWN)
        return (
          <section key={g.app} className="inbox-group" aria-label={g.app}>
            <div className="inbox-head">
              <span className="inbox-app">{g.app}</span>
              {g.items.length > 1 && <span className="inbox-count">{g.items.length}</span>}
              <button
                className="inbox-x"
                title={tr('Clear {0}', g.app)}
                aria-label={tr('Clear {0}', g.app)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onClearApp(g.app)}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
            {shown.map((it) => (
              <div key={it.key} className="inbox-row">
                {/* A real button, so the keyboard reaches it; without an id Windows can't open the app, so it is plain text. */}
                {it.id === undefined ? (
                  <span className="inbox-text">{lines(it)}</span>
                ) : (
                  <button className="inbox-text inbox-open" title={tr('Open')} onMouseDown={(e) => e.preventDefault()} onClick={() => onOpen(it)}>
                    {lines(it)}
                  </button>
                )}
                <button
                  className="inbox-x"
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
            {hidden > 0 && (
              <button className="inbox-more" aria-expanded={all} onMouseDown={(e) => e.preventDefault()} onClick={() => toggle(g.app)}>
                {all ? tr('Show less') : tr('Show {0} more', hidden)}
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
}
