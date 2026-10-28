import { app } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { NATIVE_SOURCE } from './nativeSource'
import { logError } from './diagnostics'

// Gabay's native helper: one small resident process (about 15 MB) for what Electron can't see: full screen, now
// playing, Windows notifications, open windows, focus, volume and Bluetooth. It is compiled once on this PC with the
// C# compiler that ships with Windows and cached in userData/bin, keyed by a hash of its source.

const FW = (): string | null => {
  const win = process.env['WINDIR'] ?? 'C:\\Windows'
  for (const fw of ['Framework64', 'Framework']) {
    const dir = join(win, 'Microsoft.NET', fw, 'v4.0.30319')
    if (existsSync(join(dir, 'csc.exe'))) return dir
  }
  return null
}

const WINMD = ['Foundation', 'Media', 'Storage', 'UI', 'Devices', 'ApplicationModel']
const NET = ['System.Windows.Forms.dll', 'System.Drawing.dll']

async function helperExe(): Promise<string | null> {
  const fw = FW()
  if (!fw) return null
  const meta = join(process.env['WINDIR'] ?? 'C:\\Windows', 'System32', 'WinMetadata')
  const hash = createHash('sha256').update(NATIVE_SOURCE).digest('hex').slice(0, 12)
  const dir = join(app.getPath('userData'), 'bin')
  const exe = join(dir, `gabay-native-${hash}.exe`)
  if (existsSync(exe)) {
    void removeStale(dir, exe)
    return exe
  }
  await mkdir(dir, { recursive: true })
  const src = join(dir, `gabay-native-${hash}.cs`)
  await writeFile(src, NATIVE_SOURCE, 'utf8')
  const args = [
    '/nologo',
    '/optimize+',
    '/target:exe',
    `/out:${exe}`,
    `/r:${join(fw, 'System.Runtime.dll')}`,
    ...NET.map((d) => `/r:${join(fw, d)}`),
    ...WINMD.map((m) => `/r:${join(meta, `Windows.${m}.winmd`)}`),
    src
  ]
  return new Promise((resolve) => {
    execFile(join(fw, 'csc.exe'), args, { windowsHide: true, timeout: 90_000 }, (err) => {
      const ok = !err && existsSync(exe)
      if (ok) void removeStale(dir, exe)
      resolve(ok ? exe : null)
    })
  })
}

/** Older helper builds (one per update) and the old full-screen watcher: delete all but the current one. */
async function removeStale(dir: string, keep: string): Promise<void> {
  try {
    const keepBase = keep.replace(/\.exe$/i, '')
    for (const f of await readdir(dir)) {
      const full = join(dir, f)
      if (!/^(gabay-native|fullscreen-watcher)-[0-9a-f]+\.(exe|cs)$/i.test(f) || full.startsWith(keepBase)) continue
      await rm(full, { force: true }).catch(() => undefined) // in use by an old process: try again next start
    }
  } catch {
    // Folder unreadable: nothing to tidy.
  }
}

export interface NativeEvents {
  fullscreen: (rect: { l: number; t: number; r: number; b: number } | null, captured: boolean) => void
  media: (raw: unknown) => void
  note: (raw: unknown) => void
  privacy: (raw: unknown) => void
  noteAccess: (status: string) => void
  windows: (raw: unknown) => void
  tray: (raw: unknown) => void
  /** The Start menu (or its search) came to the front, or left it. */
  start: (open: boolean) => void
}

let child: ChildProcess | null = null
let stopped = false
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; timer: NodeJS.Timeout }>()

/** Start the helper. Best effort: if it can't be built or dies, its features quietly go away. */
let restarts: number[] = []

export async function startNative(on: NativeEvents, onReady: () => void): Promise<void> {
  const exe = await helperExe()
  if (!exe || stopped) return
  const p = spawn(exe, [String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  child = p
  try {
    if (p.pid) os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL) // never compete with a game for CPU
  } catch {
    /* priority is a courtesy */
  }
  let buf = ''
  let fsOn = false
  p.stdout?.setEncoding('utf8')
  p.stdout?.on('data', (chunk: string) => {
    buf += chunk
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      const sp = line.indexOf(' ')
      const kind = sp < 0 ? line : line.slice(0, sp)
      const rest = sp < 0 ? '' : line.slice(sp + 1)
      try {
        if (kind === 'fs') {
          const m = /^1 (-?\d+) (-?\d+) (-?\d+) (-?\d+)(?: ([01]))?$/.exec(rest)
          fsOn = !!m
          // "0 1": not full screen, but a game in a window is aiming (pointer hidden and locked)
          on.fullscreen(m ? { l: +m[1], t: +m[2], r: +m[3], b: +m[4] } : null, m ? m[5] === '1' : rest === '0 1')
        } else if (kind === 'media') on.media(JSON.parse(rest))
        else if (kind === 'note') on.note(JSON.parse(rest))
        else if (kind === 'priv') on.privacy(JSON.parse(rest))
        else if (kind === 'wins') on.windows(JSON.parse(rest))
        else if (kind === 'tray') on.tray(JSON.parse(rest))
        else if (kind === 'start') on.start(rest === '1')
        else if (kind === 'noteaccess') on.noteAccess(rest.slice(0, 40))
        else if (kind === 'r') {
          const s2 = rest.indexOf(' ')
          const id = Number(rest.slice(0, s2))
          const w = pending.get(id)
          if (w) {
            pending.delete(id)
            clearTimeout(w.timer)
            w.resolve(JSON.parse(rest.slice(s2 + 1)))
          }
        }
      } catch {
        // A malformed line is dropped; the helper keeps going.
      }
    }
  })
  p.on('exit', (code) => {
    if (!stopped) logError('helper', `exited with code ${String(code)}`)
    if (child === p) child = null
    for (const [, w] of pending) {
      clearTimeout(w.timer)
      w.resolve(null)
    }
    pending.clear()
    if (fsOn) on.fullscreen(null, false) // never leave the notch hidden because the helper went away
    on.media(null)
    on.windows([])
    on.start(false)
    on.privacy({ mic: [], cam: [] }) // never leave a camera or mic dot lit for a helper that's gone
    // Restart after a crash, at most 5 times in 10 minutes so a broken helper can't loop.
    const now = Date.now()
    restarts = restarts.filter((t) => now - t < 600_000)
    if (!stopped && restarts.length < 5) {
      restarts.push(now)
      setTimeout(() => void startNative(on, onReady), 2000)
    }
  })
  onReady()
}

/** One request. `arg` must already be validated by the caller: it is passed on as part of a single line. */
export function nativeCall(cmd: 'vol' | 'volget' | 'micget' | 'micset' | 'outlist' | 'outset' | 'media' | 'bt' | 'notes' | 'appbar' | 'clipok' | 'clipseq' | 'mixer' | 'appvol' | 'seek' | 'wins' | 'windows' | 'focus' | 'minimize' | 'close' | 'tbget' | 'tbset' | 'tbhide' | 'tray' | 'trayclick' | 'traywait' | 'appicon' | 'startmenu' | 'net' | 'hw' | 'dnd' | 'notedismiss' | 'noteopen', arg = ''): Promise<unknown> {
  const p = child
  if (!p?.stdin || /[\r\n]/.test(arg)) return Promise.resolve(null)
  const id = nextId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve(null)
    }, 8000)
    pending.set(id, { resolve, timer })
    p.stdin?.write(`${id} ${cmd}${arg ? ' ' + arg : ''}\n`)
  })
}

export const nativeRunning = (): boolean => child !== null

export function stopNative(): void {
  stopped = true
  child?.stdin?.end()
  child?.kill()
  child = null
}
