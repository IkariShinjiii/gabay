# Gabay

Personal Windows 11 top-edge shell: a center notch that expands into a panel. Currently Milestone 5 (search and launcher); the Milestone 1 overlay kill test passed (see below).
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

## Taskbar (Phase A)

Gabay does not touch the Windows taskbar. To use the notch as the main surface, turn on the Windows setting yourself:
Settings > Personalization > Taskbar > Taskbar behaviors > **Automatically hide the taskbar**.

- The notch is at the top edge and the taskbar at the bottom, so they never overlap on a normal layout.
- Reach the tray by moving the pointer to the bottom edge; Windows reveals the taskbar natively (kill-test item 6 passed).
- Fully reversible: turn the setting off again. Gabay changes no Windows settings.

## Launcher and hotkey

- **Ctrl+Alt+G** opens the panel with the search field focused (it tries Ctrl+Alt+G, Ctrl+Shift+G, then Ctrl+Alt+Space,
  and uses the first free one; the choice is logged at startup). No Win-key shortcuts. Ctrl+Alt+Space is taken by the
  Claude desktop app on the dev machine.
- Search covers everything the Start menu shows, including Store apps (via `Get-StartApps`), with Start Menu `.lnk`
  shortcuts as fallback. Fuzzy matching is a small built-in matcher. Enter launches, arrows move, Esc clears then releases focus.
- Star an app with the star button to pin it to the Launch tab; recent launches are remembered.
- Recents and stars live in `launcher.json` in Electron's userData folder (`%APPDATA%\gabay`). The renderer only handles opaque ids; paths never leave the main process.
- While the search field has focus the panel stays open even if the pointer is elsewhere.

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
