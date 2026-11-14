import type { CalEvent, Todo, Weather } from './global'
import type { FocusTimer, TimerStatus } from './useFocusTimer'

// Dev preview only (GABAY_PREVIEW=Today&at=10:42&wx=day&cal=live&todos=2&focus=running&tools).
// Electron main sets the hash only when it is not packaged, so in a release every function here returns null and nothing changes.
export type DevCal = { connected: boolean; events: CalEvent[]; error: boolean } | 'loading'

export const devQuery = (): URLSearchParams | null => {
  const q = new URLSearchParams(location.hash.slice(1))
  return q.has('preview') ? q : null
}

export function devNow(q: URLSearchParams | null): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(q?.get('at') ?? '')
  if (!m) return null
  const d = new Date()
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return d
}

/** undefined = no flag (use the real weather), null = no weather. */
export function devWeather(v: string | null | undefined): Weather | null | undefined {
  if (!v) return undefined
  if (v === 'none') return null
  const base = { place: 'Iloilo City', temp: 31, code: 2, day: true, high: 33, low: 26, at: 0 }
  if (v === 'polar-day') return { ...base, rise: 0, set: 0 }
  if (v === 'polar-night') return { ...base, day: false, rise: 0, set: 0 }
  return { ...base, day: v === 'day', rise: 342, set: 1051 }
}

export function devCal(v: string | null | undefined, now: Date): DevCal | undefined {
  if (!v) return undefined
  if (v === 'loading' || v === 'off' || v === 'error') return v === 'loading' ? v : { connected: v === 'error', events: [], error: v === 'error' }
  const at = (h: number, m: number, d = 0): number => new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, m).getTime()
  const e = (title: string, s: number, en: number, location = '', allDay = false): CalEvent => ({ title, start: s, end: en, allDay, location })
  const h = now.getHours()
  const live = e('Design review', at(h, 0), at(h + 1, 0), 'Room 204')
  const next = e('Planning sync', at(h + 3, 31), at(h + 4, 0), 'Studio B')
  const tom = [e('Hiring loop', at(9, 0, 1), at(10, 0, 1), 'Room 12'), e('Retro', at(13, 0, 1), at(14, 0, 1))]
  let events: CalEvent[] = [live, next]
  if (v === 'rows') events = [e('Standup', at(h - 2, 0), at(h - 1, 45)), live, next, e('Budget check', at(h + 5, 30), at(h + 6, 0)), e('Demo prep', at(h + 6, 30), at(h + 7, 0), 'Lab'), ...tom]
  if (v === 'overlap') events = [live, e('Vendor call', at(h, 30), at(h, 50), 'Call'), next]
  if (v === 'empty') events = []
  if (v === 'tomorrow') events = [next, e('Offsite', at(0, 0, 1), at(0, 0, 2), '', true), ...tom]
  if (v === 'long') events = [e('A very long review of the quarterly roadmap and the hiring plan with everyone', at(h, 0), at(h + 1, 0), 'The big conference room on the fourth floor of the west building'), e('An equally long planning session that never seems to end on time', at(h + 3, 31), at(h + 4, 0), 'Another very long location name for the studio')]
  return { connected: true, events, error: false }
}

export function devTodos(v: string | null | undefined): Todo[] | undefined {
  if (!v) return undefined
  const t = (text: string, done = false): Todo => ({ id: text, text, done })
  if (v === '0') return []
  if (v === 'done') return [t('Reply to the vendor', true), t('Book the venue', true)]
  if (v === 'long') return [t('A very long to-do that goes on and on past the edge of the panel for sure')]
  if (v === 'many') return ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'].map((x) => t(x)).concat(t('Eight', true))
  return [t('Reply to the vendor'), t('Book the venue')]
}

/** Stub pill states; the real timer is used when the flag is absent. */
export function devTimer(v: string | null | undefined, real: FocusTimer): FocusTimer {
  const s: Record<string, [TimerStatus, number]> = { idle: ['idle', 25 * 60000], running: ['running', 14 * 60000 + 12000], paused: ['paused', 6 * 60000 + 3000], done: ['done', 0] }
  const x = v ? s[v] : undefined
  return x ? { ...real, status: x[0], totalMs: 25 * 60000, remainingMs: x[1] } : real
}
