import type { IconName } from './icons'
import { tr } from './i18n'

/** WMO weather code (Open-Meteo) -> icon and a short description. */
export function weatherLook(code: number, day: boolean): { icon: IconName; label: string } {
  if (code === 0) return { icon: day ? 'sun' : 'moon', label: tr('Clear sky') }
  if (code <= 2) return { icon: day ? 'cloud-sun' : 'cloud', label: tr('Partly cloudy') }
  if (code === 3) return { icon: 'cloud', label: tr('Cloudy') }
  if (code === 45 || code === 48) return { icon: 'cloud-fog', label: tr('Fog') }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: 'cloud-rain', label: code >= 80 ? tr('Showers') : tr('Rain') }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: 'cloud-snow', label: tr('Snow') }
  if (code >= 95) return { icon: 'cloud-lightning', label: tr('Thunderstorm') }
  return { icon: 'cloud', label: tr('Cloudy') }
}
