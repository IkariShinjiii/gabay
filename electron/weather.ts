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

export async function getWeather(place: Place | null): Promise<Weather | null> {
  if (!place) return null
  const key = `${place.lat},${place.lon}`
  if (cache && cache.key === key && Date.now() - cache.w.at < REFRESH_MS) return cache.w
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
    '&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1'
  try {
    const res = await net.fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return cache?.w ?? null
    const r = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number; is_day?: number }
      daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] }
    }
    if (typeof r.current?.temperature_2m !== 'number') return cache?.w ?? null
    const w: Weather = {
      place: place.name,
      temp: Math.round(r.current.temperature_2m),
      code: Number(r.current.weather_code) || 0,
      day: r.current.is_day !== 0,
      high: Math.round(r.daily?.temperature_2m_max?.[0] ?? r.current.temperature_2m),
      low: Math.round(r.daily?.temperature_2m_min?.[0] ?? r.current.temperature_2m),
      at: Date.now()
    }
    cache = { key, w }
    return w
  } catch {
    return cache?.w ?? null
  }
}
