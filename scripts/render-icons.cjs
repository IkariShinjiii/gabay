// Renders resources/*.svg to PNG with Electron itself, so no image library is needed.
//   npx electron scripts/render-icons.cjs
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const res = join(__dirname, '..', 'resources')
const JOBS = [
  { svg: 'icon.svg', out: 'icon.png', size: 512 },
  { svg: 'tray.svg', out: 'tray.png', size: 32 },
  { svg: 'tray.svg', out: 'tray@2x.png', size: 64 }
]

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  // One window, content swapped in place: loading several data: URLs in a row failed on the second load.
  const win = new BrowserWindow({ show: false, width: 512, height: 512, transparent: true, frame: false, useContentSize: true })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="margin:0;background:transparent;overflow:hidden"></body>'))
  for (const { svg, out, size } of JOBS) {
    const markup = readFileSync(join(res, svg), 'utf8').replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)
    await win.webContents.executeJavaScript(`document.body.innerHTML = ${JSON.stringify(markup)}`)
    await new Promise((r) => setTimeout(r, 200))
    writeFileSync(join(res, out), (await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })).toPNG())
    console.log('wrote', out)
  }
  app.quit()
})
