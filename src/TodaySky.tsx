import { memo, useMemo, type CSSProperties } from 'react'
import { tr } from './i18n'

type RGB = [number, number, number]
const N: RGB = [0, 0, 0]
const NOON = 'rgb(82, 180, 255)'

/** The colour of the sky at half-hour slot i: pure black night, deep indigo, violet and pink before sunrise, gold, blue midday, then the same in reverse. Night ends fade to black so they melt into the panel. */
export function skyColor(i: number, rise: number, set: number): string {
  const mid = (rise + set) / 2
  const stops = (
    [
      [rise - 3.5, N],
      [rise - 2.6, [8, 12, 40]],
      [rise - 1.7, [30, 28, 86]],
      [rise - 0.9, [88, 52, 128]],
      [rise - 0.3, [217, 99, 138]],
      [rise + 0.7, [255, 160, 99]],
      [rise + 2, [255, 216, 138]],
      [rise + 4, [124, 200, 255]],
      [mid, [82, 180, 255]],
      [set - 4, [124, 200, 255]],
      [set - 2, [255, 210, 122]],
      [set - 0.7, [255, 138, 79]],
      [set + 0.3, [224, 86, 138]],
      [set + 1, [96, 48, 126]],
      [set + 1.9, [34, 30, 92]],
      [set + 2.8, [8, 12, 40]],
      [set + 3.8, N]
    ] as [number, RGB][]
  ).sort((a, b) => a[0] - b[0]) // a very short day can cross the stops over
  let c: RGB = N
  for (let k = 1; k < stops.length; k++) {
    const [a, ca] = stops[k - 1]
    const [b, cb] = stops[k]
    if (i >= a && i <= b) {
      let t = b === a ? 0 : (i - a) / (b - a)
      c = [0, 1, 2].map((n) => Math.round(ca[n] + (cb[n] - ca[n]) * t)) as RGB
      break
    }
  }
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

// Star seeds [left %, top px]; the last eight sit mid-sky and only show where the whole sky is dark (polar night).
const SEEDS: [number, number][] = [
  [3, 14], [6, 38], [9, 22], [12, 10], [15, 32], [18, 18], [5, 50], [10, 46],
  [88, 16], [91, 38], [94, 10], [96, 28], [90, 48], [98, 44],
  [30, 12], [38, 34], [46, 18], [54, 40], [62, 14], [70, 30], [77, 44], [82, 20]
]

const sunY = (slot: number, rise: number, set: number): number => 54 - 40 * Math.sin((Math.PI * (slot - rise)) / (set - rise))

type Mode = 'day' | 'night' | 'normal'

/** Built once per (rise, set): gradient, arc path, glow and star positions never change within a day. */
function buildSky(rise: number, set: number, mode: Mode): { gradient: string; arc: string; glow: string; stars: [number, number][] } {
  let gradient: string
  if (mode === 'night') gradient = '#000'
  else if (mode === 'day') gradient = NOON
  else {
    const stops: string[] = []
    for (let i = 0; i < 96; i++) stops.push(`${skyColor((i + 0.5) / 2, rise, set)} ${(((i + 0.5) / 96) * 100).toFixed(2)}%`)
    gradient = `linear-gradient(90deg, ${stops.join(', ')})`
  }
  let arc = ''
  if (mode !== 'night')
    for (let i = Math.ceil(rise * 2); i <= Math.floor(set * 2); i++) {
      const x = i / 96
      arc += `${arc ? ' L' : 'M'}${(x * 480).toFixed(1)} ${sunY(x * 48, rise, set).toFixed(1)}`
    }
  const glow =
    mode === 'normal'
      ? `radial-gradient(ellipse 26% 120% at ${((rise / 48) * 100).toFixed(1)}% 100%, rgba(255,130,80,.42), rgba(255,130,80,.16) 45%, rgba(255,130,80,.04) 75%, rgba(255,130,80,0)), radial-gradient(ellipse 26% 120% at ${((set / 48) * 100).toFixed(1)}% 100%, rgba(255,105,95,.38), rgba(255,105,95,.14) 45%, rgba(255,105,95,.04) 75%, rgba(255,105,95,0))`
      : 'none'
  const stars =
    mode === 'day'
      ? []
      : SEEDS.filter(([x], k) => {
          if (mode === 'night') return true
          const slot = (x / 100) * 48
          return k < 14 && (slot < rise - 3 || slot > set + 3) // never on a lit sky
        })
  return { gradient, arc, glow, stars }
}

type Props = {
  /** Sunrise and sunset in minutes since midnight; undefined without a forecast (6:00 to 18:00 is shown). */
  rise?: number
  set?: number
  /** Minutes since midnight, 0..1439. Not `now`, so the 1 s clock never re-renders this. */
  minute: number
  /** The forecast gives equal sun times: the sun is up all day or down all day. */
  polar?: 'day' | 'night'
  locale?: string
}

function TodaySkyInner({ rise, set, minute, polar, locale }: Props): React.JSX.Element {
  const known = rise !== undefined && set !== undefined && rise < set && !polar
  const mode: Mode = polar ?? 'normal'
  const r = polar === 'day' ? 0 : polar === 'night' ? 0 : known ? rise / 30 : 12 // shortcut: 6:00 to 18:00 when there is no forecast
  const s = polar === 'day' ? 48 : polar === 'night' ? 0 : known ? set / 30 : 36
  const sky = useMemo(() => buildSky(r, s, mode), [r, s, mode])
  const hours = useMemo(() => [0, 6, 12, 18].map((h) => new Date(2000, 0, 1, h).toLocaleTimeString(locale, { hour: 'numeric' })), [locale])

  const slot = minute / 30
  const pct = (minute / 1440) * 100
  const up = polar === 'day' || (mode === 'normal' && slot >= r && slot <= s)
  const y = up ? sunY(slot, r, s) : 54
  const glow = up ? skyColor(slot, r, s) : 'transparent'

  const at = (m: number): string => new Date(2000, 0, 1, 0, m).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  const nowT = at(minute)
  const label =
    polar === 'day'
      ? tr('Sky: the sun does not set today, now {0}', nowT)
      : polar === 'night'
        ? tr('Sky: the sun does not rise today, now {0}', nowT)
        : known
          ? tr('Sky: sunrise {0}, sunset {1}, now {2}', at(rise), at(set), nowT)
          : tr('Sky: sunrise and sunset unavailable, showing 6 AM to 6 PM, now {0}', nowT)

  return (
    <>
      <div className="sky" role="img" aria-label={label} title={known ? `${at(rise)} → ${at(set)}` : undefined}>
        <div className="sky-base" aria-hidden="true" style={{ background: sky.gradient }} />
        <div className="sky-zen" aria-hidden="true" />
        {sky.glow !== 'none' && <div className="sky-glow" aria-hidden="true" style={{ background: sky.glow }} />}
        {sky.stars.map(([x, top], k) => (
          <i key={k} className="sky-star" aria-hidden="true" style={{ left: `${x}%`, top, animationDelay: `${(k * 0.37).toFixed(2)}s` }} />
        ))}
        {sky.arc && (
          <svg className="sky-arc" viewBox="0 0 480 68" preserveAspectRatio="none" aria-hidden="true">
            <path d={sky.arc} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" strokeDasharray="2 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <div className="sky-future" aria-hidden="true" style={{ transform: `translateX(calc(${pct.toFixed(2)}% - 14px))` }} />
        <div className={up ? 'sky-orb' : 'sky-orb is-down'} aria-hidden="true" style={{ transform: `translateX(${pct.toFixed(2)}%)`, '--glow': glow } as CSSProperties}>
          <div className="sky-orb-dot" style={{ transform: `translateY(${y.toFixed(1)}px)` }} />
        </div>
        <svg className="sky-hills" viewBox="0 0 480 26" preserveAspectRatio="none" width="100%" height="26" aria-hidden="true">
          <path d="M0 26V14C40 6 80 16 130 11S220 2 270 10S370 18 420 10S465 6 480 12V26Z" fill="#05060b" />
          <path d="M0 26V19C50 13 90 22 150 18S250 11 310 18S410 24 480 17V26Z" fill="#000" />
        </svg>
      </div>
      <div className="sky-hrs" aria-hidden="true">
        {hours.map((t, k) => (
          <span key={k} style={{ left: `${k * 25}%`, transform: k === 0 ? 'none' : undefined }}>
            {t}
          </span>
        ))}
      </div>
    </>
  )
}

export const TodaySky = memo(TodaySkyInner)
