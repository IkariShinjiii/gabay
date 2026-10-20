import { app, clipboard, screen, shell } from 'electron'
import { homedir, release, userInfo } from 'node:os'

// Bug reports. A short in-memory log of errors (messages only, never content like clipboard text, notifications or
// calendar data), and a report a person can send: opened as a GitHub issue or copied to paste in a chat.
// User names and home paths are scrubbed from everything in it.

const REPO_ISSUES = 'https://github.com/IkariShinjiii/gabay/issues/new'
const MAX_LOG = 30
const log: string[] = []

function scrub(text: string): string {
  let t = text
  const home = homedir()
  if (home) t = t.split(home).join('~')
  try {
    const name = userInfo().username
    if (name && name.length > 2) t = t.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '<user>')
  } catch {
    // no user info: nothing to scrub
  }
  return t
}

export function logError(where: string, err: unknown): void {
  console.error(`[gabay] ${where}:`, err) // visible in dev; the scrubbed copy below is for bug reports
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  log.unshift(`${new Date().toISOString().slice(11, 19)} ${where}: ${scrub(msg).slice(0, 300)}`)
  log.length = Math.min(log.length, MAX_LOG)
}

export interface ReportContext {
  settings: Record<string, unknown>
  helperRunning: boolean
}

function buildReport(description: string, ctx: ReportContext): string {
  const s = ctx.settings
  const displays = screen.getAllDisplays().map((d) => `${d.size.width}x${d.size.height}@${d.scaleFactor}x${d.internal ? ' (built-in)' : ''}`)
  const lines = [
    '### What happened',
    scrub(description.trim()).slice(0, 2000) || '(no description)',
    '',
    '### Details',
    `- Gabay ${app.getVersion()} (Electron ${process.versions.electron}), Windows ${release()} ${process.arch}`,
    `- Displays: ${displays.join(', ')}`,
    `- Helper running: ${ctx.helperRunning ? 'yes' : 'no'}`,
    `- Settings: visibility=${String(s.visibility)}, reserveTop=${String(s.reserveTop)}, followMouse=${String(s.followMouse)}, notifications=${String(s.notifications)}, accent=${String(s.accent)}, lyrics=${String(s.lyrics)}, weather=${s.place ? 'on' : 'off'}`,
    '',
    '### Recent errors',
    log.length ? log.slice(0, 15).map((l) => `    ${l}`).join('\n') : '(none)'
  ]
  return lines.join('\n')
}

/** 'github' opens a prefilled issue in the browser; 'copy' puts the same text on the clipboard. */
export async function sendReport(description: unknown, how: unknown, ctx: ReportContext): Promise<boolean> {
  if (typeof description !== 'string' || description.length > 4000 || (how !== 'github' && how !== 'copy')) return false
  const body = buildReport(description, ctx)
  if (how === 'copy') {
    await clipboard.writeText(`Gabay bug report\n\n${body}`)
    return true
  }
  const title = scrub(description.trim().split(/\r?\n/)[0] ?? '').slice(0, 80) || 'Bug report'
  // Browsers cap URL length; shorten the body (never the encoded URL, which could cut an escape in half).
  let b = body
  let url = ''
  for (let i = 0; i < 20; i++) {
    url = `${REPO_ISSUES}?${new URLSearchParams({ title, body: b, labels: 'bug' })}`
    if (url.length <= 7500) break
    b = `${b.slice(0, Math.floor(b.length * 0.85))}\n…`
  }
  await shell.openExternal(url)
  return true
}
