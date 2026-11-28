import type { ShinjiResult } from './global'

/** What the hexes show: which look, and which router tier (1 to 3) is the active one. Shared by the Shinji tab and the collapsed notch. */
export interface HexState {
  cls: 'idle' | 'work' | 'done' | 'fail' | 'off'
  tier: 1 | 2 | 3 | null
}

export function hexState(r: ShinjiResult | null): HexState {
  if (!r || r.state === 'offline') return { cls: 'off', tier: null }
  // The console did not answer in time: it is busy, but we do not know with what.
  if (r.state === 'busy') return { cls: 'work', tier: null }
  const { phase, tier } = r.status
  if (phase === 'thinking') return { cls: 'work', tier }
  if (phase === 'done') return { cls: 'done', tier }
  if (phase === 'failed') return { cls: 'fail', tier }
  return { cls: 'idle', tier: null }
}
