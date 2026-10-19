import { statfs } from 'node:fs/promises'
import { cpus, freemem, totalmem } from 'node:os'

export interface SystemStats {
  cpuPercent: number // 0-100, all cores, averaged since the previous sample
  ramUsedBytes: number
  ramTotalBytes: number
  diskUsedBytes: number // system drive; 0/0 if it can't be read
  diskTotalBytes: number
}

interface CpuSnapshot {
  idle: number
  total: number
  at: number
}

// A snapshot older than this is too stale to average over (the panel was closed meanwhile).
const STALE_MS = 3000
// Gap used to take a fresh delta when there is no recent snapshot.
const WARMUP_MS = 250

let last: CpuSnapshot | null = null

function snapshot(): CpuSnapshot {
  let idle = 0
  let total = 0
  for (const { times } of cpus()) {
    idle += times.idle
    total += times.user + times.nice + times.sys + times.idle + times.irq
  }
  return { idle, total, at: Date.now() }
}

/** CPU% from os.cpus() tick deltas. Stateless between panel opens: a stale baseline is re-measured. */
export async function getStats(): Promise<SystemStats> {
  if (!last || Date.now() - last.at > STALE_MS) {
    last = snapshot()
    await new Promise((r) => setTimeout(r, WARMUP_MS))
  }
  const now = snapshot()
  const dTotal = now.total - last.total
  const dIdle = now.idle - last.idle
  last = now
  const cpuPercent = dTotal > 0 ? Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100)) : 0

  const ramTotalBytes = totalmem()
  const disk = await systemDisk()
  return { cpuPercent, ramUsedBytes: ramTotalBytes - freemem(), ramTotalBytes, ...disk }
}

/** System drive usage. Cheap statfs call; the figure barely moves, so reading it per poll is fine. */
async function systemDisk(): Promise<{ diskUsedBytes: number; diskTotalBytes: number }> {
  try {
    const s = await statfs((process.env.SystemDrive ?? 'C:') + '\\')
    const total = s.blocks * s.bsize
    return { diskUsedBytes: total - s.bavail * s.bsize, diskTotalBytes: total }
  } catch {
    return { diskUsedBytes: 0, diskTotalBytes: 0 }
  }
}
