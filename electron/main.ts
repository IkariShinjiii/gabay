import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'

const WIN_WIDTH = 560
const WIN_HEIGHT = 440

function createOverlay(): BrowserWindow {
  // `bounds` (not `workArea`) so y = 0 is the true top edge of the screen,
  // regardless of where the taskbar sits.
  const { x, y, width } = screen.getPrimaryDisplay().bounds

  const win = new BrowserWindow({
    width: WIN_WIDTH,
    height: WIN_HEIGHT,
    x: Math.round(x + (width - WIN_WIDTH) / 2), // horizontally centered
    y,                                          // top edge of the primary display
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

app.whenReady().then(() => {
  const win = createOverlay()

  // Renderer reports whether the pointer is over the notch.
  // true  -> window captures the mouse (interactive)
  // false -> mouse passes through to whatever is underneath (click-through)
  ipcMain.on('overlay:set-interactive', (event, interactive: unknown) => {
    if (event.sender !== win.webContents || typeof interactive !== 'boolean') return
    if (interactive) win.setIgnoreMouseEvents(false)
    else win.setIgnoreMouseEvents(true, { forward: true })
  })
})

// Overlay has no tray yet, so quitting with the last window is the only way out besides Ctrl+C.
app.on('window-all-closed', () => app.quit())
