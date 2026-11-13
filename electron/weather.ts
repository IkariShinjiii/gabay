import { net } from 'electron'

// Weather from Open-Meteo (free, no key, no account). Only the city you type (to find it) and its coordinates (for the
// forecast) are sent; nothing identifies you. Refreshed at most every 20 minutes.

export interface Place {
  name: string
  lat: number
  lon: number
}

export interface Weather {
  place: string
  temp: number
  code: number // WMO weather code
  day: boolean
  high: number
  low: number
  /** Sunrise and sunset, minutes since midnight on this PC's clock, the clock the day strip is drawn on (absent if the forecast omits them). */
  rise?: number
  set?: number
  at: number
}

const REFRESH_MS = 20 * 60_000
let cache: { key: string; w: Weather } | null = null

/** City name -> first match. */
export async function findPlace(query: unknown): Promise<Place | null> {
  if (typeof query !== 'string' || !query.trim() || query.length > 100) return null
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(query.trim())}`
  try {
    const res = await net.fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const r = (await res.json()) as { results?: { name?: string; country?: string; admin1?: string; latitude?: number; longitude?: number }[] }
    const p = r.results?.[0]
    if (!p || typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return null
    return { name: [p.name, p.country].filter(Boolean).join(', ').slice(0, 80), lat: p.latitude, lon: p.longitude }
  } catch {
    return null
  }
}

/** "2026-11-14T05:42" in the place's clock (offset from Open-Meteo) -> minutes since midnight on this PC's clock, or undefined. */
function clockMinutes(iso: unknown, offsetSec: number): number | undefined {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso) : null
  if (!m) return undefined
  const at = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - offsetSec * 1000)
  return at.getHours() * 60 + at.getMinutes()
}

export async function getWeather(place: Place | null): Promise<Weather | null> {
  if (!place) return null
  const key = `${place.lat},${place.lon}`
  const same = cache && cache.key === key ? cache.w : null // never show another place's weather
  if (same && Date.now() - same.at < REFRESH_MS) return same
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
    '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=1'
  try {
    const res = await net.fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return same
    const r = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number; is_day?: number }
      daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; sunrise?: string[]; sunset?: string[] }
      utc_offset_seconds?: number // the place's offset from UTC, for the sun times
    }
    // Without an offset in the answer, assume the place is on this PC's clock.
    const offset = typeof r.utc_offset_seconds === 'number' ? r.utc_offset_seconds : -new Date().getTimezoneOffset() * 60
    if (typeof r.current?.temperature_2m !== 'number') return same
    const w: Weather = {
      place: place.name,
      temp: Math.round(r.current.temperature_2m),
      code: Number(r.current.weather_code) || 0,
      day: r.current.is_day !== 0,
      high: Math.round(r.daily?.temperature_2m_max?.[0] ?? r.current.temperature_2m),
      low: Math.round(r.daily?.temperature_2m_min?.[0] ?? r.current.temperature_2m),
      rise: clockMinutes(r.daily?.sunrise?.[0], offset),
      set: clockMinutes(r.daily?.sunset?.[0], offset),
      at: Date.now()
    }
    cache = { key, w }
    return w
  } catch {
    return same
  }
}
