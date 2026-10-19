# Gabay

Personal Windows 11 top-edge shell: a center notch that expands into a panel. All nine planned milestones are done (see CHANGELOG.md); the overlay kill test passed (see below).
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

Other scripts: `npm run build`, `npm run typecheck`. Quit from the tray icon (right-click, Quit) or with Ctrl+C in the terminal.

## Taskbar (Phase A)

Gabay does not touch the Windows taskbar. To use the notch as the main surface, turn on the Windows setting yourself:
Settings > Personalization > Taskbar > Taskbar behaviors > **Automatically hide the taskbar**.

- The notch is at the top edge and the taskbar at the bottom, so they never overlap on a normal layout.
- Reach the tray by moving the pointer to the bottom edge; Windows reveals the taskbar natively (kill-test item 6 passed).
- Fully reversible: turn the setting off again. Gabay changes no Windows settings.

## Launcher and hotkey

- **Ctrl+Alt+G** (default) opens the panel with the search field focused. Pick another in the Settings tab (Ctrl+Shift+G,
  Ctrl+Alt+Space or Ctrl+Alt+J). If another app owns the chosen combo, Gabay uses the next free one and Settings says so.
  No Win-key shortcuts. Ctrl+Alt+Space is taken by the Claude desktop app on the dev machine.
- Search covers everything the Start menu shows, including Store apps (via `Get-StartApps`), with Start Menu `.lnk`
  shortcuts as fallback. Fuzzy matching is a small built-in matcher. Enter launches, arrows move, Esc clears then releases focus.
- Star an app with the star button to pin it to the Launch tab; recent launches are remembered.
- Recents and stars live in `launcher.json` in Electron's userData folder (`%APPDATA%\gabay`). The renderer only handles opaque ids; paths never leave the main process.
- While the search field has focus the panel stays open even if the pointer is elsewhere.

## Power tab

Lock, Sleep, Restart, Shut down. Restart and Shut down ask for confirmation in the panel (Cancel is focused, Esc cancels,
and the panel stays open while the prompt is up). The renderer sends only an action name; the main process maps it to a fixed
command (`rundll32`, `shutdown /r|/s /t 0`, PowerShell `SetSuspendState`). Sleep uses `SetSuspendState(Suspend)` because the
common `rundll32 powrprof.dll` form hibernates when hibernation is enabled.

Dev-only: `GABAY_DRY_RUN=1 npm run dev` logs the command instead of running it (ignored in packaged builds).

## Clipboard tab

Text clipboard history (polled every second by the main process), newest first with pinned items on top. Type in the
search field to filter, click a row to copy it back, star to pin, "Clear history" to forget everything unpinned.

- Cap: 50 unpinned + 50 pinned items, 10,000 characters each. Images and files are ignored.
- **Privacy:** unpinned history is memory-only and gone when Gabay quits. Only pinned items are written to disk
  (`clipboard-pinned.json` in `%APPDATA%\gabay`, plain text), so don't pin secrets.
- **Known limit:** Electron 44's clipboard API can't read Windows' "exclude from history" flag, so text copied from a
  password manager does appear in the list until you clear it or quit.
- The renderer only ever gets truncated one-line previews and opaque ids; the full text stays in the main process.

## Today tab, focus timer and command bar

- **Today:** clock, date, a to-do list (add, check off, delete; saved in `todos.json` in userData), and a focus timer with
  Start/Pause/Reset and 15/25/50 minute presets.
- **Collapsed pill:** shows the clock; while a focus timer exists it shows a progress ring and countdown instead
  (display only; control it from the Today tab or the command bar). The timer keeps running while the panel is closed.
- **Command bar** (bottom field; a live hint shows what Enter will do):
  `lock`, `sleep`, `restart`, `shutdown`, `focus [minutes]` / `timer` / `start`, `pause`, `reset`, `todo <text>`,
  `open <app>`, `clear clipboard`, `go <tab>`. `restart` and `shutdown` never run from the command bar: they open the Power
  tab's confirmation. Buttons and commands call the same actions.
- Focused inputs (search, command, to-do) keep the panel open.

## Tray, Settings and startup

- **Tray icon:** click to show the panel; right-click for Show, Launch at login and Quit. Launch at login works only in
  the packaged app (it is greyed out in dev). A second launch just opens the panel of the running instance.
- **Settings tab:** global hotkey, how long the pointer must stay away before the panel collapses (200-1500 ms), and which
  display the notch sits on. Saved to `settings.json` in `%APPDATA%\gabay`; the main process validates every value.
- The tray and installer icons are placeholders in `resources/`; replace `icon.png` (512x512) and `tray.png` (32x32).

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
5. [x] Hovering the notch makes it interactive (the debug label that showed this was removed in 0.14.0).
6. [x] Windows taskbar auto-hide still reveals on bottom-edge hover.

Items 2 and 3 were tested before hardware acceleration was turned off (0.9.0); re-run them on a current build.

## Build an installer

```
npm run dist
```

Produces `dist/Gabay Setup <version>.exe` (unsigned, so Windows SmartScreen warns on first run). The config uses the local Electron copy (`electronDist`) because downloading and renaming a fresh one hit an EPERM lock on this machine.

## Credits

Icons are from [Lucide](https://lucide.dev) (ISC license), stored as inline SVG data in `src/icons.ts`.
