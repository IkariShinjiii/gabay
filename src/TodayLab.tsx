import { useEffect, useState } from 'react'
import { TodaySky } from './TodaySky'
import { TodayTimeline, type CalState } from './TodayTimelineView'
import { TodayFocus } from './TodayFocus'
import { TodayTools } from './TodayTools'
import { useTimers } from './useTimers'
import type { FocusTimer, TimerStatus } from './useFocusTimer'
import type { CalEvent, Todo } from './global'

// Temporary dev harness for the Today redesign (GABAY_PREVIEW=TodayLab). F5 deletes it.
const CASES: { name: string; rise?: number; set?: number; minute: number; polar?: 'day' | 'night' }[] = [
  { name: 'pre-dawn 05:10', rise: 342, set: 1051, minute: 310 },
  { name: 'morning 09:41', rise: 342, set: 1051, minute: 581 },
  { name: 'noon 12:00', rise: 342, set: 1051, minute: 720 },
  { name: 'sunset 17:20', rise: 342, set: 1051, minute: 1040 },
  { name: 'night 22:30', rise: 342, set: 1051, minute: 1350 },
  { name: 'polar day 12:00', rise: 0, set: 0, minute: 720, polar: 'day' },
  { name: 'polar night 12:00', rise: 0, set: 0, minute: 720, polar: 'night' },
  { name: 'no forecast 10:00', minute: 600 }
]

// Timeline cases (&case=a..p). Fixed clock 10:42 today; made-up events only.
const D = new Date()
const at = (h: number, m: number, dayOff = 0): number => new Date(D.getFullYear(), D.getMonth(), D.getDate() + dayOff, h, m).getTime()
const ev = (title: string, s: number, e: number, location = '', allDay = false): CalEvent => ({ title, start: s, end: e, allDay, location })
const T = (text: string, done = false): Todo => ({ id: text, text, done })
const NOW = at(10, 42)
const live = ev('Design review', at(10, 0), at(11, 0), 'Room 204')
const next = ev('Planning sync', at(14, 31), at(15, 0), 'Studio B')
const pastA = ev('Standup', at(9, 0), at(9, 15))
const pastB = ev('Coffee chat', at(9, 30), at(10, 0))
const tom = [
  ev('Offsite', at(0, 0, 1), at(0, 0, 2), '', true),
  ev('Hiring loop', at(9, 0, 1), at(10, 0, 1), 'Room 12'),
  ev('Retro', at(13, 0, 1), at(14, 0, 1)),
  ev('Dropped', at(15, 0, 1), at(16, 0, 1))
]
const two = [T('Reply to the vendor'), T('Book the venue')]
const LAB: Record<string, { cal: CalState; events: CalEvent[]; todos: Todo[]; now?: number; todosError?: boolean }> = {
  a: { cal: 'ok', events: [live, next], todos: two },
  b: { cal: 'ok', events: [pastA, pastB, live, next, ev('Budget check', at(15, 30), at(16, 0)), ev('Demo prep', at(16, 30), at(17, 0), 'Lab'), ev('Wrap up', at(17, 30), at(18, 0)), ...tom], todos: [...two, T('Send notes'), T('Old task', true)] },
  c: { cal: 'ok', events: [live, ev('Vendor call', at(10, 30), at(10, 50), 'Call'), next], todos: two },
  d: { cal: 'ok', events: [ev('Quick check-in', at(10, 30), at(10, 42) + 30000), next], todos: two, now: NOW + 5000 },
  e: { cal: 'off', events: [], todos: two },
  f: { cal: 'error', events: [], todos: two },
  g: { cal: 'ok', events: [], todos: two },
  h: { cal: 'loading', events: [], todos: two },
  i: { cal: 'ok', events: [live, next], todos: [] },
  j: { cal: 'ok', events: [live, next], todos: [T('Reply to the vendor', true), T('Book the venue', true)] },
  k: { cal: 'ok', events: [next, ...tom.slice(0, 3)], todos: two },
  l: { cal: 'ok', events: [ev('Public holiday', at(0, 0), at(0, 0, 1), '', true), ev('Team offsite', at(0, 0), at(0, 0, 1), '', true), live, next, ...tom.slice(0, 1)], todos: two },
  m: { cal: 'ok', events: [pastA, next, ev('Budget check', at(15, 30), at(16, 0))], todos: two },
  n: {
    cal: 'ok',
    events: [
      ev('A very long review of the quarterly roadmap and the hiring plan with everyone', at(10, 0), at(11, 0), 'The big conference room on the fourth floor of the west building'),
      ev('An equally long planning session that never seems to end on time', at(14, 31), at(15, 0), 'Another very long location name for the studio')
    ],
    todos: [T('A very long to-do that goes on and on past the edge of the panel for sure')]
  },
  o: { cal: 'ok', events: [live, next], todos: [], todosError: true },
  p: { cal: 'ok', events: [live, next], todos: [T('One'), T('Two'), T('Three'), T('Four'), T('Five'), T('Six'), T('Seven'), T('Eight', true)] }
}

function TimelineLab({ id }: { id: string }): React.JSX.Element {
  const c = LAB[id] ?? LAB.a
  const [todos, setTodos] = useState(c.todos)
  return (
    <div className="body" style={{ width: 480, boxSizing: 'border-box', padding: '0 20px' }}>
      <div style={{ height: 266, display: 'flex', flexDirection: 'column', outline: '1px dashed #222' }}>
        <TodayTimeline
          events={c.cal === 'loading' ? null : c.events}
          calState={c.cal}
          todos={todos}
          todosError={!!c.todosError}
          minuteKey={Math.floor((c.now ?? NOW) / 60000)}
          onToggle={(i) => setTodos((l) => l.map((t) => (t.id === i ? { ...t, done: !t.done } : t)))}
          onRemove={(i) => setTodos((l) => l.filter((t) => t.id !== i))}
          onOpenTools={() => undefined}
        />
      </div>
    </div>
  )
}

// F4: Focus pill states (&focus) and Tools drawer cases (&tools=empty|laps|three|max|long).
const stub = (status: TimerStatus, remainingMs: number): FocusTimer => ({ status, totalMs: 25 * 60000, remainingMs, start: () => undefined, pause: () => undefined, reset: () => undefined })
const PILLS: [string, FocusTimer][] = [
  ['idle', stub('idle', 25 * 60000)],
  ['running', stub('running', 14 * 60000 + 12000)],
  ['paused', stub('paused', 6 * 60000 + 3000)],
  ['done', stub('done', 0)]
]

function ToolsLab({ id }: { id: string }): React.JSX.Element {
  const timers = useTimers(() => undefined)
  const [draft, setDraft] = useState(id === 'long' ? 'A very long to-do that goes on and on past the edge of the field for sure, '.repeat(3).slice(0, 200) : '')
  const [len, setLen] = useState(25)
  const [open, setOpen] = useState(true)
  useEffect(() => {
    const n = id === 'max' ? 6 : id === 'three' ? 3 : 0
    for (let i = 0; i < n; i++) timers.add([5, 10, 30, 1, 5, 10][i])
    if (id === 'laps') {
      timers.swToggle()
      window.setTimeout(timers.swLap, 150)
      window.setTimeout(timers.swLap, 300)
      window.setTimeout(timers.swLap, 450)
      window.setTimeout(timers.swToggle, 600)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const pill = id === 'laps' ? PILLS[2][1] : PILLS[0][1]
  return (
    <div className="body" style={{ width: 480, boxSizing: 'border-box', padding: '0 20px' }}>
      <div style={{ height: 266, display: 'flex', flexDirection: 'column', outline: '1px dashed #222' }}>
        {open && (
          <TodayTools id="today-tools" timer={pill} timers={timers} lengthMin={len} onLength={setLen} draft={draft} onDraft={setDraft} onAddTodo={() => setDraft('')} onHold={() => undefined} onClose={() => setOpen(false)} />
        )}
      </div>
      <TodayFocus timer={pill} lengthMin={len} open={open} onToggleTools={() => setOpen((o) => !o)} toolsId="today-tools" />
    </div>
  )
}

function PillLab(): React.JSX.Element {
  return (
    <div className="body" style={{ width: 480, boxSizing: 'border-box', padding: '0 20px 12px' }}>
      {PILLS.map(([n, t]) => (
        <div key={n}>
          <div style={{ font: '10px var(--font)', color: 'var(--muted)', paddingTop: 6 }}>{n}</div>
          <TodayFocus timer={t} lengthMin={25} open={n === 'paused'} onToggleTools={() => undefined} toolsId="today-tools" />
        </div>
      ))}
    </div>
  )
}

export default function TodayLab(): React.JSX.Element {
  const q = new URLSearchParams(location.hash.slice(1))
  const lang = q.get('lang') ?? undefined
  if (q.has('focus')) return <PillLab />
  if (q.has('tools')) return <ToolsLab id={q.get('tools') ?? 'empty'} />
  if (q.has('case')) return <TimelineLab id={q.get('case') ?? 'a'} />
  return (
    <div className="body" style={{ width: 480, overflowY: 'auto' }}>
      {CASES.slice(Number(q.get('from') ?? 0)).map((c) => (
        <div key={c.name} style={{ marginBottom: 6 }}>
          <div style={{ font: '10px var(--font)', color: 'var(--muted)', padding: '2px 0' }}>{c.name}</div>
          <TodaySky rise={c.rise} set={c.set} minute={c.minute} polar={c.polar} locale={lang === 'fil' ? 'fil-PH' : undefined} />
        </div>
      ))}
    </div>
  )
}
