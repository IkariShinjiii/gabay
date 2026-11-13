import { useEffect, useState } from 'react'
import Icon from './Icon'
import type { CalEvent } from './global'
import { dateLocale, tr } from './i18n'

const DAY = 86_400_000

/** A month grid for the Today tab: step through months, today is marked. Weeks start on Sunday.
 *  Click a day to list its events. The calendar is only read for today and tomorrow (electron/calendar.ts). */
export default function MonthView({ today, onClose }: { today: Date; onClose: () => void }): React.JSX.Element {
  const [shown, setShown] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [picked, setPicked] = useState<number | null>(null)
  const [agenda, setAgenda] = useState<{ connected: boolean; events: CalEvent[]; error: boolean } | null>(null)
  useEffect(() => {
    // A failed request shows the same state as a calendar that cannot be reached, not a spinner forever.
    void window.overlay.calendarGet(false).then(setAgenda, () => setAgenda({ connected: true, events: [], error: true }))
  }, [])
  const first = shown.getDay()
  const days = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate()
  const cells = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const step = (d: number): void => {
    setShown(new Date(shown.getFullYear(), shown.getMonth() + d, 1))
    setPicked(null)
  }
  const isToday = (d: number): boolean => d === today.getDate() && shown.getMonth() === today.getMonth() && shown.getFullYear() === today.getFullYear()
  // 2023-01-01 was a Sunday: the seven column headings in the user's language.
  const heads = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(dateLocale(), { weekday: 'narrow' }))
  // The picked day's events. The calendar only holds today and tomorrow, so other days say so instead of guessing.
  const dayStart = picked === null ? 0 : new Date(shown.getFullYear(), shown.getMonth(), picked).getTime()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const reachEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2).getTime() // same bound as electron/calendar.ts
  const inReach = picked !== null && dayStart >= todayStart && dayStart < reachEnd
  const dayEvents = agenda && inReach ? agenda.events.filter((e) => e.start < dayStart + DAY && e.end > dayStart) : []
  const pick = (d: number): void => setPicked((p) => (p === d ? null : d))
  return (
    <div className="month">
      <div className="month-head">
        <button className="month-step flip" onClick={() => step(-1)} aria-label={tr('Previous month')}>
          <Icon name="chevron-right" size={14} />
        </button>
        <button className="month-title" onClick={onClose} title={tr('Back')}>
          {shown.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })}
        </button>
        <button className="month-step" onClick={() => step(1)} aria-label={tr('Next month')}>
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
      <div className="month-grid">
        {heads.map((h, i) => (
          <span key={i} className="month-dow">
            {h}
          </span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={i} className="month-day" />
          ) : (
            <span
              key={i}
              role="button"
              tabIndex={0}
              aria-pressed={picked === d}
              className={['month-day', isToday(d) && 'is-today', picked === d && 'is-picked'].filter(Boolean).join(' ')}
              onClick={() => pick(d)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  pick(d)
                }
              }}
            >
              {d}
            </span>
          )
        )}
      </div>
      {picked !== null && (
        <div className="month-events">
          <div className="month-events-head">{new Date(dayStart).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          {!agenda ? (
            <div className="agenda-hint">{tr('Loading…')}</div>
          ) : !agenda.connected ? (
            <div className="agenda-hint">{tr('Add your calendar in Settings to see events here.')}</div>
          ) : !inReach ? (
            <div className="agenda-hint">{tr('Only today and tomorrow are read from your calendar.')}</div>
          ) : agenda.error ? (
            <div className="agenda-hint">{tr("Couldn't reach your calendar.")}</div>
          ) : dayEvents.length === 0 ? (
            <div className="agenda-hint">{tr('Nothing on your calendar this day.')}</div>
          ) : (
            dayEvents.map((e, i) => (
              <div key={i} className="ev">
                <span className="agenda-hint">
                  {e.allDay ? tr('All day') : new Date(e.start).toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span>{e.title}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
