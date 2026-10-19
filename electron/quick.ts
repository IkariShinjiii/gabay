import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { networkInterfaces } from 'node:os'

/** Everything the Quick tab shows. Fields are null/empty when Windows doesn't expose them (desktop PCs have no brightness). */
export interface QuickState {
  volume: number | null // 0-1
  muted: boolean
  brightness: number | null // 0-100
  layout: string // e.g. "ENG US"
  radios: { wifi?: boolean; bluetooth?: boolean }
  wifi: { ssid: string | null; signal: number | null }
}

export type QuickAction =
  | { kind: 'volume'; value: number }
  | { kind: 'mute' }
  | { kind: 'brightness'; value: number }
  | { kind: 'radio'; radio: 'wifi' | 'bluetooth'; on: boolean }
  | { kind: 'airplane' }

/** Pages Windows Settings opens for tiles that only need a shortcut. Fixed list: the renderer sends a key, never a URI. */
export const SETTINGS_PAGES = {
  energy: 'ms-settings:batterysaver',
  nightlight: 'ms-settings:nightlight',
  accessibility: 'ms-settings:easeofaccess',
  project: 'ms-settings:project',
  captions: 'ms-settings:easeofaccess-closedcaptioning',
  hotspot: 'ms-settings:network-mobilehotspot',
  nearby: 'ms-settings:crossdevice',
  cast: 'ms-settings-connectabledevices:devicediscovery',
  sound: 'ms-settings:sound',
  notifications: 'ms-settings:notifications',
  network: 'ms-settings:network-wifi',
  bluetooth: 'ms-settings:bluetooth',
  settings: 'ms-settings:'
} as const
export type SettingsKey = keyof typeof SETTINGS_PAGES

export const isSettingsKey = (k: unknown): k is SettingsKey => typeof k === 'string' && Object.hasOwn(SETTINGS_PAGES, k)

// One hidden PowerShell process holds the audio COM objects and the Windows Runtime radio API, so a slider drag is a
// few milliseconds instead of a fresh multi-second PowerShell start. It exists only while the Quick tab is in use:
// it is started on the first request and stopped after IDLE_MS without one. Nothing runs while the notch is collapsed.
const IDLE_MS = 30_000
const REQUEST_TIMEOUT_MS = 8_000

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Globalization;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

public static class Gabay {
  static IAudioEndpointVolume Vol() {
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
    var iid = typeof(IAudioEndpointVolume).GUID;
    IAudioEndpointVolume v; dev.Activate(ref iid, 23, 0, out v);
    return v;
  }
  public static float GetVolume() { float l; Vol().GetMasterVolumeLevelScalar(out l); return l; }
  public static void SetVolume(float l) { Vol().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, l)), Guid.Empty); }
  public static bool GetMute() { bool m; Vol().GetMute(out m); return m; }
  public static void SetMute(bool m) { Vol().SetMute(m, Guid.Empty); }

  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);
  // Layout of the focused window, the same thing the taskbar shows ("ENG US").
  public static string Layout() {
    var hkl = GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero));
    var c = new CultureInfo((int)((long)hkl & 0xFFFF));
    var region = c.Name.Contains("-") ? c.Name.Substring(c.Name.LastIndexOf('-') + 1).ToUpper() : "";
    return (c.ThreeLetterISOLanguageName.ToUpper() + " " + region).Trim();
  }
}
"@

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq ('IAsyncOperation' + [char]96 + '1') })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
[Windows.Devices.Radios.Radio, Windows.System.Devices, ContentType = WindowsRuntime] | Out-Null
$null = Await ([Windows.Devices.Radios.Radio]::RequestAccessAsync()) ([Windows.Devices.Radios.RadioAccessStatus])
function Radios { Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]) }
function SetRadio($kind, $on) {
  foreach ($r in (Radios)) {
    if ($r.Kind.ToString().ToLower() -eq $kind) {
      $state = if ($on) { 'On' } else { 'Off' }
      $null = Await ($r.SetStateAsync($state)) ([Windows.Devices.Radios.RadioAccessStatus])
    }
  }
}
$script:before = @('wifi')

function Snap {
  $o = [ordered]@{ volume = $null; muted = $false; brightness = $null; layout = ''; radios = @{} }
  try { $o.volume = [math]::Round([Gabay]::GetVolume(), 3); $o.muted = [Gabay]::GetMute() } catch { }
  try { $o.layout = [Gabay]::Layout() } catch { }
  try { $o.brightness = [int](Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness } catch { }
  try { foreach ($r in (Radios)) { $o.radios[$r.Kind.ToString().ToLower()] = ($r.State.ToString() -eq 'On') } } catch { }
  $o | ConvertTo-Json -Compress
}

[Console]::Out.WriteLine('ready')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    if ($line -match '^vol (\d{1,3})$') { [Gabay]::SetVolume([float]([int]$Matches[1] / 100)) }
    elseif ($line -eq 'mute') { [Gabay]::SetMute(-not [Gabay]::GetMute()) }
    elseif ($line -match '^bright (\d{1,3})$') {
      $level = [Math]::Min(100, [int]$Matches[1])
      Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | ForEach-Object { $null = Invoke-CimMethod -InputObject $_ -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]$level } }
    }
    elseif ($line -match '^radio (wifi|bluetooth) (on|off)$') { SetRadio $Matches[1] ($Matches[2] -eq 'on') }
    elseif ($line -eq 'airplane') {
      $on = @(Radios | Where-Object { $_.State.ToString() -eq 'On' } | ForEach-Object { $_.Kind.ToString().ToLower() })
      if ($on.Count -gt 0) {
        $script:before = $on
        foreach ($k in $on) { SetRadio $k $false }
      } else {
        foreach ($k in $script:before) { SetRadio $k $true }
      }
    }
    elseif ($line -ne 'get') { continue }
    [Console]::Out.WriteLine((Snap))
  } catch { [Console]::Out.WriteLine('{"error":true}') }
}
`

type Reply = Record<string, unknown>

let proc: ChildProcessWithoutNullStreams | null = null
let ready: Promise<void> | null = null
let buffer = ''
let waiting: { resolve: (r: Reply | null) => void; timer: NodeJS.Timeout }[] = []
let idleTimer: NodeJS.Timeout | undefined
let chain: Promise<unknown> = Promise.resolve()

function stopHelper(): void {
  clearTimeout(idleTimer)
  const p = proc
  proc = null
  ready = null
  buffer = ''
  p?.stdin.end()
  p?.kill()
  for (const w of waiting) {
    clearTimeout(w.timer)
    w.resolve(null)
  }
  waiting = []
}

function startHelper(): Promise<void> {
  if (ready) return ready
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64') // no quoting or length problems on the command line
  const p = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true }
  )
  proc = p
  p.stdout.setEncoding('utf8')
  ready = new Promise<void>((resolve) => {
    let isReady = false
    p.stdout.on('data', (chunk: string) => {
      buffer += chunk
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!isReady) {
          if (line === 'ready') {
            isReady = true
            resolve()
          }
          continue
        }
        const w = waiting.shift()
        if (!w) continue
        clearTimeout(w.timer)
        try {
          w.resolve(JSON.parse(line) as Reply)
        } catch {
          w.resolve(null)
        }
      }
    })
    p.on('exit', () => {
      if (proc === p) stopHelper()
      resolve() // never leave a caller waiting on a helper that died
    })
    p.on('error', () => {
      if (proc === p) stopHelper()
      resolve()
    })
    setTimeout(resolve, 15_000) // slow first compile: don't hang the UI forever
  })
  return ready
}

/** Send one command line; resolves with the helper's JSON reply, or null on failure. Requests run one at a time. */
function send(command: string): Promise<Reply | null> {
  const run = async (): Promise<Reply | null> => {
    await startHelper()
    const p = proc
    if (!p) return null
    clearTimeout(idleTimer)
    idleTimer = setTimeout(stopHelper, IDLE_MS)
    return new Promise<Reply | null>((resolve) => {
      const timer = setTimeout(() => {
        waiting = waiting.filter((w) => w.timer !== timer)
        resolve(null)
      }, REQUEST_TIMEOUT_MS)
      waiting.push({ resolve, timer })
      p.stdin.write(command + '\n')
    })
  }
  const next = chain.then(run, run)
  chain = next.catch(() => undefined)
  return next
}

/** Signal and SSID from netsh (English labels; null on other languages or without Wi-Fi). Never logged. */
function wifiInfo(): Promise<QuickState['wifi']> {
  return new Promise((resolve) => {
    execFile('netsh', ['wlan', 'show', 'interfaces'], { windowsHide: true, timeout: 4000 }, (err, stdout) => {
      if (err) return resolve({ ssid: null, signal: null })
      const ssid = /^\s*SSID\s*:\s*(.+)$/m.exec(stdout)?.[1]?.trim() ?? null
      const sig = /^\s*Signal\s*:\s*(\d+)\s*%/m.exec(stdout)?.[1]
      resolve({ ssid, signal: sig ? Number(sig) : null })
    })
  })
}

async function snapshotWith(reply: Reply | null): Promise<QuickState> {
  const wifi = await wifiInfo()
  const r = reply ?? {}
  const radios = (typeof r.radios === 'object' && r.radios !== null ? r.radios : {}) as Record<string, unknown>
  return {
    volume: typeof r.volume === 'number' ? r.volume : null,
    muted: r.muted === true,
    brightness: typeof r.brightness === 'number' ? r.brightness : null,
    layout: typeof r.layout === 'string' ? r.layout : '',
    radios: {
      ...(typeof radios.wifi === 'boolean' ? { wifi: radios.wifi } : {}),
      ...(typeof radios.bluetooth === 'boolean' ? { bluetooth: radios.bluetooth } : {})
    },
    wifi
  }
}

export async function quickGet(): Promise<QuickState> {
  return snapshotWith(await send('get'))
}

/** Validates the action, turns it into one fixed command line, and returns the state afterwards. */
export async function quickSet(action: unknown): Promise<QuickState> {
  const a = action as Partial<QuickAction> & Record<string, unknown>
  let cmd: string | null = null
  if (a && typeof a === 'object') {
    if (a.kind === 'volume' && typeof a.value === 'number' && Number.isFinite(a.value))
      cmd = `vol ${Math.round(Math.min(100, Math.max(0, a.value)))}`
    else if (a.kind === 'brightness' && typeof a.value === 'number' && Number.isFinite(a.value))
      cmd = `bright ${Math.round(Math.min(100, Math.max(0, a.value)))}`
    else if (a.kind === 'mute') cmd = 'mute'
    else if (a.kind === 'airplane') cmd = 'airplane'
    else if (a.kind === 'radio' && (a.radio === 'wifi' || a.radio === 'bluetooth') && typeof a.on === 'boolean')
      cmd = `radio ${a.radio} ${a.on ? 'on' : 'off'}`
  }
  return snapshotWith(await send(cmd ?? 'get'))
}

/** wifi, ethernet or offline, from the network interfaces: no process, no polling. */
export function networkKind(): 'wifi' | 'ethernet' | 'offline' {
  const VIRTUAL = /vethernet|virtualbox|vmware|loopback|tailscale|bluetooth|hyper-v|wsl|docker|vpn/i
  let found: 'wifi' | 'ethernet' | null = null
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (VIRTUAL.test(name)) continue
    const up = (addrs ?? []).some((a) => !a.internal && a.family === 'IPv4' && !a.address.startsWith('169.254.'))
    if (!up) continue
    if (/wi-?fi|wlan|wireless/i.test(name)) return 'wifi'
    found ??= 'ethernet'
  }
  return found ?? 'offline'
}

export function stopQuick(): void {
  stopHelper()
}
