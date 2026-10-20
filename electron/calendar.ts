import { app, net, safeStorage } from 'electron'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Calendar from a private iCal address (Google Calendar: Settings > your calendar > "Secret address in iCal format").
// The address is a secret, so it is stored encrypted with Windows' DPAPI (Electron safeStorage) and never sent to the
// renderer. Only titles, times and locations of the next day's events leave this file.

export interface CalEvent {
  title: string
  start: number // epoch ms
  end: number
  allDay: boolean
  location: string
}

const file = (): string => join(app.getPath('userData'), 'calendar.bin')
const REFRESH_MS = 10 * 60_000
let cache: { at: number; events: CalEvent[] } | null = null
let urlCache: string | null | undefined

async function getUrl(): Promise<string | null> {
  if (urlCache !== undefined) return urlCache
  try {
    urlCache = safeStorage.decryptString(await readFile(file()))
  } catch {
    urlCache = null
  }
  return urlCache
}

export async function hasCalendar(): Promise<boolean> {
  return (await getUrl()) !== null
}

/** Saves (or with an empty string, forgets) the iCal address. Only https addresses are accepted. */
export async function setCalendarUrl(raw: unknown): Promise<boolean> {
  if (typeof raw !== 'string' || raw.length > 2000) return false
  const url = raw.trim().replace(/^webcal:\/\//i, 'https://')
  cache = null
  if (!url) {
    urlCache = null
    await rm(file(), { force: true })
    return true
  }
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || !safeStorage.isEncryptionAvailable()) return false
  await writeFile(file(), safeStorage.encryptString(u.toString()))
  urlCache = u.toString()
  return true
}

// ---------- iCal parsing ----------

const unfold = (text: string): string[] => text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)

/** Offset of `tz` from UTC at a given instant, in ms. */
function tzOffset(at: number, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(new Date(at))
    const g = (t: string): number => Number(parts.find((p) => p.type === t)?.value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - at
  } catch {
    return -new Date(at).getTimezoneOffset() * 60_000 // unknown zone: treat as local
  }
}

/** A DTSTART/DTEND value with its params -> epoch ms. */
function parseDate(value: string, params: string): { t: number; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]]
  if (m[4] === undefined) return { t: new Date(y, mo, d).getTime(), allDay: true }
  const [h, mi, s] = [+m[4], +m[5], +m[6]]
  if (m[7]) return { t: Date.UTC(y, mo, d, h, mi, s), allDay: false }
  const tz = /TZID=([^;:]+)/.exec(params)?.[1]
  if (!tz) return { t: new Date(y, mo, d, h, mi, s).getTime(), allDay: false }
  const guess = Date.UTC(y, mo, d, h, mi, s)
  return { t: guess - tzOffset(guess, tz), allDay: false }
}

interface RawEvent {
  uid: string
  title: string
  location: string
  start: number
  end: number
  allDay: boolean
  rrule: string | null
  exdates: Set<number>
  recurrenceId: number | null
  cancelled: boolean
}

function parseIcs(text: string): RawEvent[] {
  const out: RawEvent[] = []
  let cur: Partial<RawEvent> & { exdates?: Set<number> } | null = null
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = { exdates: new Set(), rrule: null, recurrenceId: null, title: '', location: '', uid: '', cancelled: false }
      continue
    }
    if (!cur) continue
    if (line === 'END:VEVENT') {
      if (cur.start !== undefined) {
        const end = cur.end ?? cur.start + (cur.allDay ? 86_400_000 : 3_600_000)
        out.push({ ...(cur as RawEvent), end })
      }
      cur = null
      continue
    }
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const head = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const semi = head.indexOf(';')
    const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase()
    const params = semi < 0 ? '' : head.slice(semi + 1)
    const text2 = (): string => value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').slice(0, 200)
    if (name === 'SUMMARY') cur.title = text2()
    else if (name === 'LOCATION') cur.location = text2()
    else if (name === 'UID') cur.uid = value
    else if (name === 'STATUS') cur.cancelled = /cancelled/i.test(value)
    else if (name === 'RRULE') cur.rrule = value
    else if (name === 'DTSTART' || name === 'DTEND' || name === 'RECURRENCE-ID') {
      const d = parseDate(value, params)
      if (!d) continue
      if (name === 'DTSTART') {
        cur.start = d.t
        cur.allDay = d.allDay
      } else if (name === 'DTEND') cur.end = d.t
      else cur.recurrenceId = d.t
    } else if (name === 'EXDATE') {
      for (const v of value.split(',')) {
        const d = parseDate(v, params)
        if (d) cur.exdates?.add(d.t)
      }
    }
  }
  return out
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** Occurrence starts of a recurring event that fall inside [from, to). Covers the common rules; others yield none. */
function expand(e: RawEvent, from: number, to: number): number[] {
  const rule = Object.fromEntries(
    (e.rrule ?? '').split(';').map((p) => {
      const [k, v] = p.split('=')
      return [k.toUpperCase(), v ?? '']
    })
  )
  const freq = rule['FREQ']
  const interval = Math.max(1, Number(rule['INTERVAL']) || 1)
  const count = rule['COUNT'] ? Number(rule['COUNT']) : Infinity
  const until = rule['UNTIL'] ? (parseDate(rule['UNTIL'], '')?.t ?? Infinity) : Infinity
  const byDay = rule['BYDAY'] ? rule['BYDAY'].split(',').map((d) => DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0) : []
  const dur = e.end - e.start
  const out: number[] = []
  const first = new Date(e.start)
  let n = 0
  const add = (t: number): boolean => {
    if (t > until || n >= count) return false
    n++
    if (t + dur > from && t < to && !e.exdates.has(t)) out.push(t)
    return t < to
  }
  const at = (base: Date, dayShift = 0): number => {
    const d = new Date(base)
    d.setDate(d.getDate() + dayShift)
    return d.getTime()
  }
  for (let i = 0; i < 20_000; i++) {
    const d = new Date(first)
    if (freq === 'DAILY') d.setDate(first.getDate() + i * interval)
    else if (freq === 'WEEKLY') d.setDate(first.getDate() + i * 7 * interval)
    else if (freq === 'MONTHLY') d.setMonth(first.getMonth() + i * interval)
    else if (freq === 'YEARLY') d.setFullYear(first.getFullYear() + i * interval)
    else return out
    if (freq === 'WEEKLY' && byDay.length) {
      // Each listed weekday of this week, in order, starting from the week of DTSTART.
      const weekStart = at(d, -d.getDay())
      let more = true
      for (const wd of [...byDay].sort((a, b) => a - b)) {
        const t = at(new Date(weekStart), wd)
        if (t < e.start) continue
        if (!add(t)) more = false
        if (!more) break
      }
      if (!more) break
    } else if (!add(d.getTime())) break
  }
  return out
}

async function fetchEvents(): Promise<CalEvent[]> {
  const url = await getUrl()
  if (!url) return []
  const res = await net.fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`calendar ${res.status}`)
  const text = await res.text()
  if (text.length > 8_000_000) throw new Error('calendar too large')
  const raw = parseIcs(text)

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() // start of today
  const to = from + 2 * 86_400_000 // today and tomorrow
  // Moved or edited occurrences come as their own events; the series skips those dates.
  const moved = new Map<string, Set<number>>()
  for (const e of raw) if (e.recurrenceId !== null) (moved.get(e.uid) ?? moved.set(e.uid, new Set()).get(e.uid))?.add(e.recurrenceId)

  const events: CalEvent[] = []
  for (const e of raw) {
    if (e.cancelled) continue
    const starts = e.rrule && e.recurrenceId === null ? expand(e, from, to) : e.end > from && e.start < to ? [e.start] : []
    for (const s of starts) {
      if (e.rrule && moved.get(e.uid)?.has(s)) continue
      events.push({ title: e.title || '(No title)', start: s, end: s + (e.end - e.start), allDay: e.allDay, location: e.location })
    }
  }
  return events.sort((a, b) => a.start - b.start).slice(0, 40)
}

/** Today's and tomorrow's events. Cached for 10 minutes; `connected` is false when no address is set. */
export async function getAgenda(force = false): Promise<{ connected: boolean; events: CalEvent[]; error: boolean }> {
  if (!(await hasCalendar())) return { connected: false, events: [], error: false }
  if (!force && cache && Date.now() - cache.at < REFRESH_MS) return { connected: true, events: cache.events, error: false }
  try {
    cache = { at: Date.now(), events: await fetchEvents() }
    return { connected: true, events: cache.events, error: false }
  } catch {
    return { connected: true, events: cache?.events ?? [], error: true }
  }
}
