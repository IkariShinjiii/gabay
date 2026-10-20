import Icon from './Icon'
import type { IconName } from './icons'
import type { BatteryInfo } from './useBattery'
import { formatMs, type FocusTimer } from './useFocusTimer'

const R = 8
const C = 2 * Math.PI * R

export type NetKind = 'wifi' | 'ethernet' | 'offline'

export function batteryIcon(b: BatteryInfo): IconName {
  if (b.charging) return 'battery-charging'
  if (b.level <= 0.2) return 'battery-low'
  if (b.level <= 0.6) return 'battery-medium'
  return 'battery-full'
}

const NET_ICON: Record<NetKind, IconName> = { wifi: 'wifi', ethernet: 'cable', offline: 'wifi-off' }
const NET_LABEL: Record<NetKind, string> = { wifi: 'Wi-Fi connected', ethernet: 'Ethernet connected', offline: 'Offline' }

interface Props {
  clock: string
  timer: FocusTimer
  battery: BatteryInfo | null
  net: NetKind
}

/**
 * The collapsed pill, laid out like a phone status bar around a notch: network on the left, the clock (or the
 * focus-timer ring) in the middle, battery on the right.
 */
export default function NotchStatus({ clock, timer, battery, net }: Props): React.JSX.Element {
  const left = timer.totalMs > 0 ? timer.remainingMs / timer.totalMs : 0
  const low = battery !== null && !battery.charging && battery.level <= 0.2

  return (
    <div className="status-row">
      <span className={net === 'offline' ? 'st-side st-left st-warn' : 'st-side st-left'} title={NET_LABEL[net]}>
        <Icon name={NET_ICON[net]} size={12} />
      </span>

      {timer.status === 'idle' ? (
        <span className="status-clock">{clock}</span>
      ) : (
        <span className={timer.status === 'paused' ? 'status-timer paused' : 'status-timer'}>
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r={R} className="ring-bg" />
            <circle
              cx="10"
              cy="10"
              r={R}
              className="ring-fg"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - left)}
              transform="rotate(-90 10 10)"
            />
          </svg>
          {timer.status === 'done' ? 'Done' : formatMs(timer.remainingMs)}
        </span>
      )}

      <span className={low ? 'st-side st-right st-warn' : 'st-side st-right'}>
        {battery && (
          <>
            <Icon name={batteryIcon(battery)} size={13} />
            <span className="st-pct">{Math.round(battery.level * 100)}</span>
          </>
        )}
      </span>
    </div>
  )
}
