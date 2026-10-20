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
  /** 'always': shown, except while something is full screen. 'auto': off-screen until the pointer rests on the top edge. */
  visibility: 'always' | 'auto'
}

/** Never a Win-key combo (Windows reserves those). The first free one is used when the saved one is taken. */
export const HOTKEYS = ['Control+Alt+G', 'Control+Shift+G', 'Control+Alt+Space', 'Control+Alt+J']
export const COLLAPSE_MIN = 200
export const COLLAPSE_MAX = 1500

const DEFAULTS: Settings = { hotkey: HOTKEYS[0], collapseMs: 400, displayId: null, followMouse: false, notifications: true, notePreview: true, visibility: 'always' }

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
  return { hotkey, collapseMs, displayId, followMouse, notifications, notePreview, visibility }
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
