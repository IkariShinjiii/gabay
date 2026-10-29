import { useState } from 'react'
import Icon from './Icon'
import { dateLocale, tr } from './i18n'

/** A month grid for the Today tab: step through months, today is marked. Weeks start on Sunday. */
export default function MonthView({ today, onClose }: { today: Date; onClose: () => void }): React.JSX.Element {
  const [shown, setShown] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const first = shown.getDay()
  const days = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate()
  const cells = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const step = (d: number): void => setShown(new Date(shown.getFullYear(), shown.getMonth() + d, 1))
  const isToday = (d: number): boolean => d === today.getDate() && shown.getMonth() === today.getMonth() && shown.getFullYear() === today.getFullYear()
  // 2023-01-01 was a Sunday: the seven column headings in the user's language.
  const heads = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(dateLocale(), { weekday: 'narrow' }))
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
        {cells.map((d, i) => (
          <span key={i} className={d && isToday(d) ? 'month-day is-today' : 'month-day'}>
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}
