// Renders the NSIS installer artwork (black with the mint accent) to 24-bit BMP with Electron itself, so no image
// library is needed. NSIS only takes BMP.
//   npx electron scripts/render-installer.cjs
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const res = join(__dirname, '..', 'resources')
const MINT = '#2fd6bf'
const FONT = "'SF Pro Display','Segoe UI Variable Display','Segoe UI',sans-serif"

// The notch, hanging from the top edge with concave shoulders, like the app.
const notch = (cx, w, h, r) => {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const s = r * 0.7
  return `<path d="M${x0 - s} 0 A${s} ${s} 0 0 1 ${x0} ${s} V${h - r} A${r} ${r} 0 0 0 ${x0 + r} ${h} H${x1 - r} A${r} ${r} 0 0 0 ${x1} ${h - r} V${s} A${s} ${s} 0 0 1 ${x1 + s} 0 Z" fill="${MINT}"/>`
}

// Welcome / finish page sidebar: 164x314.
const sidebar = `
<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <defs>
    <radialGradient id="g" cx="50%" cy="0%" r="75%">
      <stop offset="0" stop-color="${MINT}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${MINT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="164" height="314" fill="#000"/>
  <rect width="164" height="200" fill="url(#g)"/>
  ${notch(82, 84, 22, 10)}
  <circle cx="82" cy="11" r="3.2" fill="#000"/>
  <text x="20" y="246" fill="#f2f2f2" font-family="${FONT}" font-size="30" font-weight="600" letter-spacing="-0.6">Gabay</text>
  <rect x="20" y="258" width="22" height="3" rx="1.5" fill="${MINT}"/>
  <text x="20" y="282" fill="#9a9a9a" font-family="${FONT}" font-size="11">Your taskbar, in the notch.</text>
</svg>`

// Header on the inner pages: 150x57, sits at the right of a white band, so it stays mostly white with a black tab.
const header = `
<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <rect width="150" height="57" fill="#fff"/>
  <rect x="96" y="10" width="40" height="40" rx="10" fill="#000"/>
  <path d="M106 10H126V20A6 6 0 0 1 120 26H112A6 6 0 0 1 106 20Z" fill="${MINT}"/>
  <circle cx="116" cy="20" r="2" fill="#000"/>
</svg>`

const JOBS = [
  { svg: sidebar, out: 'installerSidebar.bmp', w: 164, h: 314 },
  { svg: header, out: 'installerHeader.bmp', w: 150, h: 57 }
]

/** BGRA bitmap (top-down) -> 24-bit bottom-up BMP. */
function bmp(bgra, w, h) {
  const row = Math.ceil((w * 3) / 4) * 4
  const size = 54 + row * h
  const b = Buffer.alloc(size)
  b.write('BM', 0)
  b.writeUInt32LE(size, 2)
  b.writeUInt32LE(54, 10)
  b.writeUInt32LE(40, 14)
  b.writeInt32LE(w, 18)
  b.writeInt32LE(h, 22)
  b.writeUInt16LE(1, 26)
  b.writeUInt16LE(24, 28)
  b.writeUInt32LE(row * h, 34)
  for (let y = 0; y < h; y++) {
    const dst = 54 + (h - 1 - y) * row
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4
      b[dst + x * 3] = bgra[s]
      b[dst + x * 3 + 1] = bgra[s + 1]
      b[dst + x * 3 + 2] = bgra[s + 2]
    }
  }
  return b
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 400, height: 400, frame: false, useContentSize: true })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="margin:0;background:#000;overflow:hidden"></body>'))
  win.webContents.setZoomFactor(1)
  for (const { svg, out, w, h } of JOBS) {
    await win.webContents.executeJavaScript(`document.body.innerHTML = ${JSON.stringify(svg)}`)
    await new Promise((r) => setTimeout(r, 300))
    const img = (await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h })).resize({ width: w, height: h, quality: 'best' })
    writeFileSync(join(res, out), bmp(img.toBitmap(), w, h))
    writeFileSync(join(res, out.replace('.bmp', '.preview.png')), img.toPNG())
    console.log('wrote', out)
  }
  app.quit()
})
