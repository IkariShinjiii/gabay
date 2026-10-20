import { useEffect, useState } from 'react'
import Icon from './Icon'
import type { CalEvent, Todo } from './global'
import { formatMs, type FocusTimer } from './useFocusTimer'

interface Props {
  timer: FocusTimer
  /** Bumped when a to-do is added from elsewhere (the command bar) so the list re-reads. */
  todoVersion: number
  /** Input focus keeps the panel open (same rule as the search field). */
  onHold: (held: boolean) => void
}

const PRESETS = [15, 25, 50]

const time = (t: number): string => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** "Now", "9:30 AM", or "Tomorrow" for events after today. */
function when(ev: CalEvent, now: number): string {
  const startOfTomorrow = new Date(new Date(now).setHours(24, 0, 0, 0)).getTime()
  if (ev.start >= startOfTomorrow) return ev.allDay ? 'Tomorrow' : `Tmrw ${time(ev.start)}`
  if (ev.allDay) return 'All day'
  if (ev.start <= now && ev.end > now) return 'Now'
  return time(ev.start)
}

/** Up next from the connected calendar: what's on now and the next few events of today and tomorrow. */
function Agenda({ now }: { now: number }): React.JSX.Element | null {
  const [agenda, setAgenda] = useState<{ connected: boolean; events: CalEvent[]; error: boolean } | null>(null)
  useEffect(() => {
    void window.overlay.calendarGet(false).then(setAgenda, () => undefined)
  }, [])
  if (!agenda) return null
  if (!agenda.connected) return <div className="agenda-hint">Add your calendar in Settings to see what's next.</div>
  const next = agenda.events.filter((e) => e.end > now).slice(0, 3)
  return (
    <div className="agenda">
      {next.length === 0 ? (
        <div className="agenda-hint">{agenda.error ? "Couldn't reach your calendar." : 'Nothing else on your calendar today.'}</div>
      ) : (
        next.map((e) => {
          const live = !e.allDay && e.start <= now && e.end > now
          return (
            <div key={`${e.title}|${e.start}`} className={live ? 'ev live' : 'ev'}>
              <span className="ev-when">{when(e, now)}</span>
              <span className="ev-text">
                <span className="ev-title">{e.title}</span>
                {e.location && (
                  <span className="ev-loc">
                    <Icon name="map-pin" size={10} />
                    {e.location}
                  </span>
                )}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}

/** Mounted only while the Today tab is visible, so its 1 s clock stops when the panel closes. */
export default function TodayPanel({ timer, todoVersion, onHold }: Props): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())
  const [todos, setTodos] = useState<Todo[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    void window.overlay.listTodos().then(setTodos)
  }, [todoVersion])

  // Releasing the hold if this unmounts while the field is focused.
  useEffect(() => () => onHold(false), [onHold])

  const add = async (): Promise<void> => {
    if (!draft.trim()) return
    setTodos(await window.overlay.addTodo(draft))
    setDraft('')
  }

  const running = timer.status === 'running'
  return (
    <div className="body today">
      <div className="today-left">
        <div className="clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="date">{now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</div>

        <div className="timer">
          <div className={`timer-time ${timer.status}`}>
            {timer.status === 'done' ? 'Done' : formatMs(timer.remainingMs)}
          </div>
          <div className="timer-buttons">
            <button className="btn small" onClick={() => (running ? timer.pause() : timer.start())}>
              {running ? 'Pause' : timer.status === 'paused' ? 'Resume' : 'Start'}
            </button>
            <button className="btn small" onClick={timer.reset}>
              Reset
            </button>
          </div>
          <div className="timer-presets">
            {PRESETS.map((m) => (
              <button key={m} className="chip" onClick={() => timer.start(m)}>
                {m}m
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="today-right">
        <Agenda now={now.getTime()} />
        <input
          className="field todo-field"
          placeholder="Add a to-do…"
          spellCheck={false}
          autoComplete="off"
          maxLength={200}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
            else if (e.key === 'Escape') e.currentTarget.blur()
          }}
          onFocus={() => onHold(true)}
          onBlur={() => onHold(false)}
        />
        <div className="todos">
          {todos.length === 0 && <div className="todo-empty">Nothing to do. Nice.</div>}
          {todos.map((t) => (
            <div key={t.id} className="todo">
              <button
                className={t.done ? 'check on' : 'check'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void window.overlay.toggleTodo(t.id).then(setTodos)}
                aria-label={t.done ? 'Mark not done' : 'Mark done'}
              >
                {t.done && <Icon name="check" size={12} />}
              </button>
              <span className={t.done ? 'todo-text done' : 'todo-text'}>{t.text}</span>
              <button
                className="star"
                title="Delete"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void window.overlay.removeTodo(t.id).then(setTodos)}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
