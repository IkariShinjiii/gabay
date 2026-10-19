# Desktop Companion (working name)

Milestone 1: a fixed, transparent, always-on-top overlay window with a click-through notch placeholder.
Windows 11 only. Electron + React + TypeScript + electron-vite.

## Setup

```powershell
npm install
```

If `npm run dev` fails with `Electron uninstall`, the Electron binary was not downloaded:

```powershell
node node_modules/electron/install.js
```

If the main process crashes with `Cannot read properties of undefined (reading 'whenReady')`, your shell has
`ELECTRON_RUN_AS_NODE` set. Clear it (`Remove-Item Env:ELECTRON_RUN_AS_NODE`) and retry.

## Run in dev

```powershell
npm run dev
```

Other scripts: `npm run build`, `npm run typecheck`. Quit with Ctrl+C in the terminal (no tray or hotkey yet).

## Where the window behavior lives

Everything non-obvious is in `electron/main.ts`, commented per setting. Window is 560x440, never resized.

## Kill-test checklist

Results (2026-10-19, Windows 11 25H2 build 26200.9711, Electron 44.9.0): all six pass.

1. [x] The notch stays visible above a windowed browser.
2. [x] The notch stays visible above a full-screen YouTube video (F11 in Chrome or Edge).
3. [x] The notch stays visible above a game in borderless fullscreen and in exclusive fullscreen.
   - [x] Borderless fullscreen
   - [x] Exclusive fullscreen
4. [x] Clicks outside the notch reach the window underneath (test with a desktop icon and a browser button).
5. [x] Hovering the notch makes it interactive and the debug label changes ("click-through" <-> "interactive").
6. [x] Windows taskbar auto-hide still reveals on bottom-edge hover.
