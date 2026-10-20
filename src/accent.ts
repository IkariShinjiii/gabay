// Accent themes. Only the accent changes; surfaces stay black. Each accent sets the five tokens the CSS uses:
// --accent (fills, rings), --accent-strong (filled controls), --accent-text (accent text on black, lighter),
// --accent-tint (an "on" tile's surface, very dark) and --on-accent (text on a filled control).

export const ACCENT_PRESETS: Record<string, { label: string; hex: string }> = {
  mint: { label: 'Mint', hex: '#2fd6bf' },
  windows: { label: 'Windows', hex: '' },
  blue: { label: 'Blue', hex: '#4c9bff' },
  purple: { label: 'Purple', hex: '#a78bfa' },
  pink: { label: 'Pink', hex: '#f472b6' },
  orange: { label: 'Orange', hex: '#fb923c' },
  red: { label: 'Red', hex: '#f87171' },
  green: { label: 'Green', hex: '#4ade80' }
}

const parse = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: number[]): string => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const mix = (a: number[], b: number[], t: number): number[] => a.map((v, i) => v + (b[i] - v) * t)
const luminance = (c: number[]): number => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Applies an accent colour to the page. Dark Windows accents are lifted so they still read on black. */
export function applyAccent(hex: string): void {
  let c: number[] = parse(hex) ?? parse(ACCENT_PRESETS.mint.hex)!
  while (luminance(c) < 0.25) c = mix(c, [255, 255, 255], 0.15)
  const root = document.documentElement.style
  root.setProperty('--accent', toHex(c))
  root.setProperty('--accent-strong', toHex(c))
  root.setProperty('--accent-text', toHex(mix(c, [255, 255, 255], 0.25)))
  root.setProperty('--accent-tint', toHex(mix(c, [0, 0, 0], 0.82)))
  root.setProperty('--on-accent', toHex(mix(c, [0, 0, 0], 0.85)))
}

export async function resolveAccent(name: string): Promise<string> {
  if (name === 'windows') return (await window.overlay.accentColor().catch(() => null)) ?? ACCENT_PRESETS.mint.hex
  return ACCENT_PRESETS[name]?.hex || ACCENT_PRESETS.mint.hex
}
