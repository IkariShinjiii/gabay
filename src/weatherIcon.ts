import type { IconName } from './icons'

/** WMO weather code (Open-Meteo) -> icon and a short description. */
export function weatherLook(code: number, day: boolean): { icon: IconName; label: string } {
  if (code === 0) return { icon: day ? 'sun' : 'moon', label: 'Clear' }
  if (code <= 2) return { icon: day ? 'cloud-sun' : 'cloud', label: 'Partly cloudy' }
  if (code === 3) return { icon: 'cloud', label: 'Cloudy' }
  if (code === 45 || code === 48) return { icon: 'cloud-fog', label: 'Fog' }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: 'cloud-rain', label: code >= 80 ? 'Showers' : 'Rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: 'cloud-snow', label: 'Snow' }
  if (code >= 95) return { icon: 'cloud-lightning', label: 'Thunderstorm' }
  return { icon: 'cloud', label: 'Cloudy' }
}
