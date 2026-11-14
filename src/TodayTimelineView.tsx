import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Icon from './Icon'
import type { CalEvent, Todo } from './global'
import { SkeletonRows } from './Skeleton'
import { tr } from './i18n'
import { buildTimeline, inParts, minutesLeft, progress, time, underMinute, type TimelineEvent } from './todayTimeline'

export type CalState = 'loading' | 'off' | 'error' | 'ok'

interface Props {
  events: CalEvent[] | null
  calState: CalState
  todos: Todo[]
  todosError: boolean
  /** Math.floor(now / 60000): the only clock the timeline sees, so the 1 s tick never re-renders it. */
  minuteKey: number
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  /** Opens the Tools drawer; true also focuses its to-do field. */
  onOpenTools: (focusField?: boolean) => void
}

type Row =
  | { k: 'allday' | 'past' | 'upcoming' | 'tomorrow'; e: TimelineEvent }
  | { k: 'now'; e: CalEvent }
  | { k: 'sep' }
  | { k: 'hint'; text: string }
  | { k: 'more'; n: number }

const evKey = (e: CalEvent): string => `${e.title}|${e.start}`
const keep = (e: React.MouseEvent): void => e.preventDefault() // the add field keeps focus

function Place({ text }: { text: string }): React.JSX.Element {
  return (
    <span className="tl-loc">
      <Icon name="map-pin" size={10} />
      <span className="tl-loc-t">{text}</span>
    </span>
  )
}

function TodayTimelineImpl({ events, calState, todos, todosError, minuteKey, onToggle, onRemove, onOpenTools }: Props): React.JSX.Element {
  const now = minuteKey * 60000
  const tl = useMemo(() => buildTimeline(events ?? [], now, todos), [events, todos, now])

  // Calendar rows first, in design order; tasks follow without a rail.
  const rows: Row[] = []
  if (calState === 'ok') {
    tl.allDay.forEach((e) => rows.push({ k: 'allday', e }))
    if (tl.hiddenAllDay > 0) rows.push({ k: 'more', n: tl.hiddenAllDay })
    tl.past.forEach((e) => rows.push({ k: 'past', e }))
    if (tl.now) rows.push({ k: 'now', e: tl.now })
    tl.upcoming.forEach((e) => rows.push({ k: 'upcoming', e }))
    if (!tl.allDay.length && !tl.past.length && !tl.now && !tl.upcoming.length) {
      rows.push({ k: 'hint', text: tr('Nothing else on your calendar today.') })
    }
    if (tl.tomorrowAllDay.length + tl.tomorrow.length > 0) {
      rows.push({ k: 'sep' })
      ;[...tl.tomorrowAllDay, ...tl.tomorrow].forEach((e) => rows.push({ k: 'tomorrow', e }))
    }
  } else if (calState === 'off') {
    rows.push({ k: 'hint', text: tr("Add your calendar in Settings to see what's next.") })
  } else if (calState === 'error') {
    rows.push({ k: 'hint', text: tr("Couldn't reach your calendar.") })
  }
  // A hint row only gets a rail when the calendar is connected (the empty state).
  const railed = (r: Row): boolean => r.k !== 'more' && (r.k !== 'hint' || calState === 'ok')
  const firstRail = rows.findIndex(railed)
  const lastRail = rows.length - 1 - [...rows].reverse().findIndex(railed)
  const anchorIdx = rows.findIndex((r) => r.k === 'now') >= 0 ? rows.findIndex((r) => r.k === 'now') : rows.findIndex((r) => r.k === 'upcoming')

  const style = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties
  const cls = (r: Row, i: number): string =>
    `tl-row is-${r.k}${railed(r) ? ' has-rail' : ''}${i === firstRail ? ' is-first' : ''}${i === lastRail ? ' is-last' : ''}`

  const renderRow = (r: Row, i: number): React.JSX.Element => {
    const anchor = i === anchorIdx ? { 'data-anchor': '' } : {}
    switch (r.k) {
      case 'now': {
        const e = r.e
        const left = minutesLeft(e, now)
        const text = underMinute(e, now)
          ? tr('Under a minute left')
          : left > 59
            ? tr('{0}h {1}m left', Math.floor(left / 60), left % 60)
            : tr('{0} min left', left)
        return (
          <li key={`${evKey(e)}|${i}`} className={cls(r, i)} style={style(i)} aria-current="time" {...anchor}>
            <span className="tl-time tl-now-label">{tr('Now')}</span>
            <span className="tl-dot is-live" aria-hidden="true" />
            <div className="tl-now">
              <div className="tl-now-top">
                <span className="tl-title">{e.title}</span>
                <span className="tl-left">{text}</span>
              </div>
              <div className="tl-now-sub">
                <span className="tl-range">
                  {time(e.start)} {'–'} {time(e.end)}
                </span>
                {e.location && <Place text={e.location} />}
              </div>
              <div className="tl-bar" aria-hidden="true">
                <i style={{ '--p': progress(e, now) } as CSSProperties} />
              </div>
            </div>
          </li>
        )
      }
      case 'allday':
        return (
          <li key={`${evKey(r.e)}|${i}`} className={cls(r, i)} style={style(i)}>
            <span className="tl-time tl-caps">{tr('All day')}</span>
            <span className="tl-dot is-hollow" aria-hidden="true" />
            <span className="tl-title">{r.e.title}</span>
          </li>
        )
      case 'past':
        return (
          <li key={`${evKey(r.e)}|${i}`} className={cls(r, i)} style={style(i)}>
            <span className="tl-time">{time(r.e.start)}</span>
            <span className="tl-dot is-done" aria-hidden="true" />
            <span className="tl-title">{r.e.title}</span>
            <span className="tl-tag tl-caps">{tr('Done')}</span>
          </li>
        )
      case 'upcoming':
      case 'tomorrow': {
        const e = r.e
        const p = inParts(e, now)
        const tag =
          r.k === 'tomorrow'
            ? null
            : e.live
              ? tr('Now')
              : p.h > 0
                ? tr('in {0}h {1}m', p.h, p.m)
                : tr('in {0}m', p.m)
        return (
          <li key={`${evKey(e)}|${i}`} className={cls(r, i)} style={style(i)} {...anchor}>
            <span className="tl-time tl-caps">{e.allDay ? tr('All day') : time(e.start)}</span>
            <span className={`tl-dot ${e.live ? 'is-live-sm' : 'is-hollow'}`} aria-hidden="true" />
            <div className="tl-text">
              <span className="tl-title tl-title-lg">{e.title}</span>
              {e.location && <Place text={e.location} />}
            </div>
            {tag && <span className="tl-tag">{tag}</span>}
          </li>
        )
      }
      case 'sep':
        return (
          <li key="sep" className={cls(r, i)} style={style(i)}>
            <span className="tl-sep">
              <span className="tl-caps">{tr('Tomorrow')}</span>
            </span>
          </li>
        )
      case 'more':
        return (
          <li key="allday-more" className="tl-row is-more" style={style(i)}>
            <span className="tl-more-t">{tr('+{0} more', r.n)}</span>
          </li>
        )
      case 'hint':
        return (
          <li key="hint" className={cls(r, i)} style={style(i)}>
            <span className="tl-time" />
            {calState === 'ok' ? <span className="tl-dot is-hollow" aria-hidden="true" /> : <span />}
            <span className="tl-hint-t">{r.text}</span>
          </li>
        )
    }
  }

  // Tasks group.
  let n = rows.length
  const taskRows: React.JSX.Element[] = []
  const addBtn = (
    <button type="button" className="tl-add" aria-label={tr('Add a to-do…')} title={tr('Add a to-do…')} onMouseDown={keep} onClick={() => onOpenTools(true)}>
      <Icon name="plus" size={14} />
    </button>
  )
  if (todosError) {
    taskRows.push(
      <li key="t-err" className="tl-task is-hint" style={style(n++)}>
        <span className="tl-hint-t">{tr('Could not load your to-dos')}</span>
        {addBtn}
      </li>
    )
  } else if (todos.length === 0) {
    if (calState !== 'loading')
      taskRows.push(
        <li key="t-empty" className="tl-task is-hint" style={style(n++)}>
          <span className="tl-hint-t">{tr('Nothing to do. Nice.')}</span>
          {addBtn}
        </li>
      )
  } else {
    taskRows.push(
      <li key="t-head" className="tl-task is-group" style={style(n++)}>
        <span className="tl-group-t tl-caps">{tl.openCount > 0 ? tr('Tasks · {0} left', tl.openCount) : tr('Tasks · all done')}</span>
        {addBtn}
      </li>
    )
    tl.tasks.forEach((t) =>
      taskRows.push(
        <li key={t.id} className={`tl-task${t.done ? ' is-done' : ''}`} style={style(n++)}>
          <button
            type="button"
            role="checkbox"
            aria-checked={t.done}
            aria-label={t.text}
            title={tr(t.done ? 'Mark not done' : 'Mark done')}
            className="tl-check"
            onMouseDown={keep}
            onClick={() => onToggle(t.id)}
          >
            <span className="tl-box">{t.done && <Icon name="check" size={9} />}</span>
          </button>
          <span className="tl-task-t">{t.text}</span>
          <button type="button" className="tl-del" aria-label={tr('Delete')} title={tr('Delete')} onMouseDown={keep} onClick={() => onRemove(t.id)}>
            <Icon name="x" size={10} />
          </button>
        </li>
      )
    )
    if (tl.hiddenTasks > 0) {
      taskRows.push(
        <li key="t-more" className="tl-task is-more" style={style(n++)}>
          <button type="button" className="tl-more" onClick={() => onOpenTools(false)}>
            {tr('+{0} more', tl.hiddenTasks)}
          </button>
        </li>
      )
    }
  }

  // Scroll slot: Now (or next) lands as the second visible row, bottom fade only while more is below.
  const scroller = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState(false)
  const measure = (): void => {
    const el = scroller.current
    if (el) setFade(el.scrollHeight - el.scrollTop - el.clientHeight > 24)
  }
  const lead = calState === 'loading' ? 'l' : 'k'
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const a = el.querySelector<HTMLElement>('[data-anchor]')
    el.scrollTop = a ? Math.max(0, a.offsetTop - 32) : 0
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [lead, anchorIdx >= 0])
  useLayoutEffect(measure, [rows.length, taskRows.length])

  return (
    <div ref={scroller} className={`tl-scroll${fade ? ' is-scroll' : ''}`} onScroll={measure}>
      <ol className="tl-list" aria-label={tr('Your day')}>
        {calState === 'loading' && (
          <li className="tl-skel">
            <SkeletonRows count={3} />
          </li>
        )}
        {rows.map(renderRow)}
        {taskRows}
      </ol>
    </div>
  )
}

export const TodayTimeline = memo(TodayTimelineImpl)
