import { useEffect, useRef } from 'react'
import Icon from './Icon'
import { formatClock, leftOf, MAX_TIMERS, type Timers } from './useTimers'
import type { FocusTimer } from './useFocusTimer'
import { tr } from './i18n'

interface Props {
  id: string
  timer: FocusTimer
  timers: Timers
  lengthMin: number
  /** Preset click: parent sets the length and calls timer.start(m). */
  onLength: (m: number) => void
  draft: string
  onDraft: (v: string) => void
  onAddTodo: () => void
  /** Input focus keeps the panel open (same rule as the search field). */
  onHold: (held: boolean) => void
  onClose: () => void
  /** Focus the to-do field on open (from the timeline's + button). */
  focusField?: boolean
}

const PRESETS = [15, 25, 50]

/** The Tools drawer: focus length presets, to-do field, stopwatch and countdown timers. */
export function TodayTools({ id, timer, timers, lengthMin, onLength, draft, onDraft, onAddTodo, onHold, onClose, focusField }: Props): React.JSX.Element {
  const first = useRef<HTMLButtonElement>(null)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ;(focusField ? field.current : first.current)?.focus()
  }, [focusField])
  const sw = timers.stopwatch
  return (
    <div
      id={id}
      className="tools-scroll"
      role="region"
      aria-label={tr('Tools')}
      onKeyDown={(e) => {
        // The field's own Esc blurs it; any other Esc closes the drawer and stops there.
        if (e.key !== 'Escape' || e.target === field.current) return
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="tools-len">
        <span className="tools-cap">{tr('Focus length')}</span>
        {PRESETS.map((m, i) => (
          <button key={m} ref={i === 0 ? first : undefined} className={m === lengthMin ? 'chip on' : 'chip'} onClick={() => onLength(m)}>
            {m}m
          </button>
        ))}
        {timer.status !== 'idle' && (
          <button className="btn small tools-reset" onClick={timer.reset}>
            {tr('Reset')}
          </button>
        )}
      </div>
      <div className="tools-add">
        <Icon name="plus" size={14} />
        <input
          ref={field}
          className="field todo-field"
          placeholder={tr('Add a to-do…')}
          aria-label={tr('Add a to-do…')}
          spellCheck={false}
          autoComplete="off"
          maxLength={200}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAddTodo()
            else if (e.key === 'Escape') e.currentTarget.blur()
          }}
          onFocus={() => onHold(true)}
          onBlur={() => onHold(false)}
        />
      </div>
      <div className="tools-grid">
        <div className="card sw">
          <div className="card-head">
            <Icon name="timer" size={13} />
            {tr('Stopwatch')}
          </div>
          <div className={sw.running ? 'sw-time running' : 'sw-time'}>{formatClock(timers.elapsedMs, true)}</div>
          <div className="timer-buttons">
            <button className="btn small" onClick={timers.swToggle}>
              {sw.running ? tr('Stop') : timers.elapsedMs > 0 ? tr('Resume') : tr('Start')}
            </button>
            {sw.running ? (
              <button className="btn small" onClick={timers.swLap}>
                {tr('Lap')}
              </button>
            ) : (
              timers.elapsedMs > 0 && (
                <button className="btn small" onClick={timers.swReset}>
                  {tr('Reset')}
                </button>
              )
            )}
          </div>
          {sw.laps.length > 0 && (
            <div className="laps">
              {sw.laps.slice(0, 2).map((l, i) => (
                <span key={sw.laps.length - i}>
                  Lap {sw.laps.length - i} · {formatClock(l, true)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="card tm">
          <div className="card-head">
            <Icon name="timer" size={13} />
            {tr('Timers')}
            <span className="tm-add">
              {[1, 5, 10, 30].map((m) => (
                <button key={m} className="chip" disabled={timers.countdowns.length >= MAX_TIMERS} onClick={() => timers.add(m)} title={`New ${m}-minute timer`}>
                  +{m}m
                </button>
              ))}
            </span>
          </div>
          {timers.countdowns.length === 0 ? (
            <div className="tm-empty">{tr('Tap +5m to start one. It keeps running when the notch closes.')}</div>
          ) : (
            <div className="tm-list">
              {timers.countdowns.slice(0, 3).map((c) => (
                <div key={c.id} className={c.endAt === null ? 'tm-row paused' : 'tm-row'}>
                  <span className="tm-left">{formatClock(leftOf(c, timers.now) + 999)}</span>
                  <span className="tm-label">{c.label}</span>
                  <button className="tm-btn" onClick={() => timers.toggle(c.id)} title={c.endAt === null ? tr('Resume') : tr('Pause')} aria-label={c.endAt === null ? tr('Resume') : tr('Pause')}>
                    <Icon name={c.endAt === null ? 'play' : 'pause'} size={11} />
                  </button>
                  <button className="tm-btn" onClick={() => timers.remove(c.id)} title={tr('Cancel')} aria-label={tr('Cancel timer')}>
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
              {timers.countdowns.length > 3 && <div className="tm-empty">+{timers.countdowns.length - 3} more</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
