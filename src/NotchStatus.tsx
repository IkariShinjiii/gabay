import { formatMs, type FocusTimer } from './useFocusTimer'

const R = 8
const C = 2 * Math.PI * R

/** What the collapsed pill shows: the clock, or a progress ring and countdown while a focus timer exists. */
export default function NotchStatus({ clock, timer }: { clock: string; timer: FocusTimer }): React.JSX.Element {
  if (timer.status === 'idle') return <span className="status-clock">{clock}</span>

  const left = timer.totalMs > 0 ? timer.remainingMs / timer.totalMs : 0
  return (
    <span className={timer.status === 'paused' ? 'status-timer paused' : 'status-timer'}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r={R} className="ring-bg" />
        <circle
          cx="10"
          cy="10"
          r={R}
          className="ring-fg"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - left)}
          transform="rotate(-90 10 10)"
        />
      </svg>
      {timer.status === 'done' ? 'Done' : formatMs(timer.remainingMs)}
    </span>
  )
}
