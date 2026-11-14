import { memo, type RefObject } from 'react'
import Icon from './Icon'
import { formatMs, type FocusTimer } from './useFocusTimer'
import { tr } from './i18n'

interface Props {
  timer: FocusTimer
  /** Selected focus length in minutes (what Start begins when idle or done). */
  lengthMin: number
  open: boolean
  onToggleTools: () => void
  toolsId: string
  moreRef?: RefObject<HTMLButtonElement | null>
}

/** The Focus pill: progress ring, time, Reset, tools chevron, and one big Start/Pause/Resume button. */
export const TodayFocus = memo(function TodayFocus({ timer, lengthMin, open, onToggleTools, toolsId, moreRef }: Props): React.JSX.Element {
  const { status } = timer
  const idle = status === 'idle'
  const done = status === 'done'
  const running = status === 'running'
  const fraction = idle ? 0 : done ? 1 : timer.totalMs > 0 ? Math.min(1, Math.max(0, 1 - timer.remainingMs / timer.totalMs)) : 0
  const main = running ? tr('Pause') : status === 'paused' ? tr('Resume') : tr('Start')
  const label = status === 'paused' ? tr('Paused') : done ? tr('Done') : tr('Focus')
  const act = (): void => (running ? timer.pause() : status === 'paused' ? timer.start() : timer.start(lengthMin))
  const tools = open ? tr('Hide tools') : tr('Show tools')
  return (
    <div className={`foc ${status}`}>
      <svg className="foc-ring" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="21" className="foc-track" pathLength={100} />
        <circle cx="26" cy="26" r="21" className="foc-prog" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - fraction * 100} />
      </svg>
      <div className="foc-text">
        <span className={done ? 'foc-label done' : 'foc-label'}>{label}</span>
        <span className="foc-time">{formatMs(idle ? lengthMin * 60_000 : timer.remainingMs)}</span>
      </div>
      <button className="btn small foc-reset" onClick={timer.reset} disabled={idle} aria-label={tr('Reset')} style={{ visibility: idle ? 'hidden' : 'visible' }}>
        {tr('Reset')}
      </button>
      <button className="foc-more" onClick={onToggleTools} ref={moreRef} aria-expanded={open} aria-controls={toolsId} aria-label={tools} title={tools}>
        <Icon name="chevron-down" size={16} />
      </button>
      <button className="foc-main" onClick={act} aria-label={main}>
        {main}
      </button>
    </div>
  )
})
