import Icon from './Icon'
import type { IconName } from './icons'
import type { DownloadState, LiveMedia, Weather } from './global'
import type { BatteryInfo } from './useBattery'
import { formatMs, type FocusTimer } from './useFocusTimer'
import { formatClock } from './useTimers'
import { weatherLook } from './weatherIcon'
import { tr } from './i18n'

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

const mb = (bytes: number): string => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(0, Math.round(bytes / 1e6))} MB`)

interface Props {
  clock: string
  timer: FocusTimer
  battery: BatteryInfo | null
  net: NetKind
  /** The PC has no Wi-Fi (a desktop): offline shows an unplugged cable, not crossed-out Wi-Fi. */
  wired?: boolean
  /** Playing media: art on the left, a moving level meter on the right. */
  media: LiveMedia | null
  weather: Weather | null
  dnd: boolean
  /** Apps using the camera / microphone right now (iPhone-style dot on the right; hover names them). */
  privacy: { mic: string[]; cam: string[] }
  /** An open app is flashing for attention (only while the Windows taskbar is hidden). */
  attention: boolean
  /** Elapsed ms while a screen recording runs. */
  recordingMs: number | null
  /** Elapsed ms while the stopwatch runs. */
  stopwatchMs: number | null
  /** The countdown that ends first, while one runs. */
  countdown: { leftMs: number; totalMs: number } | null
  download: DownloadState | null
}

function Ring({ fraction }: { fraction: number }): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r={R} className="ring-bg" />
      <circle
        cx="10"
        cy="10"
        r={R}
        className="ring-fg"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - Math.max(0, Math.min(1, fraction)))}
        transform="rotate(-90 10 10)"
      />
    </svg>
  )
}

/**
 * The collapsed pill, laid out like a phone status bar around a notch: network and weather on the left, the clock (or
 * whatever is running: a recording, the stopwatch, a timer) in the middle, battery and live indicators on the right.
 */
export default function NotchStatus(p: Props): React.JSX.Element {
  const { timer, battery, net, media, weather } = p
  const live = media?.playing ? media : null
  const low = battery !== null && !battery.charging && battery.level <= 0.2
  const look = weather ? weatherLook(weather.code, weather.day) : null

  let center: React.JSX.Element
  if (p.recordingMs !== null) {
    center = (
      <span className="status-timer rec">
        <span className="rec-dot" />
        {formatClock(p.recordingMs)}
      </span>
    )
  } else if (p.stopwatchMs !== null) {
    center = (
      <span className="status-timer">
        <Icon name="timer" size={12} />
        {formatClock(p.stopwatchMs)}
      </span>
    )
  } else if (p.countdown) {
    center = (
      <span className="status-timer">
        <Ring fraction={p.countdown.totalMs ? p.countdown.leftMs / p.countdown.totalMs : 0} />
        {formatClock(p.countdown.leftMs + 999)}
      </span>
    )
  } else if (timer.status !== 'idle') {
    center = (
      <span className={timer.status === 'paused' ? 'status-timer paused' : 'status-timer'}>
        <Ring fraction={timer.totalMs > 0 ? timer.remainingMs / timer.totalMs : 0} />
        {timer.status === 'done' ? 'Done' : formatMs(timer.remainingMs)}
      </span>
    )
  } else {
    center = <span className="status-clock">{p.clock}</span>
  }

  const privacy = p.privacy.cam.length ? 'cam' : p.privacy.mic.length ? 'mic' : null
  const list = (names: string[]): string =>
    names.length <= 1 ? (names[0] ?? tr('An app')) : tr('{0} and {1}', names.slice(0, -1).join(', '), names[names.length - 1])
  const privacyTip = [
    p.privacy.cam.length ? (p.privacy.cam.length > 1 ? tr('{0} are using the camera', list(p.privacy.cam)) : tr('{0} is using the camera', list(p.privacy.cam))) : '',
    p.privacy.mic.length ? (p.privacy.mic.length > 1 ? tr('{0} are using the microphone', list(p.privacy.mic)) : tr('{0} is using the microphone', list(p.privacy.mic))) : ''
  ]
    .filter(Boolean)
    .join('. ')

  return (
    <div className="status-row">
      <span className={net === 'offline' ? 'st-side st-left st-warn' : 'st-side st-left'}>
        {live && (
          <span className="st-art" title={`${live.title} · ${live.artist}`}>
            {live.art ? <img src={live.art} alt="" draggable={false} /> : <Icon name="music" size={10} />}
          </span>
        )}
        <span title={tr(NET_LABEL[net])} className="st-icon">
          <Icon name={net === 'offline' && p.wired ? 'cable' : NET_ICON[net]} size={12} />
        </span>
        {look && weather && (
          <span className="st-weather" title={`${look.label}, ${weather.temp}° · ${weather.place}`}>
            <Icon name={look.icon} size={12} />
            {weather.temp}°
          </span>
        )}
        {p.attention && <span className="st-attn" title={tr('An app wants your attention')} />}
        {p.dnd && (
          <span className="st-icon st-dnd" title={tr('Do not disturb')}>
            <Icon name="moon" size={11} />
          </span>
        )}
      </span>

      {center}

      <span className={low ? 'st-side st-right st-warn' : 'st-side st-right'}>
        {battery && (
          <>
            <Icon name={batteryIcon(battery)} size={13} />
            <span className="st-pct">{Math.round(battery.level * 100)}</span>
          </>
        )}
        {p.download ? (
          <span className="st-dl" title={`Downloading ${p.download.name}`}>
            <Icon name="download" size={11} />
            {mb(p.download.bytes)}
          </span>
        ) : (
          live && (
            <span className="st-eq" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          )
        )}
        {privacy && <span className={`st-priv ${privacy}`} title={privacyTip} />}
      </span>
    </div>
  )
}
