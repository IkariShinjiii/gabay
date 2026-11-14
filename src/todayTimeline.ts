import type { CalEvent, Todo } from './global'

// Pure row model for the Today timeline. No tr() here: the component words the rows.

export const time = (t: number, locale?: string): string =>
  new Date(t).toLocaleTimeString(locale ?? [], { hour: 'numeric', minute: '2-digit' })

export interface TimelineEvent extends CalEvent {
  /** Another event is the primary Now card; this one is live too. */
  live?: boolean
}

export interface Timeline {
  allDay: CalEvent[]
  hiddenAllDay: number
  past: CalEvent[]
  now: CalEvent | null
  upcoming: TimelineEvent[]
  tomorrowAllDay: CalEvent[]
  tomorrow: CalEvent[]
  tasks: Todo[]
  hiddenTasks: number
  openCount: number
}

const CAP_ALL_DAY = 3
const CAP_PAST = 2
const CAP_TOMORROW = 3
const CAP_TASKS = 6

/** Whole minutes left, rounded up, never negative. */
export const minutesLeft = (e: CalEvent, now: number): number => Math.max(0, Math.ceil((e.end - now) / 60000))

/** True when less than a minute is left (the card says "Under a minute left"). */
export const underMinute = (e: CalEvent, now: number): boolean => e.end - now < 60000

/** Time until start as hours and minutes; minutes floor, but the whole is never under 1m. */
export function inParts(e: CalEvent, now: number): { h: number; m: number } {
  const total = Math.max(1, Math.floor((e.start - now) / 60000))
  return { h: Math.floor(total / 60), m: total % 60 }
}

/** 0..1 share of the event already past. Bad data (no length) is 0. */
export function progress(e: CalEvent, now: number): number {
  const len = e.end - e.start
  return len > 0 ? Math.min(1, Math.max(0, (now - e.start) / len)) : 0
}

export function buildTimeline(events: CalEvent[], now: number, todos: Todo[]): Timeline {
  const d = new Date(now)
  const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const tomorrowStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  const afterTomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2).getTime()

  // Missing or backwards end = point event.
  const evs = events
    .map((e) => (e.end > e.start ? e : { ...e, end: e.start }))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const allDay: CalEvent[] = []
  const tomorrowAllDay: CalEvent[] = []
  const timedToday: CalEvent[] = []
  const tomorrowTimed: CalEvent[] = []
  for (const e of evs) {
    if (e.start >= tomorrowStart) {
      if (e.start >= afterTomorrow) continue
      ;(e.allDay ? tomorrowAllDay : tomorrowTimed).push(e)
    } else if (e.allDay) {
      if (e.end > todayStart || e.end === e.start) allDay.push(e)
    } else if (e.end > todayStart || e.start >= todayStart) {
      timedToday.push(e)
    }
  }

  const live = timedToday.filter((e) => e.start <= now && e.end > now)
  const primary = live.reduce<CalEvent | null>((best, e) => (!best || e.end < best.end ? e : best), null)
  const past = timedToday.filter((e) => e.end <= now).slice(-CAP_PAST)
  const upcoming: TimelineEvent[] = timedToday
    .filter((e) => e !== primary && (e.start > now || (e.start <= now && e.end > now)))
    .map((e) => (e.start <= now ? { ...e, live: true } : e))

  const tomorrowRows = [...tomorrowAllDay, ...tomorrowTimed].slice(0, CAP_TOMORROW)
  const open = todos.filter((t) => !t.done)
  const ordered = [...open, ...todos.filter((t) => t.done)]

  return {
    allDay: allDay.slice(0, CAP_ALL_DAY),
    hiddenAllDay: Math.max(0, allDay.length - CAP_ALL_DAY),
    past,
    now: primary,
    upcoming,
    tomorrowAllDay: tomorrowRows.filter((e) => e.allDay),
    tomorrow: tomorrowRows.filter((e) => !e.allDay),
    tasks: ordered.slice(0, CAP_TASKS),
    hiddenTasks: Math.max(0, ordered.length - CAP_TASKS),
    openCount: open.length
  }
}
