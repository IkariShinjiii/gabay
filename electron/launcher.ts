import { app, nativeImage, shell } from 'electron'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { writeJsonAtomic } from './atomicWrite'
import { join } from 'node:path'
import { fuzzyScore } from './search'
import { nativeCall, nativeRunning } from './native'

export interface LauncherItem {
  id: string
  name: string
  starred: boolean
}

interface Entry {
  id: string
  name: string
  kind: 'lnk' | 'appsfolder'
  target: string // .lnk path, or an AppUserModelID / shortcut path for shell:AppsFolder
}

interface Store {
  starred: string[]
  recent: string[] // most recent first
}

const MAX_RESULTS = 8
const MAX_RECENT = 12
const INDEX_TTL_MS = 5 * 60 * 1000
// Start Menu entries that are noise when searching for apps.
const NOISE = /uninstall|readme|release notes|license|documentation|^help\b/i

let entries = new Map<string, Entry>()
let indexedAt = 0
let indexing: Promise<void> | null = null
let store: Store | null = null

// Ids are a hash of the shortcut path: stable across runs, and the renderer never sees (or sends) a path.
const idOf = (path: string): string => createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 12)

async function walk(dir: string, out: Entry[]): Promise<void> {
  let items
  try {
    items = await readdir(dir, { withFileTypes: true })
  } catch {
    return // folder missing or unreadable
  }
  for (const it of items) {
    const p = join(dir, it.name)
    if (it.isDirectory()) await walk(p, out)
    else if (it.name.toLowerCase().endsWith('.lnk')) {
      const name = it.name.slice(0, -4)
      if (!NOISE.test(name)) out.push({ id: idOf(p), name, kind: 'lnk', target: p })
    }
  }
}

// Get-StartApps lists everything the Start menu shows, including Store apps (Notepad, Calculator,
// Settings) that have no .lnk file. Launched through shell:AppsFolder. Best effort: the .lnk walk below
// still works if PowerShell is unavailable.
function startApps(): Promise<Entry[]> {
  return new Promise((resolve) => {
    const script =
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-StartApps | Select-Object Name,AppID | ConvertTo-Json -Compress'
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([])
        try {
          const raw = JSON.parse(stdout) as { Name?: unknown; AppID?: unknown } | { Name?: unknown; AppID?: unknown }[]
          const list = Array.isArray(raw) ? raw : [raw]
          resolve(
            list.flatMap((a) =>
              typeof a.Name === 'string' && typeof a.AppID === 'string' && !NOISE.test(a.Name)
                ? [{ id: idOf(a.AppID), name: a.Name, kind: 'appsfolder' as const, target: a.AppID }]
                : []
            )
          )
        } catch {
          resolve([])
        }
      }
    )
  })
}

async function buildIndex(): Promise<void> {
  const roots = [process.env['ProgramData'], process.env['APPDATA']]
    .filter((r): r is string => !!r)
    .map((r) => join(r, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
  const found: Entry[] = []
  for (const r of roots) await walk(r, found)
  found.push(...(await startApps()))

  // Same app name in both the all-users and per-user menus: keep one.
  const byName = new Map<string, Entry>()
  for (const e of found) if (!byName.has(e.name.toLowerCase())) byName.set(e.name.toLowerCase(), e)
  entries = new Map([...byName.values()].map((e) => [e.id, e]))
  indexedAt = Date.now()
}

export function ensureIndex(): Promise<void> {
  if (Date.now() - indexedAt < INDEX_TTL_MS) return Promise.resolve()
  indexing ??= buildIndex().finally(() => {
    indexing = null
  })
  return indexing
}

// --- persistence: one small JSON file in userData, written atomically ---
const storePath = (): string => join(app.getPath('userData'), 'launcher.json')

async function loadStore(): Promise<Store> {
  if (store) return store
  try {
    const raw = JSON.parse(await readFile(storePath(), 'utf8')) as Partial<Store>
    store = {
      starred: Array.isArray(raw.starred) ? raw.starred.filter((x) => typeof x === 'string') : [],
      recent: Array.isArray(raw.recent) ? raw.recent.filter((x) => typeof x === 'string') : []
    }
  } catch {
    store = { starred: [], recent: [] }
  }
  return store
}

async function saveStore(): Promise<void> {
  if (!store) return
  await writeJsonAtomic(storePath(), store)
}

const toItem = (e: Entry, s: Store): LauncherItem => ({ id: e.id, name: e.name, starred: s.starred.includes(e.id) })

/** Empty query: starred first, then recents. Otherwise fuzzy matches, boosted by starred/recent. */
export async function search(query: string): Promise<LauncherItem[]> {
  await ensureIndex()
  const s = await loadStore()
  const q = query.trim().slice(0, 100)

  if (!q) {
    const ids = [...s.starred, ...s.recent.filter((id) => !s.starred.includes(id))]
    return ids.flatMap((id) => (entries.has(id) ? [toItem(entries.get(id)!, s)] : [])).slice(0, MAX_RESULTS)
  }

  const scored: { e: Entry; score: number }[] = []
  for (const e of entries.values()) {
    const base = fuzzyScore(q, e.name)
    if (base === null) continue
    const ri = s.recent.indexOf(e.id)
    const bonus = (s.starred.includes(e.id) ? 60 : 0) + (ri >= 0 ? 40 - ri * 3 : 0)
    scored.push({ e, score: base + bonus })
  }
  scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
  return scored.slice(0, MAX_RESULTS).map(({ e }) => toItem(e, s))
}

// --- icons ---
// Resolved here and sent to the renderer as small data: URLs keyed by the opaque id, so paths never leave main.
const ICON_PX = 32
const iconCache = new Map<string, string | null>()
let storeLogos: Promise<Map<string, string>> | null = null

// Store apps have no .lnk and the shell only gives a blank-page icon for their AppID, so read the logo each package
// declares in its manifest (Square44x44Logo), preferring the unplated 48 px variant. Best effort, one slow call (about
// 4 s on a typical machine) made lazily the first time a Store app's icon is wanted.
const LOGO_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$pk = @{}
Get-AppxPackage | ForEach-Object { $pk[$_.PackageFamilyName] = $_.InstallLocation }
$out = @{}
foreach ($a in Get-StartApps) {
  $id = $a.AppID
  if ($id -notmatch '^([^!]+)!(.+)$') { continue }
  $loc = $pk[$Matches[1]]
  $appId = $Matches[2]
  if (-not $loc) { continue }
  $m = [xml](Get-Content -LiteralPath (Join-Path $loc 'AppxManifest.xml') -Raw)
  $ap = $m.Package.Applications.Application | Where-Object { $_.Id -eq $appId } | Select-Object -First 1
  $logo = $ap.VisualElements.Square44x44Logo
  if (-not $logo) { continue }
  $full = Join-Path $loc $logo
  $dir = Split-Path $full
  $base = [IO.Path]::GetFileNameWithoutExtension($full)
  $files = Get-ChildItem -LiteralPath $dir -Filter ($base + '*.png')
  $pick = $null
  foreach ($pat in 'targetsize-(48|44)_altform-unplated\.png$', 'targetsize-(48|44)\.png$', 'targetsize-(256|96|72|64)(_altform-unplated)?\.png$', 'scale-(200|150|125|100)\.png$', '\.png$') {
    $pick = $files | Where-Object { $_.Name -match $pat } | Select-Object -First 1
    if ($pick) { break }
  }
  if ($pick) { $out[$id] = $pick.FullName }
}
$out | ConvertTo-Json -Compress
`

function loadStoreLogos(): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', LOGO_SCRIPT],
      { windowsHide: true, timeout: 40000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve(new Map())
        try {
          const raw = JSON.parse(stdout) as Record<string, unknown>
          resolve(new Map(Object.entries(raw).filter((kv): kv is [string, string] => typeof kv[1] === 'string')))
        } catch {
          resolve(new Map())
        }
      }
    )
  })
}

/**
 * The picture the shell itself shows for a file or an Apps folder item (what Start and Explorer show), as a PNG data
 * URL, from the native helper. null if the helper isn't running or the shell has nothing.
 */
export async function shellIcon(path: string): Promise<string | null> {
  const r = await nativeCall('appicon', Buffer.from(path, 'utf8').toString('base64')).catch(() => null)
  return typeof r === 'string' && r.length < 200_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(r) ? `data:image/png;base64,${r}` : null
}

/** A small PNG data URL for the app's icon, or null (the renderer then shows a generic glyph). */
export async function getIcon(id: string): Promise<string | null> {
  if (iconCache.has(id)) return iconCache.get(id) ?? null
  const e = entries.get(id)
  if (!e) return null
  // The shell's own picture first: it gets right what reading the shortcut here misses (an icon file, a place inside
  // a dll, Steam and other launcher links, Windows tools that only exist in the Apps folder).
  const helper = nativeRunning()
  let icon = helper ? await shellIcon(e.kind === 'lnk' ? e.target : 'shell:AppsFolder\\' + e.target) : null
  if (icon) {
    iconCache.set(id, icon)
    return icon
  }
  try {
    if (e.kind === 'lnk') {
      // A shortcut often has no icon of its own (the shell then draws a blank page with an arrow), so ask where it
      // points: its icon file if it names one, else its target exe. Fall back to the shortcut itself.
      let src = e.target
      try {
        const link = shell.readShortcutLink(e.target)
        src = (link.icon || link.target || src).replace(/%([^%]+)%/g, (m, v: string) => process.env[v] ?? m)
      } catch {
        // Not a readable shortcut: use the file itself.
      }
      let img = await app.getFileIcon(src, { size: 'large' })
      if (img.isEmpty() && src !== e.target) img = await app.getFileIcon(e.target, { size: 'large' })
      if (!img.isEmpty()) icon = img.toDataURL()
    } else {
      storeLogos ??= loadStoreLogos()
      const path = (await storeLogos).get(e.target)
      if (path && path.toLowerCase().endsWith('.png')) {
        const img = nativeImage.createFromPath(path)
        if (!img.isEmpty()) icon = img.resize({ width: ICON_PX, height: ICON_PX, quality: 'best' }).toDataURL()
      }
    }
  } catch {
    // Unreadable shortcut or logo: fall through to null.
  }
  if (helper) iconCache.set(id, icon) // without the helper (still starting), ask again next time
  return icon
}

export async function launch(id: string): Promise<boolean> {
  const e = entries.get(id)
  if (!e) return false
  if (e.kind === 'lnk') {
    const err = await shell.openPath(e.target) // '' on success
    if (err) return false
  } else {
    // Argument array, no shell: the AppID is data, never parsed as a command line.
    const ok = await new Promise<boolean>((resolve) =>
      execFile('explorer.exe', ['shell:AppsFolder\\' + e.target], { windowsHide: true }, () => resolve(true))
    )
    if (!ok) return false
  }
  const s = await loadStore()
  s.recent = [id, ...s.recent.filter((x) => x !== id)].slice(0, MAX_RECENT)
  await saveStore()
  return true
}

export async function toggleStar(id: string): Promise<boolean> {
  if (!entries.has(id)) return false
  const s = await loadStore()
  s.starred = s.starred.includes(id) ? s.starred.filter((x) => x !== id) : [...s.starred, id]
  await saveStore()
  return s.starred.includes(id)
}

/** Moves a starred app one place earlier (-1) or later (1) in the dock; false if it isn't starred or is already at that end. */
export async function movePin(id: string, delta: -1 | 1): Promise<boolean> {
  const s = await loadStore()
  const i = s.starred.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= s.starred.length) return false
  ;[s.starred[i], s.starred[j]] = [s.starred[j], s.starred[i]]
  await saveStore()
  return true
}

// --- the dock: starred apps stay in it, and open windows join their app ---
const exeCache = new Map<string, string | null>()
/** The program a Start menu shortcut runs (lowercase), or null for Store apps and unreadable shortcuts. */
function exeOf(e: Entry): string | null {
  if (e.kind !== 'lnk') return null
  if (!exeCache.has(e.id)) {
    let exe: string | null = null
    try {
      const t = shell.readShortcutLink(e.target).target
      if (t && /\.exe$/i.test(t)) exe = t.replace(/%([^%]+)%/g, (m, v: string) => process.env[v] ?? m).toLowerCase()
    } catch {
      // Not a readable shortcut.
    }
    exeCache.set(e.id, exe)
  }
  return exeCache.get(e.id) ?? null
}

/** Starred apps, in the order they were starred. */
export async function pinnedApps(): Promise<{ id: string; name: string; exe: string | null }[]> {
  await ensureIndex()
  const s = await loadStore()
  return s.starred.flatMap((id) => {
    const e = entries.get(id)
    return e ? [{ id, name: e.name, exe: exeOf(e) }] : []
  })
}

/** The Start menu entry that runs this program, if any (so an open app can be pinned). */
export async function findByExe(exe: string): Promise<string | null> {
  await ensureIndex()
  const want = exe.toLowerCase()
  for (const e of entries.values()) if (exeOf(e) === want) return e.id
  return null
}

export async function isStarred(id: string): Promise<boolean> {
  return (await loadStore()).starred.includes(id)
}
