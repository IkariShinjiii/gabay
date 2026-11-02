import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadWithProgress } from './download'

// Updates from this repository's GitHub releases. Nothing downloads or runs until the person presses Install (or, with
// automatic updates on, until they have been away for a few minutes). The
// installer must come from this repo's release downloads and match the SHA-512 that electron-builder wrote into the
// release's latest.yml; otherwise it is thrown away.

const REPO = 'IkariShinjiii/gabay'
const DOWNLOADS = `https://github.com/${REPO}/releases/download/`

export interface UpdateInfo {
  version: string
  notes: string
}

interface Asset {
  name: string
  browser_download_url: string
}

let found: { version: string; yml: string; exe: Asset } | null = null

const parts = (v: string): number[] => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
function newer(a: string, b: string): boolean {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

const fromRepo = (a: Asset | undefined): a is Asset => !!a && typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith(DOWNLOADS)

interface Release {
  tag_name?: unknown
  body?: unknown
  assets?: Asset[]
  draft?: unknown
}

/** Null when up to date, offline, or running from source. 'preview' also considers pre-releases, newest first. */
export async function checkUpdate(channel: 'stable' | 'preview' = 'stable'): Promise<UpdateInfo | null> {
  if (!app.isPackaged) return null
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases${channel === 'preview' ? '?per_page=10' : '/latest'}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Gabay' },
      signal: AbortSignal.timeout(15_000)
    })
    if (!res.ok) return null
    let rel: Release
    if (channel === 'preview') {
      const list = ((await res.json()) as Release[]).filter(
        (r) => r && r.draft !== true && typeof r.tag_name === 'string' && /^v?\d+\.\d+\.\d+$/.test(r.tag_name)
      )
      list.sort((a, b) => (newer(a.tag_name as string, b.tag_name as string) ? -1 : 1))
      if (!list[0]) return null
      rel = list[0]
    } else rel = (await res.json()) as Release
    const tag = typeof rel.tag_name === 'string' ? rel.tag_name : ''
    if (!/^v?\d+\.\d+\.\d+$/.test(tag) || !newer(tag, app.getVersion())) return null
    const assets = Array.isArray(rel.assets) ? rel.assets : []
    const yml = assets.find((a) => a.name === 'latest.yml')
    const exe = assets.find((a) => /^Gabay[ .-]Setup[ .-]\d+\.\d+\.\d+\.exe$/.test(a.name))
    if (!fromRepo(yml) || !fromRepo(exe)) return null
    found = { version: tag.replace(/^v/, ''), yml: yml.browser_download_url, exe }
    return { version: found.version, notes: typeof rel.body === 'string' ? rel.body.slice(0, 600) : '' }
  } catch {
    return null
  }
}

/** Where an install is: downloading (bytes so far of the total, 0 if unknown), checking the file, starting it, or failed. */
export interface UpdateProgress {
  version: string
  phase: 'downloading' | 'verifying' | 'installing' | 'failed'
  received: number
  total: number
}

let progress: UpdateProgress | null = null
let tell: (p: UpdateProgress) => void = () => undefined
/** Called with each step of an install, so the notch and Settings can show it. */
export function onUpdateProgress(fn: (p: UpdateProgress) => void): void {
  tell = fn
}
/** The install in progress (or the last one, if it failed); null when none has run. */
export const updateProgress = (): UpdateProgress | null => progress
const report = (p: UpdateProgress): void => {
  progress = p
  tell(p)
}

// One install at a time: pressing Install again (or the automatic install starting) joins the one already running.
let running: Promise<boolean> | null = null

/** Downloads, verifies and starts the installer, then quits so it can replace the app. False if anything is off. */
export function installUpdate(): Promise<boolean> {
  running ??= install().finally(() => {
    running = null
  })
  return running
}

async function install(): Promise<boolean> {
  const f = found
  if (!f || !app.isPackaged) return false
  const step = (phase: UpdateProgress['phase'], received: number, total: number): void => report({ version: f.version, phase, received, total })
  const fail = (): false => {
    step('failed', progress?.received ?? 0, progress?.total ?? 0)
    return false
  }
  try {
    step('downloading', 0, 0)
    const ymlRes = await net.fetch(f.yml, { signal: AbortSignal.timeout(30_000) })
    if (!ymlRes.ok) return fail()
    const yml = await ymlRes.text()
    const sha = /^sha512:\s*(\S+)/m.exec(yml)?.[1]
    if (!sha) return fail()
    // The size latest.yml gives, for the progress if the download doesn't say; a slow line may take its time, but one
    // that sends nothing for a minute has dropped.
    const size = Number(/^\s*size:\s*(\d+)/m.exec(yml)?.[1]) || 0
    const data = await downloadWithProgress((url, init) => net.fetch(url, init), f.exe.browser_download_url, {
      size,
      maxBytes: 400_000_000,
      stallMs: 60_000,
      totalMs: 60 * 60_000,
      onProgress: (received, total) => step('downloading', received, total)
    })
    if (!data) return fail()
    step('verifying', data.length, data.length)
    if (createHash('sha512').update(data).digest('base64') !== sha) return fail()
    const dir = await mkdtemp(join(tmpdir(), 'gabay-update-'))
    const exe = join(dir, `Gabay-Setup-${f.version}.exe`)
    await writeFile(exe, data)
    step('installing', data.length, data.length)
    // Silent install over the current one, then start the new version.
    spawn(exe, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    setTimeout(() => app.quit(), 500)
    return true
  } catch {
    return fail()
  }
}
