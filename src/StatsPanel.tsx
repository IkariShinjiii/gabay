import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { SystemStats } from './global'
import { STATS_POLL_MS } from './constants'

const GB = 1024 ** 3

function Gauge({ label, percent, detail }: { label: string; percent: number; detail: string }): React.JSX.Element {
  return (
    <div className="gauge">
      <div className="gauge-head">
        <span>{label}</span>
        <span className="gauge-detail">{detail}</span>
      </div>
      <div className="gauge-track">
        <motion.div
          className="gauge-fill"
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ type: 'spring', stiffness: 220, damping: 30 }}
        />
      </div>
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

  if (!stats) return <div className="body body-center">Measuring…</div>

  const ramPercent = (stats.ramUsedBytes / stats.ramTotalBytes) * 100
  return (
    <div className="body stats">
      <Gauge label="CPU" percent={stats.cpuPercent} detail={`${stats.cpuPercent.toFixed(0)}%`} />
      <Gauge
        label="RAM"
        percent={ramPercent}
        detail={`${(stats.ramUsedBytes / GB).toFixed(1)} / ${(stats.ramTotalBytes / GB).toFixed(1)} GB`}
      />
    </div>
  )
}
