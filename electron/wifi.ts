import { execFile } from 'node:child_process'

// Nearby Wi-Fi from Windows' own netsh. Connecting is limited to networks this PC already has a saved profile for
// (no passwords pass through Gabay); anything else opens Windows Settings.

export interface WifiNetwork {
  ssid: string
  signal: number // 0-100
  secure: boolean
  known: boolean
  connected: boolean
}

const run = (args: string[]): Promise<string> =>
  new Promise((resolve) => {
    execFile('netsh', args, { windowsHide: true, timeout: 10_000 }, (err, out) => resolve(err ? '' : String(out)))
  })

/** "Key : value" lines -> [key, value]. netsh pads keys with spaces. */
const kv = (line: string): [string, string] | null => {
  const i = line.indexOf(':')
  return i < 0 ? null : [line.slice(0, i).trim(), line.slice(i + 1).trim()]
}

export interface ConnectedWifi {
  ssid: string | null
  signal: number | null
}

const MAC_VALUE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i
const GUID_VALUE = /^\{?[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}\}?$/i
const PERCENT_VALUE = /^(\d{1,3})\s*%$/

/**
 * Reads the connected interface's SSID and signal from `netsh wlan show interfaces` without trusting the field labels:
 * Windows translates them, so the same parser must work on any display language. Two value shapes stay the same
 * everywhere: the signal is the only value that ends in "%", and the SSID line always sits directly above the BSSID
 * line, whose value keeps the MAC shape. (The adapter's physical address is MAC-shaped too, but the line above it is
 * the GUID, which is skipped.)
 */
export function parseConnectedWifi(output: string): ConnectedWifi {
  const pairs: [string, string][] = []
  for (const line of output.split(/\r?\n/)) {
    const p = kv(line)
    if (p) pairs.push(p)
  }
  let signal: number | null = null
  for (const [, value] of pairs) {
    const m = PERCENT_VALUE.exec(value)
    if (m) {
      signal = Math.min(100, Number(m[1]))
      break
    }
  }
  let ssid: string | null = null
  for (let i = 1; i < pairs.length; i++) {
    if (!MAC_VALUE.test(pairs[i][1])) continue
    const above = pairs[i - 1][1]
    if (!above || MAC_VALUE.test(above) || GUID_VALUE.test(above) || PERCENT_VALUE.test(above)) continue
    ssid = above
  }
  return { ssid, signal }
}

let lastScan = new Set<string>()
let profiles = new Set<string>()

export async function listWifi(): Promise<{ networks: WifiNetwork[]; error: 'off' | 'location' | null }> {
  const [scan, prof, iface] = await Promise.all([
    run(['wlan', 'show', 'networks', 'mode=bssid']),
    run(['wlan', 'show', 'profiles']),
    run(['wlan', 'show', 'interfaces'])
  ])
  profiles = new Set(
    prof
      .split(/\r?\n/)
      .map(kv)
      .filter((p): p is [string, string] => !!p && /profile/i.test(p[0]) && p[1] !== '')
      .map((p) => p[1])
  )
  const connected = parseConnectedWifi(iface).ssid ?? ''

  const byName = new Map<string, WifiNetwork>()
  let ssid: string | null = null
  let secure = true
  for (const line of scan.split(/\r?\n/)) {
    const m = /^SSID \d+ : ?(.*)$/.exec(line.trim())
    if (m) {
      ssid = m[1].trim()
      secure = true
      continue
    }
    const p = kv(line)
    if (!p || ssid === null || ssid === '') continue
    if (p[0] === 'Authentication') secure = !/open/i.test(p[1])
    if (p[0] === 'Signal') {
      const signal = Math.min(100, parseInt(p[1], 10) || 0)
      const prev = byName.get(ssid)
      if (!prev || prev.signal < signal)
        byName.set(ssid, { ssid, signal, secure, known: profiles.has(ssid), connected: ssid === connected })
    }
  }
  if (connected && !byName.has(connected))
    byName.set(connected, { ssid: connected, signal: 100, secure: true, known: true, connected: true })
  const networks = [...byName.values()].sort((a, b) => Number(b.connected) - Number(a.connected) || b.signal - a.signal).slice(0, 30)
  lastScan = new Set(networks.map((n) => n.ssid))
  let error: 'off' | 'location' | null = null
  if (!networks.length) error = /location/i.test(scan) ? 'location' : 'off'
  return { networks, error }
}

/** Connect to a saved network from the last scan. Anything else is refused (the caller opens Settings instead). */
export async function connectWifi(ssid: unknown): Promise<boolean> {
  if (typeof ssid !== 'string' || !lastScan.has(ssid) || !profiles.has(ssid)) return false
  const out = await run(['wlan', 'connect', `name=${ssid}`])
  return /success/i.test(out)
}

export async function disconnectWifi(): Promise<boolean> {
  return /success|disconnect/i.test(await run(['wlan', 'disconnect']))
}
