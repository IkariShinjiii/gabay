import { useEffect, useState } from 'react'

export interface BatteryInfo {
  /** 0 to 1 */
  level: number
  charging: boolean
}

interface BatteryManager extends EventTarget {
  level: number
  charging: boolean
}

/** Battery from Chromium's Battery Status API: event-driven, so there is no timer and no process behind it. */
export function useBattery(): BatteryInfo | null {
  const [info, setInfo] = useState<BatteryInfo | null>(null)

  useEffect(() => {
    let cleanup: (() => void) | undefined
    let cancelled = false
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> }
    void nav.getBattery?.().then((b) => {
      if (cancelled) return
      const update = (): void => setInfo({ level: b.level, charging: b.charging })
      update()
      b.addEventListener('levelchange', update)
      b.addEventListener('chargingchange', update)
      cleanup = () => {
        b.removeEventListener('levelchange', update)
        b.removeEventListener('chargingchange', update)
      }
    })
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  return info
}
