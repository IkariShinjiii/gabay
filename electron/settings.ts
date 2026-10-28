import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { writeJsonAtomic } from './atomicWrite'
import { join } from 'node:path'

export interface Settings {
  hotkey: string
  collapseMs: number
  /** Electron display id, or null for the primary display. */
  displayId: number | null
  /** Move the notch to whichever display the pointer is on (displayId is then ignored). */
  followMouse: boolean
  /** Show new Windows notifications in the notch. */
  notifications: boolean
  /** Include the sender and message text; off shows only the app name. */
  notePreview: boolean
  /** Play a short sound with each notification while Windows' Do not disturb is on (Windows is silent then). */
  noteSound: boolean
  /** Reserve a band at the top of the screen so maximized windows sit below the notch. */
  reserveTop: boolean
  /** Accent colour: a preset name, or 'windows' for the Windows accent. */
  accent: string
  /** Weather location (found from a typed city), or null for no weather. */
  place: { name: string; lat: number; lon: number } | null
  /** Look up synced lyrics on lrclib.net (sends the song title and artist). */
  lyrics: boolean
  /** Do not disturb until this time (ms since epoch); 0 = off, Infinity is stored as -1 (until turned off). */
  dndUntil: number
  /** The first-run tour was shown (or skipped). */
  welcomed: boolean
  /** When to ask once for a review (ms); 0 = not scheduled yet, -1 = asked. */
  reviewAt: number
  /** The version whose "what's new" was last shown. */
  seenVersion: string
  /** 'always': shown, except while something is full screen. 'auto': off-screen until the pointer rests on the top edge. */
  visibility: 'always' | 'auto'
  /** Turn on the Windows taskbar's auto-hide and show open apps in the notch instead. */
  hideTaskbar: boolean
  /** With hideTaskbar: hide it outright, so it never slides up at the bottom edge. */
  taskbarFull: boolean
  /** Install updates by themselves while the person is away from the PC. */
  autoUpdate: boolean
  /** 'preview' also gets pre-releases (new versions before everyone else). */
  updateChannel: 'stable' | 'preview'
  /** The language of Gabay's own text. */
  language: 'en' | 'fil'
  /** Whether the taskbar was already auto-hiding before Gabay hid it (put back when hiding stops); null while not hiding.
   * Main's own bookkeeping: never taken from the renderer. */
  taskbarWasAutoHide: boolean | null
}

/** Never a Win-key combo (Windows reserves those). The first free one is used when the saved one is taken. */
export const HOTKEYS = ['Control+Alt+G', 'Control+Shift+G', 'Control+Alt+Space', 'Control+Alt+J']
export const ACCENTS = ['mint', 'windows', 'blue', 'purple', 'pink', 'orange', 'red', 'green']
export const COLLAPSE_MIN = 200
export const COLLAPSE_MAX = 1500

export const DEFAULTS: Settings = { hotkey: HOTKEYS[0], collapseMs: 400, displayId: null, followMouse: false, notifications: true, notePreview: true, noteSound: true, reserveTop: false, accent: 'mint', place: null, lyrics: false, dndUntil: 0, welcomed: false, reviewAt: 0, seenVersion: '', visibility: 'always', hideTaskbar: false, taskbarFull: false, taskbarWasAutoHide: null, autoUpdate: true, updateChannel: 'stable', language: 'en' }

const storePath = (): string => join(app.getPath('userData'), 'settings.json')

/** Coerce anything into a valid Settings. Unknown or out-of-range values fall back to the current/default value. */
export function sanitize(raw: unknown, base: Settings = DEFAULTS): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const hotkey = typeof r.hotkey === 'string' && HOTKEYS.includes(r.hotkey) ? r.hotkey : base.hotkey
  const collapseMs =
    typeof r.collapseMs === 'number' && Number.isFinite(r.collapseMs)
      ? Math.min(COLLAPSE_MAX, Math.max(COLLAPSE_MIN, Math.round(r.collapseMs)))
      : base.collapseMs
  const displayId =
    r.displayId === null ? null : typeof r.displayId === 'number' && Number.isInteger(r.displayId) ? r.displayId : base.displayId
  const visibility = r.visibility === 'always' || r.visibility === 'auto' ? r.visibility : base.visibility
  const followMouse = typeof r.followMouse === 'boolean' ? r.followMouse : base.followMouse
  const notifications = typeof r.notifications === 'boolean' ? r.notifications : base.notifications
  const notePreview = typeof r.notePreview === 'boolean' ? r.notePreview : base.notePreview
  const noteSound = typeof r.noteSound === 'boolean' ? r.noteSound : base.noteSound
  const reserveTop = typeof r.reserveTop === 'boolean' ? r.reserveTop : base.reserveTop
  const accent = typeof r.accent === 'string' && ACCENTS.includes(r.accent) ? r.accent : base.accent
  const p = r.place as Record<string, unknown> | null | undefined
  const place =
    p === null
      ? null
      : p && typeof p.name === 'string' && typeof p.lat === 'number' && typeof p.lon === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
        ? { name: p.name.slice(0, 80), lat: p.lat, lon: p.lon }
        : base.place
  const lyrics = typeof r.lyrics === 'boolean' ? r.lyrics : base.lyrics
  const dndUntil = typeof r.dndUntil === 'number' && (r.dndUntil === -1 || r.dndUntil >= 0) ? r.dndUntil : base.dndUntil
  const welcomed = typeof r.welcomed === 'boolean' ? r.welcomed : base.welcomed
  const reviewAt = typeof r.reviewAt === 'number' && Number.isFinite(r.reviewAt) && (r.reviewAt === -1 || r.reviewAt >= 0) ? r.reviewAt : base.reviewAt
  const seenVersion = typeof r.seenVersion === 'string' && /^\d+\.\d+\.\d+$/.test(r.seenVersion) ? r.seenVersion : base.seenVersion
  const hideTaskbar = typeof r.hideTaskbar === 'boolean' ? r.hideTaskbar : base.hideTaskbar
  const taskbarFull = typeof r.taskbarFull === 'boolean' ? r.taskbarFull : base.taskbarFull
  const taskbarWasAutoHide =
    r.taskbarWasAutoHide === null || typeof r.taskbarWasAutoHide === 'boolean' ? r.taskbarWasAutoHide : base.taskbarWasAutoHide
  const autoUpdate = typeof r.autoUpdate === 'boolean' ? r.autoUpdate : base.autoUpdate
  const updateChannel = r.updateChannel === 'stable' || r.updateChannel === 'preview' ? r.updateChannel : base.updateChannel
  const language = r.language === 'en' || r.language === 'fil' ? r.language : base.language
  return { hotkey, collapseMs, displayId, followMouse, notifications, notePreview, noteSound, reserveTop, accent, place, lyrics, dndUntil, welcomed, reviewAt, seenVersion, visibility, hideTaskbar, taskbarFull, taskbarWasAutoHide, autoUpdate, updateChannel, language }
}

export async function loadSettings(): Promise<Settings> {
  try {
    return sanitize(JSON.parse(await readFile(storePath(), 'utf8')))
  } catch {
    return { ...DEFAULTS }
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await writeJsonAtomic(storePath(), s)
}
