import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import { basename } from 'node:path'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getStats } from './stats'
import { nativeCall, startNative, stopNative } from './native'
import { connectWifi, disconnectWifi, listWifi } from './wifi'
import { getAgenda, setCalendarUrl } from './calendar'
import { checkUpdate, installUpdate, type UpdateInfo } from './updater'
import { currentProjectMode, isProjectMode, setProjectMode } from './project'
import { isSettingsKey, networkKind, quickGet, quickPeek, quickSet, quickSlide, SETTINGS_PAGES, stopQuick } from './quick'
import { COLLAPSE_MAX, COLLAPSE_MIN, HOTKEYS, loadSettings, sanitize, saveSettings, type Settings } from './settings'
import { ensureIndex, getIcon, launch, search, toggleStar } from './launcher'
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
const WIN_HEIGHT = 580

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

app.whenReady().then(async () => {
  if (!gotLock) return
  let settings = await loadSettings()
  const win = createOverlay(targetDisplay(settings))

  // Renderer reports whether the pointer is over the notch.
  // true  -> window captures the mouse (interactive)
  // false -> mouse passes through to whatever is underneath (click-through)
  ipcMain.on('overlay:set-interactive', (event, interactive: unknown) => {
    if (event.sender !== win.webContents || typeof interactive !== 'boolean') return
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
    return typeof id === 'string' ? toggleStar(id) : false
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
  setClipboardGuard(async () => (await nativeCall('clipok')) !== false)
  if (!PREVIEW) startClipboardHistory()
  // Native helper: full screen on the notch's display, now playing, notifications, windows, volume, Bluetooth.
  const send = (channel: string, value: unknown): void => {
    if (!win.isDestroyed()) win.webContents.send(channel, value)
  }
  const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
  let fsNow = false
  let media: Record<string, unknown> | null = null
  {
    void startNative({
      fullscreen: (r) => {
        let fs = false
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
      note: (raw) => {
        if (!settings.notifications || !raw || typeof raw !== 'object') return
        const n = raw as Record<string, unknown>
        const appName = str(n.app, 80) ?? 'Notification'
        send('overlay:note', settings.notePreview ? { app: appName, title: str(n.title, 120), body: str(n.body, 240) } : { app: appName, title: null, body: null })
      }
    }, () => {
      void nativeCall('notes', settings.notifications && !PREVIEW ? 'on' : 'off')
      applyReserve()
    })
  }
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

  // Open windows. The renderer gets opaque ids (window handles as text) and titles; exe paths stay here.
  let windowPaths = new Map<string, string>()
  ipcMain.handle('windows:list', async (e) => {
    fromUi(e)
    const raw = await nativeCall('windows')
    if (!Array.isArray(raw)) return []
    const next = new Map<string, string>()
    const list = raw.flatMap((w: Record<string, unknown>) => {
      const id = typeof w.h === 'string' && /^\d{1,20}$/.test(w.h) ? w.h : null
      const title = str(w.t, 300)
      if (!id || !title) return []
      const path = typeof w.p === 'string' ? w.p : ''
      if (path) next.set(id, path)
      const exe = path ? basename(path).replace(/\.exe$/i, '') : ''
      return [{ id, title, app: exe, minimized: w.min === true, active: w.fg === true }]
    })
    windowPaths = next
    return list
  })
  ipcMain.handle('windows:icon', async (e, id: unknown) => {
    fromUi(e)
    const path = typeof id === 'string' ? windowPaths.get(id) : undefined
    if (!path) return null
    try {
      return (await app.getFileIcon(path, { size: 'normal' })).toDataURL()
    } catch {
      return null
    }
  })
  ipcMain.handle('windows:focus', (e, id: unknown) => {
    fromUi(e)
    return typeof id === 'string' && windowPaths.has(id) ? nativeCall('focus', id) : false
  })
  ipcMain.handle('windows:close', (e, id: unknown) => {
    fromUi(e)
    return typeof id === 'string' && windowPaths.has(id) ? nativeCall('close', id) : false
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

  // Updates: checked shortly after start and every 6 hours; installing waits for the person.
  let update: UpdateInfo | null = null
  const lookForUpdate = async (): Promise<void> => {
    const u = await checkUpdate()
    if (u && u.version !== update?.version) send('overlay:update', u)
    update = u
  }
  if (!PREVIEW && app.isPackaged) {
    setTimeout(() => void lookForUpdate(), 20_000)
    setInterval(() => void lookForUpdate(), 6 * 3_600_000)
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
  ipcMain.handle('settings:set', async (e, patch: unknown) => {
    fromUi(e)
    const prevDisplay = settings.displayId
    const prevFollow = settings.followMouse
    const prevReserve = settings.reserveTop
    const next: Settings = sanitize(patch, settings)
    // Also retry when the same hotkey is picked again: the other app that held it may have exited since.
    const pickedHotkey = typeof patch === 'object' && patch !== null && 'hotkey' in patch
    if (next.hotkey !== settings.hotkey || (pickedHotkey && next.hotkey !== activeHotkey)) applyHotkey(next.hotkey)
    settings = next
    if (next.displayId !== prevDisplay || next.followMouse !== prevFollow) placeNotch()
    if (next.followMouse !== prevFollow) syncFollow()
    void nativeCall('notes', settings.notifications ? 'on' : 'off')
    if (next.reserveTop !== prevReserve) applyReserve()
    await saveSettings(settings)
    return snapshot()
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
  ipcMain.handle('network:kind', (e) => {
    fromUi(e)
    return networkKind()
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
})
app.on('window-all-closed', () => app.quit())
