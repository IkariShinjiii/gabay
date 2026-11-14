import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import type { CalEvent, Todo, Weather } from './global'
import type { Timers } from './useTimers'
import { weatherLook } from './weatherIcon'
import type { FocusTimer } from './useFocusTimer'
import { dateLocale, tr } from './i18n'
import MonthView from './MonthView'
import { TodaySky } from './TodaySky'
import { TodayTimeline, type CalState } from './TodayTimelineView'
import { TodayFocus } from './TodayFocus'
import { TodayTools } from './TodayTools'
import { devCal, devNow, devQuery, devTimer, devTodos, devWeather } from './todayPreview'

interface Props {
  timer: FocusTimer
  /** Stopwatch and countdowns (they live in App so they keep running when the panel closes). */
  timers: Timers
  weather: Weather | null
  /** Bumped when a to-do is added from elsewhere (the command bar) so the list re-reads. */
  todoVersion: number
  /** Input focus keeps the panel open (same rule as the search field). */
  onHold: (held: boolean) => void
}

type Cal = { connected: boolean; events: CalEvent[]; error: boolean }

/** Mounted only while the Today tab is visible, so its 1 s clock stops when the panel closes. */
export default function TodayPanel({ timer: realTimer, timers, weather: realWeather, todoVersion, onHold }: Props): React.JSX.Element {
  const dev = useRef(devQuery()).current // null in a packaged build
  const fixedNow = useRef(devNow(dev)).current
  const devW = devWeather(dev?.get('wx'))
  const weather = devW === undefined ? realWeather : devW
  const timer = devTimer(dev?.get('focus'), realTimer)
  const devTodoList = useRef(devTodos(dev?.get('todos'))).current
  const [now, setNow] = useState(() => fixedNow ?? new Date())
  const [todos, setTodos] = useState<Todo[]>(devTodoList ?? [])
  const [todosError, setTodosError] = useState(false)
  const [cal, setCal] = useState<Cal | null>(null)
  const [draft, setDraft] = useState('')
  const [month, setMonth] = useState(() => !!dev?.has('month')) // &month: dev preview
  const [tools, setTools] = useState(() => !!dev?.has('tools'))
  const [focusField, setFocusField] = useState(false)
  const [lengthMin, setLengthMin] = useState(25)
  const moreRef = useRef<HTMLButtonElement>(null)
  const adding = useRef(false)

  useEffect(() => {
    if (fixedNow) return
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [fixedNow])

  useEffect(() => {
    if (devTodoList) return
    setTodosError(false)
    window.overlay.listTodos().then(setTodos, () => setTodosError(true))
  }, [todoVersion, devTodoList])

  useEffect(() => {
    const d = devCal(dev?.get('cal'), now)
    if (d) return void setCal(d === 'loading' ? null : d)
    // A failed request shows the same state as a calendar that cannot be reached, not a spinner forever.
    void window.overlay.calendarGet(false).then(setCal, () => setCal({ connected: true, events: [], error: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Releasing the hold if this unmounts while the field is focused.
  useEffect(() => () => onHold(false), [onHold])

  // Preview to-dos never touch the real file.
  const apply = useCallback(
    (real: () => Promise<Todo[]>, local: (l: Todo[]) => Todo[]): void => {
      if (devTodoList) setTodos(local)
      else real().then(setTodos, () => undefined)
    },
    [devTodoList]
  )
  const add = (): void => {
    const text = draft.trim()
    if (!text) return
    if (devTodoList) {
      setTodos((l) => [...l, { id: `${Date.now()}`, text, done: false }])
      setDraft('')
    } else {
      // One add at a time (a double Enter must not add twice). The field clears at once and gets the text back only if the add rejects and nothing new was typed.
      if (adding.current) return
      adding.current = true
      setDraft('')
      window.overlay
        .addTodo(text)
        .then(setTodos, () => setDraft((d) => d || text))
        .finally(() => {
          adding.current = false
        })
    }
  }
  const toggle = useCallback((id: string): void => apply(() => window.overlay.toggleTodo(id), (l) => l.map((t) => (t.id === id ? { ...t, done: !t.done } : t))), [apply])
  const remove = useCallback((id: string): void => apply(() => window.overlay.removeTodo(id), (l) => l.filter((t) => t.id !== id)), [apply])

  const openTools = useCallback((field?: boolean) => {
    setFocusField(!!field)
    setTools(true)
  }, [])
  const toggleTools = useCallback(() => {
    setFocusField(false)
    setTools((o) => !o)
  }, [])
  const closeTools = useCallback(() => {
    setTools(false)
    moreRef.current?.focus()
  }, [])
  const onLength = useCallback(
    (m: number) => {
      setLengthMin(m)
      timer.start(m)
    },
    [timer]
  )

  const minute = now.getHours() * 60 + now.getMinutes()
  const minuteKey = Math.floor(now.getTime() / 60000)
  const polar = weather && weather.rise !== undefined && weather.rise === weather.set ? (weather.day ? 'day' : 'night') : undefined
  const look = weather ? weatherLook(weather.code, weather.day) : null
  const hl = weather ? tr('H {0} L {1}', `${weather.high}°`, `${weather.low}°`) : ''
  const calState: CalState = cal === null ? 'loading' : !cal.connected ? 'off' : cal.error ? 'error' : 'ok'

  return (
    <div
      className="body today-wrap"
      onKeyDown={(e) => {
        // Esc on the Focus pill closes the drawer (inside the drawer its own handler does).
        if (tools && e.key === 'Escape' && (e.target as HTMLElement).closest('.foc')) {
          e.stopPropagation()
          closeTools()
        }
      }}
    >
      <div className="today-head">
        <div>
          <div className="today-clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          <button className="date-btn" onClick={() => setMonth((m) => !m)} title={tr('Calendar')} aria-expanded={month}>
            {now.toLocaleDateString(dateLocale(), { weekday: 'long', month: 'short', day: 'numeric' })}
            <Icon name="calendar" size={12} />
          </button>
        </div>
        {weather && look && (
          <div className="today-wx" title={hl}>
            <span className="today-temp">{weather.temp}°</span>
            <span className="today-wx-line">{weather.place ? `${look.label} · ${weather.place}` : look.label}</span>
            <span className="sr-only">{hl}</span>
          </div>
        )}
      </div>

      {month ? (
        <div className="today-month">
          <MonthView today={now} onClose={() => setMonth(false)} />
        </div>
      ) : (
        <>
          <TodaySky rise={weather?.rise} set={weather?.set} minute={minute} polar={polar} locale={dateLocale()} />
          <div className="today-slot">
            {tools ? (
              <TodayTools
                id="today-tools"
                timer={timer}
                timers={timers}
                lengthMin={lengthMin}
                onLength={onLength}
                draft={draft}
                onDraft={setDraft}
                onAddTodo={add}
                onHold={onHold}
                onClose={closeTools}
                focusField={focusField}
              />
            ) : (
              <TodayTimeline
                events={cal?.events ?? null}
                calState={calState}
                todos={todos}
                todosError={todosError}
                minuteKey={minuteKey}
                onToggle={toggle}
                onRemove={remove}
                onOpenTools={openTools}
              />
            )}
          </div>
        </>
      )}

      <TodayFocus timer={timer} lengthMin={lengthMin} open={tools} onToggleTools={toggleTools} toolsId="today-tools" moreRef={moreRef} />
    </div>
  )
}
