import { app } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NATIVE_SOURCE } from './nativeSource'

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
  if (existsSync(exe)) return exe
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
    execFile(join(fw, 'csc.exe'), args, { windowsHide: true, timeout: 90_000 }, (err) => resolve(err || !existsSync(exe) ? null : exe))
  })
}

export interface NativeEvents {
  fullscreen: (rect: { l: number; t: number; r: number; b: number } | null) => void
  media: (raw: unknown) => void
  note: (raw: unknown) => void
}

let child: ChildProcess | null = null
let stopped = false
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; timer: NodeJS.Timeout }>()

/** Start the helper. Best effort: if it can't be built or dies, its features quietly go away. */
export async function startNative(on: NativeEvents): Promise<void> {
  const exe = await helperExe()
  if (!exe || stopped) return
  const p = spawn(exe, [String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  child = p
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
          const m = /^1 (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/.exec(rest)
          fsOn = !!m
          on.fullscreen(m ? { l: +m[1], t: +m[2], r: +m[3], b: +m[4] } : null)
        } else if (kind === 'media') on.media(JSON.parse(rest))
        else if (kind === 'note') on.note(JSON.parse(rest))
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
  p.on('exit', () => {
    if (child === p) child = null
    for (const [, w] of pending) {
      clearTimeout(w.timer)
      w.resolve(null)
    }
    pending.clear()
    if (fsOn) on.fullscreen(null) // never leave the notch hidden because the helper went away
    on.media(null)
  })
}

/** One request. `arg` must already be validated by the caller: it is passed on as part of a single line. */
export function nativeCall(cmd: 'windows' | 'focus' | 'close' | 'vol' | 'volget' | 'media' | 'bt' | 'notes' | 'appbar', arg = ''): Promise<unknown> {
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

export function stopNative(): void {
  stopped = true
  child?.stdin?.end()
  child?.kill()
  child = null
}
