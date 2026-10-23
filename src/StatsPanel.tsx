import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { SystemStats } from './global'
import { STATS_POLL_MS } from './constants'
import { tr } from './i18n'

const GB = 1024 ** 3

const R = 30
const C = 2 * Math.PI * R

/** A ring that fills with the value; it turns warm past 85%, where it starts to matter. */
function Gauge({ label, percent, detail }: { label: string; percent: number; detail: string }): React.JSX.Element {
  const p = Math.max(0, Math.min(100, percent))
  return (
    <div className={p > 85 ? 'gauge hot' : 'gauge'}>
      <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r={R} className="gauge-bg" />
        <motion.circle
          cx="38"
          cy="38"
          r={R}
          className="gauge-fg"
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: C * (1 - p / 100) }}
          transition={{ type: 'spring', stiffness: 160, damping: 28 }}
          transform="rotate(-90 38 38)"
        />
      </svg>
      <span className="gauge-pct">{Math.round(p)}%</span>
      <span className="gauge-label">{label}</span>
      <span className="gauge-detail">{detail}</span>
    </div>
  )
}

/** Mounted only while the System tab is visible in an expanded notch, so polling stops on unmount. */
export default function StatsPanel(): React.JSX.Element {
  const [stats, setStats] = useState<SystemStats | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const tick = async (): Promise<void> => {
      try {
        const s = await window.overlay.getStats()
        if (!cancelled) setStats(s)
      } catch {
        // Main refused or the window is closing; keep the last value and try again.
      }
      if (!cancelled) timer = window.setTimeout(tick, STATS_POLL_MS)
    }
    tick()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  if (!stats) return <div className="body body-center muted">{tr('Measuring…')}</div>

  const ramPercent = (stats.ramUsedBytes / stats.ramTotalBytes) * 100
  return (
    <div className="body stats">
      <Gauge label={tr('CPU')} percent={stats.cpuPercent} detail="Processor" />
      <Gauge
        label={tr('Memory')}
        percent={ramPercent}
        detail={tr('{0} of {1} GB', (stats.ramUsedBytes / GB).toFixed(1), (stats.ramTotalBytes / GB).toFixed(0))}
      />
      {stats.diskTotalBytes > 0 && (
        <Gauge
          label={tr('Disk')}
          percent={(stats.diskUsedBytes / stats.diskTotalBytes) * 100}
          detail={tr('{0} GB free', ((stats.diskTotalBytes - stats.diskUsedBytes) / GB).toFixed(0))}
        />
      )}
    </div>
  )
}
