# Development notes

## Where the window behavior lives

Everything non-obvious is in `electron/main.ts`, commented per setting. Window is 560x700, never resized.

## Kill-test checklist

Results (2026-10-19, Windows 11 25H2 build 26200.9711, Electron 44.9.0): all six pass.

1. [x] The notch stays visible above a windowed browser.
2. [x] The notch stays visible above a full-screen YouTube video (F11 in Chrome or Edge).
3. [x] The notch stays visible above a game in borderless fullscreen and in exclusive fullscreen.
   - [x] Borderless fullscreen
   - [x] Exclusive fullscreen
4. [x] Clicks outside the notch reach the window underneath (test with a desktop icon and a browser button).
5. [x] Hovering the notch makes it interactive (the debug label that showed this was removed in 0.14.0).
6. [x] Windows taskbar auto-hide still reveals on bottom-edge hover.

Items 2 and 3 were tested before hardware acceleration was turned off (0.9.0); re-run them on a current build.

## UI preview without touching the desktop (dev only)

```powershell
$env:GABAY_PREVIEW='Controls'; $env:GABAY_PREVIEW_OUT="$PWD\controls.png"; npx electron .
```

Renders the panel on that tab (or `Pill` for the collapsed notch, `Live`, `Toast` or `Note` for the grown notch with
sample data, or `Controls&sub=project|wifi|bt` for a Controls sub-view) in a hidden window, saves a screenshot and quits. It shows no
window, registers no hotkey or tray icon, never reads the clipboard and uses a throwaway data folder, so it is safe to run
while Gabay is in use. Ignored in packaged builds.
