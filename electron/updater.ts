import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Updates from this repository's GitHub releases. Nothing downloads or runs until the person presses Install. The
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

/** Null when up to date, offline, or running from source. */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  if (!app.isPackaged) return null
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Gabay' },
      signal: AbortSignal.timeout(15_000)
    })
    if (!res.ok) return null
    const rel = (await res.json()) as { tag_name?: unknown; body?: unknown; assets?: Asset[] }
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

/** Downloads, verifies and starts the installer, then quits so it can replace the app. False if anything is off. */
export async function installUpdate(): Promise<boolean> {
  const f = found
  if (!f || !app.isPackaged) return false
  try {
    const yml = await (await net.fetch(f.yml, { signal: AbortSignal.timeout(30_000) })).text()
    const sha = /^sha512:\s*(\S+)/m.exec(yml)?.[1]
    if (!sha) return false
    const res = await net.fetch(f.exe.browser_download_url, { signal: AbortSignal.timeout(10 * 60_000) })
    if (!res.ok) return false
    const data = Buffer.from(await res.arrayBuffer())
    if (createHash('sha512').update(data).digest('base64') !== sha) return false
    const dir = await mkdtemp(join(tmpdir(), 'gabay-update-'))
    const exe = join(dir, `Gabay-Setup-${f.version}.exe`)
    await writeFile(exe, data)
    // Silent install over the current one, then start the new version.
    spawn(exe, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    setTimeout(() => app.quit(), 500)
    return true
  } catch {
    return false
  }
}
