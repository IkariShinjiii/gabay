import { net } from 'electron'

// Synced lyrics from LRCLIB (free, open, no key). Off unless turned on in Settings, because it sends the song's title,
// artist and length to lrclib.net. Results are cached for the session.

export interface LyricLine {
  t: number // seconds from the start
  text: string
}

const cache = new Map<string, LyricLine[] | null>()

function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const line of lrc.split(/\r?\n/)) {
    const text = line.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text })
  }
  return out.sort((a, b) => a.t - b.t).slice(0, 2000)
}

export async function getLyrics(title: unknown, artist: unknown, duration: unknown): Promise<LyricLine[] | null> {
  if (typeof title !== 'string' || typeof artist !== 'string' || !title.trim()) return null
  const t = title.trim().slice(0, 200)
  const a = artist.trim().slice(0, 200)
  const d = typeof duration === 'number' && duration > 0 ? Math.round(duration) : 0
  const key = `${t}|${a}|${d}`
  if (cache.has(key)) return cache.get(key) ?? null
  const q = new URLSearchParams({ track_name: t, artist_name: a, ...(d ? { duration: String(d) } : {}) })
  try {
    const res = await net.fetch(`https://lrclib.net/api/get?${q}`, {
      headers: { 'User-Agent': 'Gabay (https://github.com/IkariShinjiii/gabay)' },
      signal: AbortSignal.timeout(10_000)
    })
    const r = res.ok ? ((await res.json()) as { syncedLyrics?: unknown }) : null
    const lines = typeof r?.syncedLyrics === 'string' ? parseLrc(r.syncedLyrics) : null
    cache.set(key, lines && lines.length ? lines : null)
    return cache.get(key) ?? null
  } catch {
    return null // network trouble: try again next time
  }
}
