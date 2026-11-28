import { useEffect, useRef, useState } from 'react'
import type { ShinjiReply, ShinjiResult, ShinjiUsage } from './global'
import { tr } from './i18n'
import Skeleton from './Skeleton'
import { hexState, type HexState } from './shinjiState'

// The three router tiers of Shinji OS, as the hexes. Names and notes live here so the look can be re-themed in one place.
const UNITS = [
  { name: 'Reflex', note: 'No AI' },
  { name: 'Fast', note: 'Quick answers' },
  { name: 'Agent', note: 'Claude Code' }
] as const

const STATUS_POLL_MS = 2000
const USAGE_POLL_MS = 60_000
const HEX = (cx: number, cy: number, r: number): string =>
  [0, 1, 2, 3, 4, 5].map((i) => `${(cx + r * Math.sin((i * Math.PI) / 3)).toFixed(1)},${(cy - r * Math.cos((i * Math.PI) / 3)).toFixed(1)}`).join(' ')

const fmt = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n))

/** What the hexes and the status line show, from the console's reply. */
function view(r: ShinjiResult): { label: string; cls: HexState['cls']; tier: HexState['tier']; line: string } {
  const { cls, tier } = hexState(r)
  if (r.state === 'locked') return { label: tr('Locked'), cls, tier, line: tr('Shinji OS needs a license key. Open the console to activate it.') }
  if (r.state === 'offline') return { label: tr('Offline'), cls, tier, line: tr('Shinji OS is not running. Start it from its desktop shortcut.') }
  if (r.state === 'busy') return { label: tr('Busy'), cls, tier, line: tr('Shinji OS is busy with a request.') }
  const unit = tier ? tr(UNITS[tier - 1].name) : ''
  if (cls === 'work') return { label: tr('Working'), cls, tier, line: tr('{0} is working on it…', unit || 'Shinji') }
  if (cls === 'done') return { label: tr('Done'), cls, tier, line: tr('{0} finished.', unit || 'Shinji') }
  if (cls === 'fail') return { label: tr('Failed'), cls, tier, line: tr('{0} could not finish. Try again.', unit || 'Shinji') }
  return { label: tr('Ready'), cls, tier, line: tr('Waiting for a request.') }
}

/** Mounted only while the Shinji tab is visible in an expanded notch, so polling stops on unmount. */
export default function ShinjiPanel(): React.JSX.Element {
  const [res, setRes] = useState<ShinjiResult | null>(null)
  const [usage, setUsage] = useState<ShinjiUsage | null>(null)
  const [q, setQ] = useState('')
  const [asking, setAsking] = useState(false)
  const [reply, setReply] = useState<ShinjiReply | 'none' | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    let status: number | undefined
    let use: number | undefined
    const tickStatus = async (): Promise<void> => {
      const r = await window.overlay.shinjiStatus().catch(() => null)
      if (alive.current && r) setRes(r)
      if (alive.current) status = window.setTimeout(tickStatus, STATUS_POLL_MS)
    }
    const tickUsage = async (): Promise<void> => {
      const u = await window.overlay.shinjiUsage().catch(() => null)
      if (alive.current) setUsage(u)
      if (alive.current) use = window.setTimeout(tickUsage, USAGE_POLL_MS)
    }
    void tickStatus()
    void tickUsage()
    return () => {
      alive.current = false
      window.clearTimeout(status)
      window.clearTimeout(use)
    }
  }, [])

  if (!res) return <Skeleton kind="stats" />

  const v = view(res)
  const s = res.state === 'ok' ? res.status : null
  const max = Math.max(...(usage?.days ?? [0]), 1)

  const ask = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const text = q.trim()
    if (!text || asking) return
    setAsking(true)
    setReply(null)
    const r = await window.overlay.shinjiAsk(text).catch(() => null)
    if (!alive.current) return
    setReply(r ?? 'none')
    setAsking(false)
    if (r) setQ('')
  }

  return (
    <div className="body shinji">
      <div className="sh-head">
        <span className="sh-title">Shinji OS</span>
        <span className={`sh-state ${v.cls}`} role="status">{v.label}</span>
      </div>

      <svg className="sh-hexes" viewBox="0 0 300 96" role="img" aria-label={v.line}>
        {UNITS.map((u, i) => {
          const on = v.tier === i + 1
          const cls = v.cls === 'off' ? 'off' : v.tier === null ? (v.cls === 'idle' ? '' : v.cls) : on ? v.cls : 'dim'
          return (
            <g key={u.name} className={`sh-hex ${cls}`}>
              <polygon points={HEX(50 + i * 100, 36, 30)} />
              <text x={50 + i * 100} y="42" textAnchor="middle" className="sh-num">{on && v.cls === 'work' ? '…' : v.cls === 'off' ? '–' : i + 1}</text>
              <text x={50 + i * 100} y="82" textAnchor="middle" className="sh-name">{tr(u.name)}</text>
              <text x={50 + i * 100} y="94" textAnchor="middle" className="sh-note">{tr(u.note)}</text>
            </g>
          )
        })}
      </svg>
      <p className="sh-line">{v.line}</p>

      {s && (
        <div className="sh-counts">
          <span><b>{s.repos}</b>{tr('Repos')}</span>
          <span><b>{s.uncommitted}</b>{tr('Uncommitted')}</span>
          <span><b>{s.prs}</b>{tr('Open PRs')}</span>
        </div>
      )}

      {usage && (
        <div className="sh-usage">
          <div className="sh-usage-head"><span>{tr('Claude usage, 7 days')}</span><b>{fmt(usage.total)}</b></div>
          <div className="sh-bars" role="img" aria-label={usage.days.map((d) => fmt(d)).join(', ')}>
            {usage.days.map((d, i) => <span key={i} style={{ height: `${Math.max((d / max) * 100, 4)}%` }} className={i === usage.days.length - 1 ? 'last' : ''} />)}
          </div>
          <span className="sh-fine">{tr('Local tokens, not the official limit.')}</span>
        </div>
      )}

      <form className="sh-ask" onSubmit={ask}>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} aria-label={tr('Ask Shinji')} placeholder={tr('Ask Shinji…')} disabled={res.state === 'offline' || res.state === 'locked'} />
        <button type="submit" disabled={asking || !q.trim() || res.state === 'offline' || res.state === 'locked'}>{asking ? tr('Asking…') : tr('Ask')}</button>
      </form>
      {reply && (
        <p className="sh-reply" role="status">
          {reply === 'none' ? tr('No answer. Is Shinji OS running?') : <>{reply.tier ? <span className="sh-tier">{tr(UNITS[reply.tier - 1].name)}</span> : null}{reply.reply}</>}
        </p>
      )}

      <button type="button" className="sh-open" disabled={res.state === 'offline'} onClick={() => void window.overlay.shinjiOpen()}>{tr('Open console')} ↗</button>
    </div>
  )
}
