// Shinji OS companion. Shinji OS is a separate local app (a console on this PC); Gabay only reads its small status API.
// The page never calls the console: main fetches the saved loopback address and hands the page a
// small, validated object.

export const SHINJI_DEFAULT_URL = 'http://127.0.0.1:3000'

/** The Shinji OS address, only when it is plain http on this PC with no credentials, path or query. Otherwise null. */
export function loopbackUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 60) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' || (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost')) return null
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return null
    return `http://${u.host}`
  } catch {
    return null
  }
}

export type ShinjiPhase = 'idle' | 'thinking' | 'done' | 'failed'
export interface ShinjiStatus {
  phase: ShinjiPhase
  /** The router tier handling the request: 1 reflex, 2 fast model, 3 agent. */
  tier: 1 | 2 | 3 | null
  skill: string | null
  repos: number
  uncommitted: number
  prs: number
  nodes: number
  links: number
}
/** busy = the console did not answer in time (it is working); offline = nothing is listening; locked = it is running but waits for a license key. */
export type ShinjiResult = { state: 'ok'; status: ShinjiStatus } | { state: 'busy' } | { state: 'offline' } | { state: 'locked' }
export interface ShinjiUsage {
  /** Tokens per day, oldest first, last 7 days. */
  days: number[]
  total: number
}
export interface ShinjiReply {
  reply: string
  tier: 1 | 2 | 3 | null
}

const count = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e12 ? Math.floor(x) : 0)
const tierOf = (x: unknown): 1 | 2 | 3 | null => (x === 1 || x === 2 || x === 3 ? x : null)
const PHASES: readonly string[] = ['idle', 'thinking', 'done', 'failed']

/** Validates the console's /api/status reply (untrusted data). null when it is not the Shinji OS shape. */
export function parseStatus(raw: unknown): ShinjiStatus | null {
  const j = raw as Record<string, unknown> | null
  if (!j || typeof j !== 'object' || j.v !== 1 || j.ok !== true || typeof j.phase !== 'string' || !PHASES.includes(j.phase)) return null
  return {
    phase: j.phase as ShinjiPhase,
    tier: tierOf(j.tier),
    skill: typeof j.skill === 'string' && /^[a-z][a-z-]{0,29}$/.test(j.skill) ? j.skill : null,
    repos: count(j.repos),
    uncommitted: count(j.uncommitted),
    prs: count(j.prs),
    nodes: count(j.nodes),
    links: count(j.links)
  }
}

/** Shinji OS sells with a license: a locked console still answers /api/status, with locked: true. */
export const isLocked = (raw: unknown): boolean => (raw as { locked?: unknown } | null)?.locked === true

/** Validates /api/usage. null when absent (the console is in demo mode) or malformed. */
export function parseUsage(raw: unknown): ShinjiUsage | null {
  const j = raw as { days?: unknown; total?: unknown } | null
  if (!j || typeof j !== 'object' || !Array.isArray(j.days)) return null
  const days = j.days.slice(-7).map((d) => count((d as { tokens?: unknown } | null)?.tokens))
  return { days, total: count(j.total) }
}

export function parseReply(raw: unknown): ShinjiReply | null {
  const j = raw as { reply?: unknown; tier?: unknown } | null
  if (!j || typeof j !== 'object' || typeof j.reply !== 'string') return null
  return { reply: j.reply.slice(0, 1000), tier: tierOf(j.tier) }
}

// redirect:'error' so a reply can never send us off this PC.
const get = (base: string, path: string, ms: number): Promise<Response> => fetch(base + path, { signal: AbortSignal.timeout(ms), redirect: 'error' })

export async function shinjiStatus(base: string): Promise<ShinjiResult> {
  try {
    const r = await get(base, '/api/status', 2500)
    const json: unknown = r.ok ? await r.json() : null
    if (isLocked(json) && parseStatus(json)) return { state: 'locked' }
    const status = parseStatus(json)
    return status ? { state: 'ok', status } : { state: 'offline' }
  } catch (e) {
    return (e as Error).name === 'TimeoutError' ? { state: 'busy' } : { state: 'offline' }
  }
}

export async function shinjiUsage(base: string): Promise<ShinjiUsage | null> {
  try {
    const r = await get(base, '/api/usage', 8000)
    return r.ok ? parseUsage(await r.json()) : null
  } catch {
    return null
  }
}

/** A typed question to the router. The agent tier can take minutes, so the wait is long. */
export async function shinjiAsk(base: string, text: string): Promise<ShinjiReply | null> {
  try {
    const r = await fetch(`${base}/api/voice/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(200_000),
      redirect: 'error'
    })
    return r.ok ? parseReply(await r.json()) : null
  } catch {
    return null
  }
}
