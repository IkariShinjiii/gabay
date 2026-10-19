import { useCallback, useEffect, useState } from 'react'

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

export interface FocusTimer {
  status: TimerStatus
  totalMs: number
  remainingMs: number
  /** idle/done: start fresh (optionally with a new length); paused: resume; running: no-op. */
  start: (minutes?: number) => void
  pause: () => void
  reset: () => void
}

const DEFAULT_MS = 25 * 60_000
const TICK_MS = 500

interface State {
  status: TimerStatus
  totalMs: number
  frozenMs: number // remaining time while not running
  endAt: number // wall-clock end while running
}

/**
 * Focus countdown. Wall-clock based (endAt), so it can't drift or stall if the page is throttled.
 * The 500 ms render tick exists only while the timer is running; an idle timer does no work.
 */
export function useFocusTimer(): FocusTimer {
  const [s, setS] = useState<State>({ status: 'idle', totalMs: DEFAULT_MS, frozenMs: DEFAULT_MS, endAt: 0 })
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (s.status !== 'running') return
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= s.endAt) setS((p) => (p.status === 'running' ? { ...p, status: 'done', frozenMs: 0 } : p))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [s.status, s.endAt])

  const start = useCallback((minutes?: number): void => {
    setS((p) => {
      if (p.status === 'running') return p
      const t = Date.now()
      if (p.status === 'paused' && minutes === undefined) return { ...p, status: 'running', endAt: t + p.frozenMs }
      const total = minutes !== undefined ? Math.max(1, Math.min(180, Math.round(minutes))) * 60_000 : p.totalMs
      return { status: 'running', totalMs: total, frozenMs: total, endAt: t + total }
    })
    setNow(Date.now())
  }, [])

  const pause = useCallback((): void => {
    setS((p) => (p.status === 'running' ? { ...p, status: 'paused', frozenMs: Math.max(0, p.endAt - Date.now()) } : p))
  }, [])

  const reset = useCallback((): void => {
    setS((p) => ({ status: 'idle', totalMs: p.totalMs, frozenMs: p.totalMs, endAt: 0 }))
  }, [])

  const remainingMs = s.status === 'running' ? Math.max(0, s.endAt - now) : s.frozenMs
  return { status: s.status, totalMs: s.totalMs, remainingMs, start, pause, reset }
}

export function formatMs(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
