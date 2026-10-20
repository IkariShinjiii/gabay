import { useCallback, useEffect, useRef, useState } from 'react'

// A stopwatch and any number of countdown timers, next to the focus timer. Wall-clock based like the focus timer, so
// nothing drifts when the page is throttled; the render tick runs only while something is running.

export interface Countdown {
  id: number
  label: string
  totalMs: number
  /** Wall-clock end while running; null while paused. */
  endAt: number | null
  /** Remaining time while paused. */
  leftMs: number
}

export interface Stopwatch {
  running: boolean
  /** Elapsed before the current run. */
  baseMs: number
  since: number | null
  laps: number[]
}

export interface Timers {
  now: number
  countdowns: Countdown[]
  stopwatch: Stopwatch
  elapsedMs: number
  add: (minutes: number) => void
  toggle: (id: number) => void
  remove: (id: number) => void
  swToggle: () => void
  swLap: () => void
  swReset: () => void
}

const TICK_MS = 250
export const MAX_TIMERS = 6

export const leftOf = (c: Countdown, now: number): number => (c.endAt === null ? c.leftMs : Math.max(0, c.endAt - now))

export function formatClock(ms: number, tenths = false): string {
  const t = Math.max(0, ms)
  const h = Math.floor(t / 3_600_000)
  const m = Math.floor((t % 3_600_000) / 60_000)
  const s = Math.floor((t % 60_000) / 1000)
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  return tenths ? `${base}.${Math.floor((t % 1000) / 100)}` : base
}

export function useTimers(onDone: (c: Countdown) => void): Timers {
  const [countdowns, setCountdowns] = useState<Countdown[]>([])
  const [stopwatch, setStopwatch] = useState<Stopwatch>({ running: false, baseMs: 0, since: null, laps: [] })
  const [now, setNow] = useState(() => Date.now())
  const nextId = useRef(1)
  const done = useRef(onDone)
  done.current = onDone

  const latest = useRef(countdowns)
  latest.current = countdowns
  const anyRunning = stopwatch.running || countdowns.some((c) => c.endAt !== null)
  useEffect(() => {
    if (!anyRunning) return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      // Announce finished timers here, once, not inside a state update (React may run those twice).
      const finished = latest.current.filter((c) => c.endAt !== null && c.endAt <= t)
      if (!finished.length) return
      const ids = new Set(finished.map((c) => c.id))
      latest.current = latest.current.filter((c) => !ids.has(c.id))
      setCountdowns((list) => list.filter((c) => !ids.has(c.id)))
      finished.forEach((c) => done.current(c))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [anyRunning])

  const add = useCallback((minutes: number): void => {
    const ms = Math.max(1, Math.min(600, Math.round(minutes))) * 60_000
    setCountdowns((list) =>
      list.length >= MAX_TIMERS
        ? list
        : [...list, { id: nextId.current++, label: `${Math.round(ms / 60_000)} min`, totalMs: ms, endAt: Date.now() + ms, leftMs: ms }]
    )
    setNow(Date.now())
  }, [])

  const toggle = useCallback((id: number): void => {
    const t = Date.now()
    setCountdowns((list) =>
      list.map((c) =>
        c.id !== id ? c : c.endAt === null ? { ...c, endAt: t + c.leftMs } : { ...c, endAt: null, leftMs: Math.max(0, c.endAt - t) }
      )
    )
    setNow(t)
  }, [])

  const remove = useCallback((id: number): void => setCountdowns((list) => list.filter((c) => c.id !== id)), [])

  const swToggle = useCallback((): void => {
    const t = Date.now()
    setStopwatch((s) =>
      s.running ? { ...s, running: false, baseMs: s.baseMs + (t - (s.since ?? t)), since: null } : { ...s, running: true, since: t }
    )
    setNow(t)
  }, [])

  const elapsedMs = stopwatch.baseMs + (stopwatch.running && stopwatch.since !== null ? now - stopwatch.since : 0)

  const swLap = useCallback((): void => {
    const t = Date.now()
    setStopwatch((s) => {
      if (!s.running) return s
      const total = s.baseMs + (t - (s.since ?? t))
      return { ...s, laps: [total, ...s.laps].slice(0, 20) }
    })
  }, [])

  const swReset = useCallback((): void => setStopwatch({ running: false, baseMs: 0, since: null, laps: [] }), [])

  return { now, countdowns, stopwatch, elapsedMs, add, toggle, remove, swToggle, swLap, swReset }
}

/** A short two-note chime, made on the spot (no sound files). */
export function chime(): void {
  try {
    const ctx = new AudioContext()
    const play = (freq: number, at: number): void => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.6)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + at)
      o.stop(ctx.currentTime + at + 0.65)
    }
    play(880, 0)
    play(1318.5, 0.18)
    window.setTimeout(() => void ctx.close(), 1200)
  } catch {
    // No audio device: the toast still shows.
  }
}
