import { shell } from 'electron'
import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

// Files opened recently, as Windows itself lists them (the shortcuts in the Recent folder, newest first), the same list
// Start's Recommended section and File Explorer's Recent use. Nothing is recorded by Gabay. When Windows' own "Show
// recently opened items" switch is off, or a policy stops it keeping the list, Gabay shows none either.

export interface RecentFile {
  path: string
  name: string
  folder: string
}

/** One registry value as a number, or null when it isn't set (reg.exe, arguments as data: nothing is parsed by a shell). */
function regDword(key: string, value: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', key, '/v', value], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null)
      const m = /REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout)
      resolve(m ? parseInt(m[1], 16) : null)
    })
  })
}

// Asking the registry takes about half a second (three reg.exe runs), too slow for each time Launch opens. So the last
// answer is used straight away and asked again in the background once it is a minute old. Turning Windows' switch off
// also empties its list, so an answer that is briefly out of date shows nothing extra.
let keeps: boolean | null = null
let askedAt = 0
let asking: Promise<boolean> | null = null
/** Whether Windows keeps the recent-items list: its Settings switch is on (on when unset) and no policy turns it off. */
function windowsKeepsRecent(): Promise<boolean> {
  if (Date.now() - askedAt > 60_000 && !asking) {
    asking = Promise.all([
      regDword('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'Start_TrackDocs'),
      regDword('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoRecentDocsHistory'),
      regDword('HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoRecentDocsHistory')
    ])
      .then(([track, userPolicy, machinePolicy]) => track !== 0 && userPolicy !== 1 && machinePolicy !== 1)
      .then((on) => {
        keeps = on
        askedAt = Date.now()
        return on
      })
      .finally(() => {
        asking = null
      })
  }
  return keeps !== null ? Promise.resolve(keeps) : (asking ?? Promise.resolve(false))
}

/** Asks Windows' switch ahead of time (at startup), so the first Launch doesn't wait for it. */
export function warmRecentFiles(): void {
  void windowsKeepsRecent()
}

/**
 * Up to `max` files opened recently, newest first. Only files on a local drive that still exist (no folders, no
 * network paths, which can stall while a share is offline, and no shortcuts).
 */
export async function recentFiles(max: number): Promise<RecentFile[]> {
  if (!(await windowsKeepsRecent())) return []
  const appData = process.env['APPDATA']
  if (!appData) return []
  const dir = join(appData, 'Microsoft', 'Windows', 'Recent')
  let names: string[]
  try {
    names = (await readdir(dir)).filter((n) => n.toLowerCase().endsWith('.lnk'))
  } catch {
    return []
  }
  const stamped = await Promise.all(
    names.map(async (n) => {
      const p = join(dir, n)
      try {
        return { p, t: (await stat(p)).mtimeMs }
      } catch {
        return { p, t: 0 }
      }
    })
  )
  stamped.sort((a, b) => b.t - a.t)
  const out: RecentFile[] = []
  const seen = new Set<string>()
  for (const { p, t } of stamped.slice(0, 40)) {
    if (out.length >= max || !t) break
    let target = ''
    try {
      target = shell.readShortcutLink(p).target
    } catch {
      continue
    }
    if (!/^[a-z]:\\/i.test(target) || /\.(lnk|url)$/i.test(target) || seen.has(target.toLowerCase())) continue
    try {
      if (!(await stat(target)).isFile()) continue
    } catch {
      continue // gone, or on a drive that isn't there now
    }
    seen.add(target.toLowerCase())
    out.push({ path: target, name: basename(target).slice(0, 200), folder: basename(dirname(target)).slice(0, 80) })
  }
  return out
}
