import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { join } from 'node:path'
import { getStats } from './stats'
import { HOTKEYS, loadSettings, sanitize, saveSettings, type Settings } from './settings'
import { ensureIndex, launch, search, toggleStar } from './launcher'
import { isPowerAction, runPower } from './power'
import { addTodo, listTodos, removeTodo, toggleTodo } from './todos'
import { clearHistory, copyBack, listClipboard, startClipboardHistory, stopClipboardHistory, togglePin } from './clipboardHistory'

// Software rendering. The GPU process alone cost ~110 MB of private memory (about 134 MB vs 16 MB) for a 520x400
// overlay, with no measurable CPU difference for our animations (see docs/PERFORMANCE.md). Set GABAY_GPU=1 to
// turn hardware acceleration back on, e.g. to compare. Must run before the app is ready.
if (process.env['GABAY_GPU'] !== '1') app.disableHardwareAcceleration()

// One notch at a time. A second launch (login item plus a manual start, say) hands over to the first and exits.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

const WIN_WIDTH = 560
const WIN_HEIGHT = 440

/** The chosen display, or the primary one if it is unset or no longer attached. */
function pickDisplay(id: number | null): Electron.Display {
  return screen.getAllDisplays().find((d) => d.id === id) ?? screen.getPrimaryDisplay()
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
      sandbox: true
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

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

let tray: Tray | null = null // module-level so it isn't garbage-collected (the icon would vanish)

app.whenReady().then(async () => {
  if (!gotLock) return
  let settings = await loadSettings()
  const win = createOverlay(pickDisplay(settings.displayId))

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
  startClipboardHistory()
  void ensureIndex() // warm the Start Menu index so the first search is instant

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
  applyHotkey(settings.hotkey)

  // Settings. The renderer sends a partial patch; main validates every field (settings.ts) before using it.
  const snapshot = (): unknown => {
    const primary = screen.getPrimaryDisplay().id
    return {
      settings,
      activeHotkey,
      hotkeys: HOTKEYS,
      displays: screen.getAllDisplays().map((d, i) => ({
        id: d.id,
        label: `Display ${i + 1} (${d.bounds.width}x${d.bounds.height})${d.id === primary ? ', primary' : ''}`
      }))
    }
  }
  ipcMain.handle('settings:get', (e) => {
    fromUi(e)
    return snapshot()
  })
  ipcMain.handle('settings:set', async (e, patch: unknown) => {
    fromUi(e)
    const next: Settings = sanitize(patch, settings)
    if (next.hotkey !== settings.hotkey) applyHotkey(next.hotkey)
    if (next.displayId !== settings.displayId) win.setBounds(notchBounds(pickDisplay(next.displayId)))
    settings = next
    await saveSettings(settings)
    return snapshot()
  })

  // A second launch summons the existing instance instead of starting another.
  app.on('second-instance', summon)

  // Tray: the way to quit without killing the process. Launch at login is offered only when packaged,
  // because in dev it would register the bare electron.exe as the login item.
  tray = new Tray(nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'tray.png')))
  tray.setToolTip('Gabay')
  tray.on('click', summon)
  const buildMenu = (): Menu =>
    Menu.buildFromTemplate([
      { label: 'Show Gabay', click: summon },
      {
        label: 'Launch at login',
        type: 'checkbox',
        enabled: app.isPackaged,
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked })
          tray?.setContextMenu(buildMenu())
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  tray.setContextMenu(buildMenu())

  // System stats on demand. The renderer only polls while the panel is open on the System tab,
  // so nothing runs in the background while the notch is collapsed.
  ipcMain.handle('stats:get', (event) => {
    if (event.sender !== win.webContents) throw new Error('forbidden')
    return getStats()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopClipboardHistory()
})
app.on('window-all-closed', () => app.quit())
