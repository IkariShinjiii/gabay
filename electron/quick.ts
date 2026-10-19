import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { networkInterfaces } from 'node:os'

/** Everything the Quick tab shows. Fields are null/empty when Windows doesn't expose them (desktop PCs have no brightness). */
export interface QuickState {
  volume: number | null // 0-1
  muted: boolean
  brightness: number | null // 0-100
  layout: string // e.g. "ENG US"
  radios: { wifi?: boolean; bluetooth?: boolean }
  /** Windows' own airplane-mode flag (not inferred from the radios); null if unavailable. */
  airplane: boolean | null
  /** Default output device, e.g. "Speakers" (the part before the driver name in parentheses). */
  audioName: string | null
  /** Windows app theme is dark; null if unreadable. */
  dark: boolean | null
  media: MediaInfo | null
  wifi: { ssid: string | null; signal: number | null }
}

export interface MediaInfo {
  title: string
  artist: string
  playing: boolean
  position: number // seconds at `updated`
  duration: number // seconds, 0 if unknown
  updated: number // epoch ms when Windows last updated the position
  art: string | null // data URL
}

export type QuickAction =
  | { kind: 'volume'; value: number }
  | { kind: 'mute' }
  | { kind: 'brightness'; value: number }
  | { kind: 'radio'; radio: 'wifi' | 'bluetooth'; on: boolean }
  | { kind: 'airplane' }
  | { kind: 'dark'; on: boolean }
  | { kind: 'media'; command: 'toggle' | 'next' | 'prev' }

/** Pages Windows Settings opens for tiles that only need a shortcut. Fixed list: the renderer sends a key, never a URI. */
export const SETTINGS_PAGES = {
  energy: 'ms-settings:batterysaver',
  nightlight: 'ms-settings:nightlight',
  accessibility: 'ms-settings:easeofaccess',
  display: 'ms-settings:display',
  colors: 'ms-settings:colors',
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
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
  int OpenPropertyStore(int stgmAccess, out IPropertyStore store);
}
[StructLayout(LayoutKind.Sequential)] struct PROPERTYKEY { public Guid fmtid; public int pid; }
// 24 bytes on x64: vt, reserved words, then the value union.
[StructLayout(LayoutKind.Explicit, Size = 24)] struct PROPVARIANT { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; }
[Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPropertyStore {
  int GetCount(out int c);
  int GetAt(int i, out PROPERTYKEY k);
  int GetValue(ref PROPERTYKEY key, out PROPVARIANT v);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }

// Radio Management API: the same airplane-mode switch Windows quick settings uses. 'Enabled' means radios allowed,
// so airplane mode is on when it is 0.
[ComImport, Guid("db3afbfb-08e6-46c6-aa70-bf9a34c30ab7"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IRadioManager {
  int IsRMSupported(out uint pdwState);
  int GetUIRadioInstances([MarshalAs(UnmanagedType.IUnknown)] out object ppCollection);
  int GetSystemRadioState(out int pbEnabled, out int param2, out int pChangeReason);
  int SetSystemRadioState(int bEnabled);
  int Refresh();
  int OnHardwareSliderChange(int param1, int param2);
}
[ComImport, Guid("581333f6-28db-41be-bc7a-ff201f12f3f6")] class RadioManagementAPI { }

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

  public static string AudioName() {
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
    IPropertyStore ps; dev.OpenPropertyStore(0, out ps);
    var key = new PROPERTYKEY { fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14 }; // FriendlyName
    PROPVARIANT v; ps.GetValue(ref key, out v);
    return v.vt == 31 ? Marshal.PtrToStringUni(v.p) : null; // VT_LPWSTR
  }

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, string l, uint flags, uint timeout, out IntPtr result);
  // Tell running apps the theme changed (what Settings does), so the switch applies without a sign-out.
  public static void BroadcastTheme() { IntPtr r; SendMessageTimeout((IntPtr)0xffff, 0x1A, IntPtr.Zero, "ImmersiveColorSet", 2, 200, out r); }

  public static bool GetAirplane() {
    int enabled, p2, reason;
    Marshal.ThrowExceptionForHR(((IRadioManager)new RadioManagementAPI()).GetSystemRadioState(out enabled, out p2, out reason));
    return enabled == 0;
  }
  public static void SetAirplane(bool on) {
    Marshal.ThrowExceptionForHR(((IRadioManager)new RadioManagementAPI()).SetSystemRadioState(on ? 0 : 1));
  }

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
# Media is optional: if any of this fails, everything else in the helper still works.
$script:media = $null
$script:artKey = ''
$readStream = $null
try {
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
  $script:media = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $readStream = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
} catch { }
function Media {
  if (-not $script:media) { return $null }
  $s = $script:media.GetCurrentSession()
  if (-not $s) { $script:artKey = ''; return $null }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $tl = $s.GetTimelineProperties()
  $m = [ordered]@{ title = [string]$p.Title; artist = [string]$p.Artist; playing = ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing')
    position = $tl.Position.TotalSeconds; duration = ($tl.EndTime - $tl.StartTime).TotalSeconds; updated = $tl.LastUpdatedTime.ToUnixTimeMilliseconds() }
  # Album art only when the track changes: it is the one large field.
  $key = $m.title + '|' + $m.artist
  if ($key -ne $script:artKey) {
    $script:artKey = $key
    $m.art = ''
    try {
      if ($p.Thumbnail -and $readStream) {
        $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        $mem = New-Object IO.MemoryStream
        $readStream.Invoke($null, @($st)).CopyTo($mem)
        if ($mem.Length -le 400000) { $m.art = [Convert]::ToBase64String($mem.ToArray()) }
      }
    } catch { }
  }
  $m
}
function MediaCommand($c) {
  if (-not $script:media) { return }
  $s = $script:media.GetCurrentSession()
  if (-not $s) { return }
  $op = if ($c -eq 'next') { $s.TrySkipNextAsync() } elseif ($c -eq 'prev') { $s.TrySkipPreviousAsync() } else { $s.TryTogglePlayPauseAsync() }
  $null = Await $op ([bool])
  Start-Sleep -Milliseconds 250 # let the player publish its new state before we read it back
}
$themeKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'

function Radios { Await ([Windows.Devices.Radios.Radio]::GetRadiosAsync()) ([System.Collections.Generic.IReadOnlyList[Windows.Devices.Radios.Radio]]) }
function SetRadio($kind, $on) {
  foreach ($r in (Radios)) {
    if ($r.Kind.ToString().ToLower() -eq $kind) {
      $state = if ($on) { 'On' } else { 'Off' }
      $null = Await ($r.SetStateAsync($state)) ([Windows.Devices.Radios.RadioAccessStatus])
    }
  }
}

function Snap {
  $o = [ordered]@{ volume = $null; muted = $false; brightness = $null; layout = ''; radios = @{}; airplane = $null; audioName = $null; dark = $null; media = $null }
  try { $o.audioName = [Gabay]::AudioName() } catch { }
  try { $o.dark = ((Get-ItemPropertyValue -Path $themeKey -Name AppsUseLightTheme) -eq 0) } catch { }
  try { $o.media = Media } catch { }
  try { $o.airplane = [Gabay]::GetAirplane() } catch { }
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
    elseif ($line -eq 'airplane') { [Gabay]::SetAirplane(-not [Gabay]::GetAirplane()) }
    elseif ($line -match '^dark (on|off)$') {
      $light = if ($Matches[1] -eq 'on') { 0 } else { 1 }
      Set-ItemProperty -Path $themeKey -Name AppsUseLightTheme -Value $light -Type DWord
      Set-ItemProperty -Path $themeKey -Name SystemUsesLightTheme -Value $light -Type DWord
      [Gabay]::BroadcastTheme()
    }
    elseif ($line -match '^media (toggle|next|prev)$') { MediaCommand $Matches[1] }
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

// The helper sends album art only when the track changes; keep the last one for the polls in between.
let lastArt: { key: string; url: string | null } = { key: '', url: null }

function toMedia(raw: unknown): MediaInfo | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const title = typeof m.title === 'string' ? m.title : ''
  const artist = typeof m.artist === 'string' ? m.artist : ''
  if (!title && !artist) return null
  const key = title + '|' + artist
  if (typeof m.art === 'string') {
    // Sniff the image type from its first bytes; Windows often leaves the content type empty.
    const mime = m.art.startsWith('/9j/') ? 'image/jpeg' : m.art.startsWith('iVBOR') ? 'image/png' : 'image/jpeg'
    lastArt = { key, url: m.art ? `data:${mime};base64,${m.art}` : null }
  } else if (lastArt.key !== key) {
    lastArt = { key, url: null }
  }
  return {
    title,
    artist,
    playing: m.playing === true,
    position: num(m.position),
    duration: num(m.duration),
    updated: num(m.updated),
    art: lastArt.url
  }
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
    airplane: typeof r.airplane === 'boolean' ? r.airplane : null,
    audioName: typeof r.audioName === 'string' ? r.audioName.replace(/\s*\(.*\)\s*$/, '') || r.audioName : null,
    dark: typeof r.dark === 'boolean' ? r.dark : null,
    media: toMedia(r.media),
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
    else if (a.kind === 'dark' && typeof a.on === 'boolean') cmd = `dark ${a.on ? 'on' : 'off'}`
    else if (a.kind === 'media' && (a.command === 'toggle' || a.command === 'next' || a.command === 'prev'))
      cmd = `media ${a.command}`
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
