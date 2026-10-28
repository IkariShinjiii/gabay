import { createHash } from 'node:crypto'
import { app, BrowserWindow, powerMonitor, globalShortcut, ipcMain, Menu, nativeImage, screen, session, shell, systemPreferences, Tray } from 'electron'
import { execFile } from 'node:child_process'
import os from 'node:os'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getStats } from './stats'
import { nativeCall, nativeRunning, startNative, stopNative } from './native'
import { logError, sendReport } from './diagnostics'
import { connectWifi, disconnectWifi, listWifi } from './wifi'
import { getAgenda, setCalendarUrl } from './calendar'
import { checkUpdate, installUpdate, type UpdateInfo } from './updater'
import { isRecording, recordingChunk, recordingStart, recordingStop, screenSource, screenshot } from './capture'
import { findPlace, getWeather } from './weather'
import { startDownloads, stopDownloads } from './downloads'
import { getLyrics } from './lyrics'
import { currentProjectMode, isProjectMode, setProjectMode } from './project'
import { isSettingsKey, networkKind, quickGet, quickPeek, quickSet, quickSlide, SETTINGS_PAGES, stopQuick } from './quick'
import { COLLAPSE_MAX, COLLAPSE_MIN, DEFAULTS, HOTKEYS, loadSettings, sanitize, saveSettings, type Settings } from './settings'
import { getNotes, setNotes } from './notes'
import { ensureIndex, findByExe, getIcon, isStarred, launch, movePin, pinnedApps, search, toggleStar } from './launcher'
import { isPowerAction, runPower } from './power'
import { addTodo, listTodos, removeTodo, toggleTodo } from './todos'
import { clearHistory, copyBack, listClipboard, setClipboardGuard, startClipboardHistory, stopClipboardHistory, togglePin } from './clipboardHistory'

// Software rendering. The GPU process alone cost ~110 MB of private memory (about 134 MB vs 16 MB) for a 520x400
// overlay, with no measurable CPU difference for our animations (see docs/PERFORMANCE.md). Set GABAY_GPU=1 to
// turn hardware acceleration back on, e.g. to compare. Must run before the app is ready.
if (process.env['GABAY_GPU'] !== '1') app.disableHardwareAcceleration()
// A tiny always-on overlay needs none of these: occlusion tracking polls every window on the desktop, and the spare
// renderer is a whole idle process kept ready for navigations that never happen.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,SpareRendererForSitePerProcess')

// Dev-only preview: GABAY_PREVIEW=<tab> renders the expanded panel in a hidden window, saves a screenshot to
// GABAY_PREVIEW_OUT and quits. It never shows a window, registers no hotkey or tray icon, never reads the clipboard
// and uses a throwaway data folder, so it can run while the real Gabay is in use without touching input or data.
const PREVIEW = app.isPackaged ? undefined : process.env['GABAY_PREVIEW']
if (PREVIEW) app.setPath('userData', join(app.getPath('temp'), 'gabay-preview'))

// One notch at a time. A second launch (login item plus a manual start, say) hands over to the first and exits.
const gotLock = PREVIEW ? true : app.requestSingleInstanceLock()
if (!gotLock) app.quit()

// Registered at module level so a second launch during startup isn't missed. summonNow is set once the window exists.
let summonNow: (() => void) | null = null
let summonPending = false
app.on('second-instance', () => {
  if (summonNow) summonNow()
  else summonPending = true
})

const WIN_WIDTH = 560
const WIN_HEIGHT = 700 // the tallest panel (with the dock) plus room for the shadow

/** The chosen display, or the primary one if it is unset or no longer attached. */
function pickDisplay(id: number | null): Electron.Display {
  return screen.getAllDisplays().find((d) => d.id === id) ?? screen.getPrimaryDisplay()
}

/** The display the notch belongs on: under the pointer when following the mouse, else the chosen one. */
function targetDisplay(s: { displayId: number | null; followMouse: boolean }): Electron.Display {
  return s.followMouse ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) : pickDisplay(s.displayId)
}

/** Top-center of a display. `bounds` (not `workArea`) so y = 0 is the true top edge, wherever the taskbar sits. */
function notchBounds(display: Electron.Display): Electron.Rectangle {
  const { x, y, width } = display.bounds
  return { x: Math.round(x + (width - WIN_WIDTH) / 2), y, width: WIN_WIDTH, height: WIN_HEIGHT }
}

function createOverlay(display: Electron.Display): BrowserWindow {
  const { x, y } = notchBounds(display)

  const win = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    x,                           // horizontally centered on the chosen display
    y,                           // top edge of that display
    frame: false,                // no title bar / borders
    show: !PREVIEW,
    transparent: true,           // per-pixel alpha; needs frame:false
    backgroundColor: '#00000000',// fully transparent background
    hasShadow: false,            // no OS drop shadow around the (mostly empty) window
    resizable: false,            // fixed size; the notch animates INSIDE this window later
    alwaysOnTop: true,
    skipTaskbar: true,           // no taskbar button
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false, // no dictionaries loaded: Gabay's fields are search boxes, not prose
      // Hidden preview windows would otherwise get throttled animation frames, freezing springs mid-way.
      backgroundThrottling: !PREVIEW
    }
  })

  // "screen-saver" is the highest always-on-top level Electron exposes. On Windows this maps
  // to a topmost window; whether it beats full-screen apps is exactly what the kill test checks.
  win.setAlwaysOnTop(true, 'screen-saver')

  // Start click-through. `forward: true` still delivers mousemove to the renderer
  // (Windows/macOS only), which is how the renderer knows when the pointer reaches the notch.
  win.setIgnoreMouseEvents(true, { forward: true })

  // Hardening: the overlay only ever shows our own UI. Refuse new windows and any navigation away
  // from the page we loaded, so injected or linked content can't take over a topmost, mouse-capturing window.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  const hash = PREVIEW ? `preview=${PREVIEW}` : '' // dev-only env value, e.g. Quick or Quick&sub=project
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? '#' + hash : ''))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }

  if (PREVIEW) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const out = process.env['GABAY_PREVIEW_OUT']
        if (out) writeFileSync(out, (await win.webContents.capturePage()).toPNG())
        app.quit()
      }, Number(process.env['GABAY_PREVIEW_WAIT'] ?? 2500))
    })
  }

  return win
}

let tray: Tray | null = null // module-level so it isn't garbage-collected (the icon would vanish)

// Errors are kept (scrubbed, messages only) for bug reports; Gabay keeps running rather than showing a crash dialog.
process.on('uncaughtException', (e) => logError('main', e))
process.on('unhandledRejection', (e) => logError('main (async)', e))

app.whenReady().then(async () => {
  if (!gotLock) return
  let settings = await loadSettings()
  // Ask for a review once, three days after the first start.
  if (settings.reviewAt === 0 && !PREVIEW) {
    settings = { ...settings, reviewAt: Date.now() + 3 * 86_400_000 }
    void saveSettings(settings)
  }
  const win = createOverlay(targetDisplay(settings))
  let mouseLocked = false

  // Renderer reports whether the pointer is over the notch.
  // true  -> window captures the mouse (interactive)
  // false -> mouse passes through to whatever is underneath (click-through)
  ipcMain.on('overlay:set-interactive', (event, interactive: unknown) => {
    if (event.sender !== win.webContents || typeof interactive !== 'boolean') return
    if (mouseLocked) return // a game has the mouse: nothing on the notch may take it
    if (interactive) win.setIgnoreMouseEvents(false)
    else {
      win.setIgnoreMouseEvents(true, { forward: true })
      // Hand keyboard focus back to the app underneath if a summon had given it to us.
      if (win.isFocused()) win.blur()
    }
  })

  // Launcher. The renderer only ever handles opaque ids; paths stay in the main process.
  const fromUi = (e: Electron.IpcMainInvokeEvent): void => {
    if (e.sender !== win.webContents) throw new Error('forbidden')
  }
  ipcMain.handle('launcher:search', (e, q: unknown) => {
    fromUi(e)
    return search(typeof q === 'string' ? q : '')
  })
  ipcMain.handle('launcher:icon', (e, id: unknown) => {
    fromUi(e)
    return typeof id === 'string' ? getIcon(id) : null
  })
  ipcMain.handle('launcher:launch', (e, id: unknown) => {
    fromUi(e)
    return typeof id === 'string' ? launch(id) : false
  })
  ipcMain.handle('launcher:toggle-star', (e, id: unknown) => {
    fromUi(e)
    if (typeof id !== 'string') return false
    // Starred apps are the dock's pinned apps.
    return toggleStar(id).then((on) => {
      if (settings.hideTaskbar) void pushWins()
      return on
    })
  })
  ipcMain.handle('power:run', (e, action: unknown) => {
    fromUi(e)
    return isPowerAction(action) ? runPower(action) : false
  })
  ipcMain.handle('clipboard:list', (e, q: unknown) => {
    fromUi(e)
    return listClipboard(typeof q === 'string' ? q : '')
  })
  ipcMain.handle('clipboard:copy', (e, id: unknown) => {
    fromUi(e)
    return typeof id === 'string' ? copyBack(id) : false
  })
  ipcMain.handle('clipboard:toggle-pin', (e, id: unknown) => {
    fromUi(e)
    return typeof id === 'string' ? togglePin(id) : false
  })
  ipcMain.handle('clipboard:clear', (e) => {
    fromUi(e)
    clearHistory()
  })
  ipcMain.handle('todos:list', (e) => {
    fromUi(e)
    return listTodos()
  })
  ipcMain.handle('todos:add', (e, text: unknown) => {
    fromUi(e)
    return addTodo(typeof text === 'string' ? text : '')
  })
  ipcMain.handle('todos:toggle', (e, id: unknown) => {
    fromUi(e)
    return toggleTodo(typeof id === 'string' ? id : '')
  })
  ipcMain.handle('todos:remove', (e, id: unknown) => {
    fromUi(e)
    return removeTodo(typeof id === 'string' ? id : '')
  })
  setClipboardGuard(
    async () => (await nativeCall('clipok')) !== false,
    async () => {
      const n = await nativeCall('clipseq')
      return typeof n === 'number' ? n : null
    }
  )
  if (!PREVIEW) startClipboardHistory()
  // Native helper: full screen on the notch's display, now playing, notifications, windows, volume, Bluetooth.
  const send = (channel: string, value: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, value)
  }
  const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  let fsNow = false
  // Whether Windows lets Gabay read notifications; null until the helper reports.
  let noteAccess: string | null = null
  let media: Record<string, unknown> | null = null
  // Open windows for the dock row (only while the taskbar is hidden). Paths stay here; the renderer gets icons.
  type Win = { id: string; title: string; path: string | null; minimized: boolean; active: boolean; attention: boolean }
  let openWins: Win[] = []
  // Other apps' tray icons (while Gabay is the notification area). Checked here: they come from any app on the PC.
  type Tray = { id: string; tip: string; icon: string }
  let trayIcons: Tray[] = []
  const takeTray = (raw: unknown): Tray[] => {
    if (!Array.isArray(raw)) return []
    const out: Tray[] = []
    for (const t of raw.slice(0, 64) as Record<string, unknown>[]) {
      if (!t || typeof t !== 'object') continue
      const id = typeof t.id === 'string' && /^(?:[0-9a-f]{32}|-?\d{1,20}-\d{1,10})$/.test(t.id) ? t.id : null
      const icon = typeof t.icon === 'string' && t.icon.length < 60_000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(t.icon) ? t.icon : null
      if (id && icon) out.push({ id, tip: str(t.tip, 128) ?? '', icon })
    }
    return out
  }
  const winIcons = new Map<string, string | null>()
  const iconFor = async (path: string | null): Promise<string | null> => {
    if (!path) return null
    if (!winIcons.has(path)) {
      if (winIcons.size > 200) winIcons.clear()
      winIcons.set(path, await app.getFileIcon(path, { size: 'normal' }).then((i) => i.toDataURL(), () => null))
    }
    return winIcons.get(path) ?? null
  }
  const takeWins = (raw: unknown): Win[] =>
    (Array.isArray(raw) ? raw : []).flatMap((w: Record<string, unknown>) =>
      w && typeof w.h === 'string' && /^\d{1,20}$/.test(w.h)
        ? [{ id: w.h, title: str(w.t, 200) ?? '', path: typeof w.p === 'string' ? w.p : null, minimized: w.min === true, active: w.fg === true, attention: w.flash === true }]
        : []
    ).slice(0, 40)
  // The dock: starred apps first (open or not), then other open apps in the order they were last used. Windows of the
  // same program share one icon. Keys are opaque; program paths stay here.
  type DockGroup = { key: string; name: string; path: string | null; launchId: string | null; wins: Win[] }
  let dockGroups: DockGroup[] = []
  const keyOf = (path: string): string => 'g' + createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 12)
  const buildDock = async (): Promise<DockGroup[]> => {
    const pins = await pinnedApps().catch(() => [])
    const groups: DockGroup[] = pins.map((p) => ({ key: 'p' + p.id, name: p.name, path: p.exe, launchId: p.id, wins: [] }))
    for (const w of openWins) {
      const exe = w.path?.toLowerCase() ?? null
      let g = exe ? groups.find((x) => x.path?.toLowerCase() === exe) : undefined
      if (!g) {
        const base = w.path ? (w.path.split(/[\\/]/).pop() ?? '').replace(/\.exe$/i, '') : ''
        g = { key: w.path ? keyOf(w.path) : 'w' + w.id, name: base || w.title, path: w.path, launchId: null, wins: [] }
        groups.push(g)
      }
      g.wins.push(w)
    }
    return groups
  }
  const winsForUi = async (): Promise<unknown[]> => {
    dockGroups = await buildDock()
    return Promise.all(
      dockGroups.map(async (g) => ({
        key: g.key,
        name: g.name,
        pinned: g.launchId !== null,
        icon: (g.launchId ? await getIcon(g.launchId).catch(() => null) : null) ?? (await iconFor(g.path)),
        wins: g.wins.map(({ path, ...w }) => w)
      }))
    )
  }
  const pushWins = async (): Promise<void> => send('overlay:windows', await winsForUi())
  {
    void startNative({
      fullscreen: (r, captured) => {
        let fs = false
        // A game holding the mouse (hidden or locked pointer): the window stops listening to the pointer altogether.
        const locked = captured
        if (locked !== mouseLocked) {
          mouseLocked = locked
          if (locked) win.setIgnoreMouseEvents(true)
          else win.setIgnoreMouseEvents(true, { forward: true })
        }
        if (r) {
          // Physical pixels -> DIP, then: is the full-screen monitor the one the notch is on?
          const dip = screen.screenToDipRect(null, { x: r.l, y: r.t, width: r.r - r.l, height: r.b - r.t })
          const d = targetDisplay(settings).bounds
          const cx = dip.x + dip.width / 2
          const cy = dip.y + dip.height / 2
          fs = cx >= d.x && cx < d.x + d.width && cy >= d.y && cy < d.y + d.height
        }
        if (fs !== fsNow) send('overlay:fullscreen', (fsNow = fs))
      },
      media: (raw) => {
        const m = raw as Record<string, unknown> | null
        if (!m || typeof m !== 'object') media = null
        else {
          // Art arrives only when the track changes; keep the last one otherwise. Only image data URLs pass.
          const art = typeof m.art === 'string' ? (/^image\/(png|jpeg|jpg|gif|bmp|webp);base64,[A-Za-z0-9+/=]+$/.test(m.art) ? `data:${m.art}` : '') : (media?.art ?? '')
          media = {
            title: str(m.title, 200) ?? '',
            artist: str(m.artist, 200) ?? '',
            app: str(m.app, 200) ?? '',
            playing: m.playing === true,
            duration: typeof m.duration === 'number' ? m.duration : 0,
            art
          }
        }
        send('overlay:media', media)
      },
      tray: (raw) => {
        trayIcons = settings.hideTaskbar && settings.trayIcons ? takeTray(raw) : []
        send('overlay:tray', trayIcons)
      },
      windows: (raw) => {
        openWins = settings.hideTaskbar ? takeWins(raw) : []
        void pushWins()
      },
      noteAccess: (status) => {
        noteAccess = /^[A-Za-z]+$/.test(status) ? status : null
      },
      privacy: (raw) => {
        const r = raw as { mic?: unknown; cam?: unknown } | null
        const names = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap((x) => (typeof x === 'string' ? [x.slice(0, 60)] : [])).slice(0, 8) : [])
        send('overlay:privacy', { mic: names(r?.mic), cam: names(r?.cam) })
      },
      note: async (raw) => {
        if (!settings.notifications || !raw || typeof raw !== 'object') return
        const quiet = settings.dndUntil === -1 || Date.now() < settings.dndUntil // do not disturb: listed in the inbox, not shown
        const n = raw as Record<string, unknown>
        const appName = str(n.app, 80) ?? 'Notification'
        // Windows is silent while its Do not disturb is on, so Gabay plays the sound instead (if wanted).
        const sound = !quiet && settings.noteSound && (await nativeCall('dnd').catch(() => null)) === true
        const id = typeof n.id === 'number' && Number.isInteger(n.id) && n.id >= 0 ? n.id : undefined
        send('overlay:note', settings.notePreview ? { id, app: appName, title: str(n.title, 120), body: str(n.body, 240), sound, quiet } : { id, app: appName, title: null, body: null, sound, quiet })
      }
    }, () => {
      void nativeCall('notes', settings.notifications && !PREVIEW ? 'on' : 'off')
      applyReserve()
      void applyTaskbar()
    })
  }
  ipcMain.handle('presence:wait', (e) => {
    fromUi(e)
    return new Promise<boolean>((resolve) => {
      const check = (): void => {
        if (powerMonitor.getSystemIdleTime() < 5) resolve(true)
        else setTimeout(check, 2000)
      }
      check()
    })
  })
  ipcMain.handle('tray:get', (e) => {
    fromUi(e)
    return trayIcons
  })
  ipcMain.handle('tray:click', (e, id: unknown, button: unknown) => {
    fromUi(e)
    // only an icon the helper listed, and only a left or right click
    if (typeof id !== 'string' || !trayIcons.some((t) => t.id === id) || (button !== 'l' && button !== 'r')) return false
    return nativeCall('trayclick', `${id} ${button}`)
  })
  ipcMain.handle('windows:get', async (e) => {
    fromUi(e)
    if (!settings.hideTaskbar) return []
    // Asked when the panel opens: catches what no shell message reports (a switch of virtual desktop).
    const raw = await nativeCall('windows')
    if (raw) openWins = takeWins(raw)
    return winsForUi()
  })
  ipcMain.handle('windows:click', async (e, id: unknown) => {
    fromUi(e)
    const w = openWins.find((x) => x.id === id) // only windows Gabay listed
    if (!w) return false
    return (await nativeCall(w.active && !w.minimized ? 'minimize' : 'focus', w.id)) === true
  })
  ipcMain.handle('windows:launch', async (e, key: unknown) => {
    fromUi(e)
    const g = dockGroups.find((x) => x.key === key)
    if (!g) return false
    if (g.launchId) return launch(g.launchId)
    return g.path ? (await shell.openPath(g.path)) === '' : false
  })
  // Show desktop (minimize or restore every window), the taskbar's far corner. A fixed command: nothing from the UI is used.
  ipcMain.handle('desktop:toggle', (e) => {
    fromUi(e)
    return new Promise<boolean>((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', '(New-Object -ComObject Shell.Application).ToggleDesktop()'], { windowsHide: true, timeout: 10_000 }, (err) => resolve(!err))
    })
  })
  // Right-click on a dock icon: a native menu, so it can spill outside the notch.
  ipcMain.handle('windows:menu', async (e, key: unknown) => {
    fromUi(e)
    const g = dockGroups.find((x) => x.key === key)
    if (!g) return false
    const pinId = g.launchId ?? (g.path ? await findByExe(g.path) : null)
    const pinned = pinId ? await isStarred(pinId) : false
    const items: Electron.MenuItemConstructorOptions[] = []
    if (g.launchId || g.path) {
      items.push({
        label: g.wins.length ? 'Open new window' : 'Open',
        click: () => void (g.launchId ? launch(g.launchId) : g.path ? shell.openPath(g.path) : undefined)
      })
    }
    if (pinId) {
      items.push({
        label: pinned ? 'Unpin from dock' : 'Pin to dock',
        click: () => void toggleStar(pinId).then(() => pushWins())
      })
    }
    if (pinId && pinned) {
      items.push({ label: 'Move left', click: () => void movePin(pinId, -1).then(() => pushWins()) })
      items.push({ label: 'Move right', click: () => void movePin(pinId, 1).then(() => pushWins()) })
    }
    if (g.wins.length) {
      items.push({ type: 'separator' })
      items.push({
        label: g.wins.length > 1 ? `Close all ${g.wins.length} windows` : 'Close window',
        click: () => {
          for (const w of g.wins) void nativeCall('close', w.id)
        }
      })
    }
    if (!items.length) return false
    // Resolves when the menu closes, so the panel can stay open while it's up.
    return new Promise<boolean>((resolve) => Menu.buildFromTemplate(items).popup({ window: win, callback: () => resolve(true) }))
  })
  // Microphone mute: the default recording device. null when the PC has none.
  ipcMain.handle('mic:get', async (e) => {
    fromUi(e)
    const r = await nativeCall('micget').catch(() => null)
    return typeof r === 'boolean' ? r : null
  })
  ipcMain.handle('mic:set', async (e, muted: unknown) => {
    fromUi(e)
    if (typeof muted !== 'boolean') return null
    const r = await nativeCall('micset', muted ? 'mute' : 'unmute').catch(() => null)
    return typeof r === 'boolean' ? r : null
  })
  ipcMain.handle('media:get', (e) => {
    fromUi(e)
    return media
  })
  ipcMain.handle('media:command', (e, c: unknown) => {
    fromUi(e)
    return c === 'toggle' || c === 'next' || c === 'prev' ? nativeCall('media', c) : false
  })
  ipcMain.handle('volume:nudge', async (e, delta: unknown) => {
    fromUi(e)
    if (typeof delta !== 'number' || !Number.isFinite(delta)) return null
    const now = (await nativeCall('volget')) as { volume?: number } | null
    if (typeof now?.volume !== 'number') return null
    return nativeCall('vol', String(Math.round(Math.max(0, Math.min(100, now.volume + Math.max(-20, Math.min(20, delta)))))))
  })

  ipcMain.handle('media:seek', (e, seconds: unknown) => {
    fromUi(e)
    return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? nativeCall('seek', seconds.toFixed(2)) : false
  })

  // Sound output: the playback devices, and switching the default. Ids are Windows' own endpoint ids (checked again by the helper).
  ipcMain.handle('output:list', async (e) => {
    fromUi(e)
    const raw = await nativeCall('outlist')
    if (!Array.isArray(raw)) return []
    return raw.flatMap((d: Record<string, unknown>) =>
      typeof d.id === 'string' && /^\{[0-9A-Fa-f.]+\}\.\{[0-9A-Fa-f-]+\}$/.test(d.id)
        ? [{ id: d.id, name: str(d.name, 120) ?? 'Speakers', kind: d.kind === 'headphones' || d.kind === 'display' ? d.kind : 'speakers', current: d.current === true }]
        : []
    )
  })
  ipcMain.handle('output:set', async (e, id: unknown) => {
    fromUi(e)
    if (typeof id !== 'string' || !/^\{[0-9A-Fa-f.]+\}\.\{[0-9A-Fa-f-]+\}$/.test(id)) return false
    return (await nativeCall('outset', id)) === true
  })

  // Per-app volume. Ids are process ids from the last listing; exe paths stay here (for icons).
  let mixerPaths = new Map<number, string>()
  ipcMain.handle('mixer:list', async (e) => {
    fromUi(e)
    const raw = await nativeCall('mixer')
    if (!Array.isArray(raw)) return []
    const next = new Map<number, string>()
    const list = raw.flatMap((a: Record<string, unknown>) => {
      if (typeof a.pid !== 'number' || !Number.isInteger(a.pid) || a.pid < 0) return []
      if (typeof a.path === 'string') next.set(a.pid, a.path)
      return [{ pid: a.pid, name: str(a.name, 80) ?? 'App', volume: typeof a.volume === 'number' ? a.volume : 100 }]
    })
    mixerPaths = next
    return list
  })
  ipcMain.handle('mixer:icon', async (e, pid: unknown) => {
    fromUi(e)
    const path = typeof pid === 'number' ? mixerPaths.get(pid) : undefined
    if (!path) return null
    try {
      return (await app.getFileIcon(path, { size: 'normal' })).toDataURL()
    } catch {
      return null
    }
  })
  ipcMain.handle('mixer:set', (e, pid: unknown, volume: unknown) => {
    fromUi(e)
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid < 0 || typeof volume !== 'number' || !Number.isFinite(volume)) return false
    return nativeCall('appvol', `${pid} ${Math.round(Math.max(0, Math.min(100, volume)))}`)
  })

  // Screenshots and recording. Gabay hides itself from the capture (content protection), so the notch isn't in it.
  ipcMain.handle('capture:shot', async (e) => {
    fromUi(e)
    win.setContentProtection(true)
    try {
      const r = await screenshot(targetDisplay(settings))
      return r ? { thumb: r.thumb } : null
    } finally {
      if (!isRecording()) win.setContentProtection(false)
    }
  })
  ipcMain.handle('capture:snip', (e) => {
    fromUi(e)
    return shell.openExternal('ms-screenclip:').then(() => true, () => false)
  })
  // getDisplayMedia from the renderer is answered only while a recording was started from Gabay's own UI.
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    const own = win.webContents.mainFrame
    if (!isRecording() || req.frame?.processId !== own.processId || req.frame?.routingId !== own.routingId) return cb({})
    void screenSource(targetDisplay(settings)).then((video) => (video ? cb({ video, audio: 'loopback' }) : cb({})))
  })
  ipcMain.handle('rec:start', async (e) => {
    fromUi(e)
    const ok = await recordingStart()
    if (ok) win.setContentProtection(true)
    return ok
  })
  ipcMain.on('rec:chunk', (e, data: unknown) => {
    if (e.sender !== win.webContents) return
    recordingChunk(data)
  })
  ipcMain.handle('rec:stop', async (e) => {
    fromUi(e)
    const file = await recordingStop()
    win.setContentProtection(false)
    return !!file
  })

  // Weather, downloads, lyrics, accent.
  ipcMain.handle('weather:get', (e) => {
    fromUi(e)
    return getWeather(settings.place)
  })
  ipcMain.handle('weather:find', async (e, city: unknown) => {
    fromUi(e)
    const place = await findPlace(city)
    if (!place) return null
    settings = sanitize({ place }, settings)
    await saveSettings(settings)
    return place
  })
  if (!PREVIEW)
    startDownloads(
      (d) => send('overlay:download', d),
      (name) => send('overlay:download-done', name.slice(0, 200))
    )
  ipcMain.handle('lyrics:get', (e, title: unknown, artist: unknown, duration: unknown) => {
    fromUi(e)
    return settings.lyrics ? getLyrics(title, artist, duration) : null
  })
  // If the notch's page crashes or is killed, bring it back instead of leaving an empty overlay.
  // At most 3 reloads a minute, so a page that crashes on start can't spin forever.
  let reloads: number[] = []
  win.webContents.on('render-process-gone', (_e, details) => {
    logError('notch page', `gone: ${details.reason}`)
    // A recording from the old page can't continue: finish its file and give the capture state back.
    if (isRecording()) void recordingStop().then(() => !win.isDestroyed() && win.setContentProtection(false))
    const now = Date.now()
    reloads = reloads.filter((t) => now - t < 60_000)
    if (details.reason === 'clean-exit' || win.isDestroyed() || reloads.length >= 3) return
    reloads.push(now)
    setTimeout(() => !win.isDestroyed() && win.reload(), 1000)
  })
  ipcMain.on('log:error', (e, msg: unknown) => {
    if (e.sender !== win.webContents || typeof msg !== 'string') return
    logError('notch page', msg.slice(0, 300))
  })
  ipcMain.handle('review:open', (e) => {
    fromUi(e)
    return shell.openExternal('https://github.com/IkariShinjiii/gabay/issues/new?template=review.yml').then(() => true, () => false)
  })
  ipcMain.handle('bug:report', (e, description: unknown, how: unknown) => {
    fromUi(e)
    return sendReport(description, how, { settings: settings as unknown as Record<string, unknown>, helperRunning: nativeRunning() })
  })

  ipcMain.handle('theme:accent', (e) => {
    fromUi(e)
    try {
      return `#${systemPreferences.getAccentColor().slice(0, 6)}`
    } catch {
      return null
    }
  })

  ipcMain.handle('bt:list', async (e) => {
    fromUi(e)
    const raw = await nativeCall('bt')
    return Array.isArray(raw)
      ? raw.flatMap((d: Record<string, unknown>) => (str(d.name, 120) ? [{ name: str(d.name, 120), connected: d.connected === true }] : []))
      : []
  })
  ipcMain.handle('wifi:list', (e) => {
    fromUi(e)
    return listWifi()
  })
  ipcMain.handle('wifi:connect', (e, ssid: unknown) => {
    fromUi(e)
    return connectWifi(ssid)
  })
  ipcMain.handle('wifi:disconnect', (e) => {
    fromUi(e)
    return disconnectWifi()
  })
  ipcMain.handle('calendar:get', (e, force: unknown) => {
    fromUi(e)
    return getAgenda(force === true)
  })
  ipcMain.handle('calendar:set', (e, url: unknown) => {
    fromUi(e)
    return setCalendarUrl(url)
  })

  // Updates: checked shortly after start and every hour. With auto-update on (the default), a found update installs
  // by itself once the person has been away from the keyboard and mouse for 3 minutes, with nothing full screen and
  // no recording running; Gabay restarts on the new version and says what's new. Otherwise it waits to be installed.
  let update: UpdateInfo | null = null
  let autoInstalling = false
  const lookForUpdate = async (): Promise<void> => {
    const u = await checkUpdate(settings.updateChannel)
    if (u && u.version !== update?.version) send('overlay:update', u)
    update = u
  }
  const AWAY_S = 180
  if (!PREVIEW && app.isPackaged) {
    setTimeout(() => void lookForUpdate(), 20_000)
    setInterval(() => void lookForUpdate(), 3_600_000)
    setInterval(() => {
      if (!update || autoInstalling || !settings.autoUpdate || fsNow || mouseLocked || isRecording()) return
      if (powerMonitor.getSystemIdleTime() < AWAY_S) return
      autoInstalling = true
      void installUpdate().then((ok) => {
        if (!ok) setTimeout(() => (autoInstalling = false), 3_600_000) // try again in an hour
      })
    }, 30_000)
  }
  ipcMain.handle('update:get', async (e, check: unknown) => {
    fromUi(e)
    if (check === true) await lookForUpdate()
    return { current: app.getVersion(), available: update, packaged: app.isPackaged }
  })
  ipcMain.handle('update:install', (e) => {
    fromUi(e)
    return installUpdate()
  })
  void ensureIndex() // warm the Start Menu index so the first search is instant
  // One snapshot shortly after start, so the first Controls tab opens with real values instead of a spinner.
  if (!PREVIEW) setTimeout(() => void quickGet().catch(() => null), 3000)

  // Global hotkey summons the panel with the search field focused. Never a Win-key combo (Windows reserves
  // those). Ctrl+Alt+Space is already taken by the Claude desktop app on this machine, so the saved choice is
  // tried first, then the other candidates. register() returns false if another app owns the combo.
  const summon = (): void => {
    // A game has the mouse: taking focus now would throw the player out of the match.
    if (mouseLocked) return
    // The window is click-through by default and unfocused; make it take input before the renderer opens.
    win.setIgnoreMouseEvents(false)
    win.focus()
    win.webContents.send('overlay:summon')
  }
  let activeHotkey: string | null = null
  const applyHotkey = (want: string): void => {
    if (activeHotkey) globalShortcut.unregister(activeHotkey)
    activeHotkey = [want, ...HOTKEYS.filter((k) => k !== want)].find((k) => globalShortcut.register(k, summon)) ?? null
    if (activeHotkey) console.log(`[gabay] global hotkey: ${activeHotkey}`)
    else console.warn(`[gabay] no global hotkey available (tried ${HOTKEYS.join(', ')})`)
  }
  if (!PREVIEW) applyHotkey(settings.hotkey)

  // Gabay is never what a game should wait for: run it, its helper and its renderers below normal priority.
  const lowerPriority = (): void => {
    const pids = new Set([process.pid, ...app.getAppMetrics().map((m) => m.pid)])
    for (const pid of pids) {
      try {
        os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
      } catch {
        /* a process that just ended */
      }
    }
  }
  if (!PREVIEW) setTimeout(lowerPriority, 6000)

  // Put the window back at top-center of the chosen display. Setting bounds twice is deliberate: moving to a
  // display with a different scale factor can rescale the window on the first call, and the second pins it.
  let placedOn = targetDisplay(settings).id
  // Reserved band: the collapsed notch's height (NOTCH.collapsed.height, 24 px) across the notch's display, in physical
  // pixels for the helper. Off in preview so a screenshot run never moves the person's windows.
  const BAND_DIP = 24
  const applyReserve = (): void => {
    if (PREVIEW) return
    if (!settings.reserveTop) {
      void nativeCall('appbar', 'off')
      return
    }
    const d = targetDisplay(settings)
    const px = screen.dipToScreenRect(null, d.bounds)
    const h = Math.round(BAND_DIP * d.scaleFactor)
    void nativeCall('appbar', [px.x, px.y, px.x + px.width, px.y + px.height, h].map((n) => Math.round(n)).join(' '))
  }
  // Hide the Windows taskbar: Windows' own auto-hide, so the real taskbar is still there at the bottom edge. The
  // person's earlier choice is saved first and put back when this is turned off, when Gabay quits (the helper does it
  // as it exits), or on the next start if Gabay was killed.
  async function applyTaskbar(): Promise<void> {
    if (PREVIEW) return
    if (settings.hideTaskbar) {
      if (settings.taskbarWasAutoHide === null) {
        const was = await nativeCall('tbget')
        if (typeof was !== 'boolean') return
        settings = { ...settings, taskbarWasAutoHide: was }
        await saveSettings(settings)
      }
      await nativeCall('tbset', `1 ${settings.taskbarWasAutoHide ? 1 : 0}`)
      await nativeCall('tbhide', settings.taskbarFull ? '1' : '0')
      await nativeCall('tray', settings.trayIcons ? `on ${process.pid}` : 'off')
      await nativeCall('wins', 'on')
    } else {
      await nativeCall('tbhide', '0') // also undoes a hide left over from a run that was killed
      await nativeCall('tray', 'off')
      trayIcons = []
      send('overlay:tray', [])
      await nativeCall('wins', 'off')
      openWins = []
      send('overlay:windows', [])
      if (settings.taskbarWasAutoHide !== null) {
        if ((await nativeCall('tbset', settings.taskbarWasAutoHide ? '1' : '0')) !== true) return
        settings = { ...settings, taskbarWasAutoHide: null }
        await saveSettings(settings)
      }
    }
  }
  const placeNotch = (): void => {
    const d = targetDisplay(settings)
    placedOn = d.id
    const b = notchBounds(d)
    win.setBounds(b)
    win.setBounds(b)
    applyReserve()
  }
  // Follow mouse: a cheap pointer check, only with more than one display. The panel stays put while it is open
  // (the pointer is on it anyway) and the notch moves once the pointer settles on another screen.
  let followTimer: NodeJS.Timeout | undefined
  const syncFollow = (): void => {
    clearInterval(followTimer)
    followTimer = undefined
    if (PREVIEW || !settings.followMouse) return
    followTimer = setInterval(() => {
      if (win.isDestroyed() || screen.getAllDisplays().length < 2) return
      if (screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id !== placedOn) placeNotch()
    }, 500)
  }
  syncFollow()
  screen.on('display-added', placeNotch)
  screen.on('display-removed', placeNotch)
  screen.on('display-metrics-changed', placeNotch)

  // Settings. The renderer sends a partial patch; main validates every field (settings.ts) before using it.
  const snapshot = (): unknown => {
    const primary = screen.getPrimaryDisplay().id
    return {
      settings,
      activeHotkey,
      hotkeys: HOTKEYS,
      version: app.getVersion(),
      notificationAccess: noteAccess,
      collapseRange: { min: COLLAPSE_MIN, max: COLLAPSE_MAX },
      displays: screen.getAllDisplays().map((d, i, all) => ({
        id: d.id,
        label: d.internal
          ? 'Laptop screen'
          : all.filter((o) => !o.internal).length > 1
            ? `External ${i + 1}`
            : 'External screen',
        detail: `${d.size.width}x${d.size.height}${d.id === primary ? ', main' : ''}`
      }))
    }
  }
  ipcMain.handle('settings:get', (e) => {
    fromUi(e)
    return snapshot()
  })
  // One place applies a settings change, for both the Settings tab and Reset.
  const applyPatch = async (patch: unknown): Promise<unknown> => {
    const prevDisplay = settings.displayId
    const prevFollow = settings.followMouse
    const prevReserve = settings.reserveTop
    const prevHide = settings.hideTaskbar
    const prevFull = settings.taskbarFull
    const prevTray = settings.trayIcons
    const prevChannel = settings.updateChannel
    // taskbarWasAutoHide is main's own record; a patch (or Reset's defaults) never overwrites it.
    const next: Settings = { ...sanitize(patch, settings), taskbarWasAutoHide: settings.taskbarWasAutoHide }
    // Also retry when the same hotkey is picked again: the other app that held it may have exited since.
    const pickedHotkey = typeof patch === 'object' && patch !== null && 'hotkey' in patch
    if (next.hotkey !== settings.hotkey || (pickedHotkey && next.hotkey !== activeHotkey)) applyHotkey(next.hotkey)
    settings = next
    if (next.displayId !== prevDisplay || next.followMouse !== prevFollow) placeNotch()
    if (next.followMouse !== prevFollow) syncFollow()
    void nativeCall('notes', settings.notifications ? 'on' : 'off')
    if (next.reserveTop !== prevReserve) applyReserve()
    await saveSettings(settings)
    if (next.hideTaskbar !== prevHide || next.taskbarFull !== prevFull || next.trayIcons !== prevTray) await applyTaskbar()
    if (next.updateChannel !== prevChannel && app.isPackaged) void lookForUpdate()
    return snapshot()
  }
  ipcMain.handle('settings:set', (e, patch: unknown) => {
    fromUi(e)
    return applyPatch(patch)
  })
  // Reset to defaults: settings only. To-dos, notes, pinned clips and the calendar address are left alone, and the
  // welcome tour isn't shown again.
  ipcMain.handle('settings:reset', (e) => {
    fromUi(e)
    return applyPatch({ ...DEFAULTS, hotkey: DEFAULTS.hotkey, welcomed: true, reviewAt: settings.reviewAt, seenVersion: settings.seenVersion })
  })
  ipcMain.handle('notes:get', (e) => {
    fromUi(e)
    return getNotes()
  })
  ipcMain.handle('notes:set', (e, text: unknown) => {
    fromUi(e)
    return setNotes(text)
  })

  // A second launch summons the existing instance instead of starting another.
  summonNow = summon
  if (summonPending) summon()

  // Tray: the way to quit without killing the process. Launch at login is offered only when packaged,
  // because in dev it would register the bare electron.exe as the login item.
  if (!PREVIEW) {
    tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'tray.png')))
    tray.setToolTip('Gabay')
    tray.on('click', summon)
    // Installed builds start at login by default: turned on once, on first run. The tray checkbox decides after that.
    const loginMarker = join(app.getPath('userData'), 'login-default-applied')
    if (app.isPackaged && !existsSync(loginMarker)) {
      app.setLoginItemSettings({ openAtLogin: true })
      try {
        writeFileSync(loginMarker, '')
      } catch {
        // Harmless: it is simply applied again next start.
      }
    }
    const buildMenu = (): Menu =>
      Menu.buildFromTemplate([
        { label: 'Show Gabay', click: summon },
        {
          label: 'Launch at login',
          type: 'checkbox',
          enabled: app.isPackaged,
          checked: app.getLoginItemSettings().openAtLogin,
          click: (item) => {
            if (!app.isPackaged) return // dev would register the bare electron.exe
            app.setLoginItemSettings({ openAtLogin: item.checked })
            tray?.setContextMenu(buildMenu())
          }
        },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
      ])
    tray.setContextMenu(buildMenu())
  }

  // System stats on demand. The renderer only polls while the panel is open on the System tab,
  // so nothing runs in the background while the notch is collapsed.
  // Quick settings (volume, brightness, radios, layout) and the network type for the collapsed pill. The renderer
  // sends an action object or a key; main validates it and maps it to a fixed command or a fixed Settings page.
  ipcMain.handle('quick:get', (e) => {
    fromUi(e)
    return quickGet()
  })
  ipcMain.handle('quick:peek', (e) => {
    fromUi(e)
    return quickPeek()
  })
  ipcMain.handle('quick:slide', (e, kind: unknown, value: unknown) => {
    fromUi(e)
    return quickSlide(kind, value)
  })
  ipcMain.handle('quick:set', (e, action: unknown) => {
    fromUi(e)
    return quickSet(action)
  })
  ipcMain.handle('quick:open', async (e, key: unknown) => {
    fromUi(e)
    if (!isSettingsKey(key)) return false
    await shell.openExternal(SETTINGS_PAGES[key])
    return true
  })
  ipcMain.handle('project:get', (e) => {
    fromUi(e)
    return currentProjectMode()
  })
  ipcMain.handle('project:set', (e, mode: unknown) => {
    fromUi(e)
    return isProjectMode(mode) ? setProjectMode(mode) : false
  })
  // The helper knows which adapter carries the internet (wired wins when Wi-Fi is also connected); the interface list is
  // the fallback while it starts.
  // Notification actions: the renderer sends only an id; the app to open is looked up in the helper, which made the id.
  for (const [channel, cmd] of [['note:dismiss', 'notedismiss'], ['note:open', 'noteopen']] as const) {
    ipcMain.handle(channel, async (e, id: unknown) => {
      fromUi(e)
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id > 0xffffffff) return false
      return (await nativeCall(cmd, String(id)).catch(() => null)) === true
    })
  }
  ipcMain.handle('windows:dnd', async (e) => {
    fromUi(e)
    return (await nativeCall('dnd').catch(() => null)) === true
  })
  ipcMain.handle('network:kind', async (e) => {
    fromUi(e)
    const kind = await nativeCall('net').catch(() => null)
    return kind === 'wifi' || kind === 'ethernet' || kind === 'offline' ? kind : networkKind()
  })
  // Desktops often have no battery or Wi-Fi; the notch and Controls leave those out. null while the helper starts.
  ipcMain.handle('hardware:get', async (e) => {
    fromUi(e)
    const hw = (await nativeCall('hw').catch(() => null)) as { battery?: unknown; wifi?: unknown } | null
    return hw && typeof hw === 'object' ? { battery: hw.battery !== false, wifi: hw.wifi !== false } : null
  })

  ipcMain.handle('stats:get', (event) => {
    if (event.sender !== win.webContents) throw new Error('forbidden')
    return getStats()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopClipboardHistory()
  stopQuick()
  stopNative()
  stopDownloads()
  void recordingStop() // flush whatever a recording in progress has buffered
})
app.on('window-all-closed', () => app.quit())
