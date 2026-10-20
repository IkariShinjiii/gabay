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
- **Skips private copies:** text that a password manager or private window marks as "don't keep in clipboard history"
  is never recorded (checked by the native helper).
- The renderer only ever gets truncated one-line previews and opaque ids; the full text stays in the main process.

## Today tab, focus timer and command bar

- **Today:** clock, date, a to-do list (add, check off, delete; saved in `todos.json` in userData), and a focus timer with
  Start/Pause/Reset and 15/25/50 minute presets.
- **Collapsed pill:** shows the clock; while a focus timer exists it shows a progress ring and countdown instead
  (display only; control it from the Today tab or the command bar). The timer keeps running while the panel is closed.
- **The bar** (bottom field, one input for everything): text that is a command runs it on Enter (a live hint shows what
  will happen); anything else searches apps, or filters the clipboard on the Clipboard tab. Ctrl+1 to Ctrl+6 switch tabs.
  Commands:
  `lock`, `sleep`, `restart`, `shutdown`, `focus [minutes]` / `timer` / `start`, `pause`, `reset`, `todo <text>`,
  `open <app>`, `clear clipboard`, `go <tab>`. `restart` and `shutdown` never run from the command bar: they open the Power
  tab's confirmation. Buttons and commands call the same actions.
- Focused inputs (search, command, to-do) keep the panel open.

## Controls tab and status

The taskbar's system-tray features, built into the notch.

- **Collapsed pill:** network (Wi-Fi, Ethernet or offline) on the left, the clock or focus-timer ring in the middle, battery on
  the right (red at 20% or less when not charging). Battery comes from Chromium's event-based battery API and the network type
  from the network adapters, so the collapsed notch still runs no timers or processes.
- **Controls tab** (Ctrl+1; tabs are Ctrl+1 to Ctrl+8):
  - Split tiles: the main part acts, the chevron opens the matching Windows Settings page. Wi-Fi and Bluetooth switch the
    radios; Audio mutes and shows the output device; Dark mode switches Windows' app and system theme (applied live);
    Airplane mode uses Windows' own switch.
  - iOS-style volume and brightness bars (brightness on built-in displays only): drag anywhere, tap to jump; click the speaker icon to mute.
  - Now playing, from Windows' media session (browsers, Spotify and other players that show in the volume flyout): artwork,
    title, artist, previous, play/pause, next and progress.
  - Second page (dots in the footer): Project (the Win+P chooser: PC screen only,
    Duplicate, Extend, Second screen only, through Windows' DisplaySwitch), and shortcuts to Energy saver, Accessibility,
    Live captions, Mobile hotspot, Nearby sharing, Cast and Notifications settings.
  - Footer: battery, keyboard layout of the focused window, Windows Settings.
- Volume, brightness, radios and layout go through one hidden PowerShell helper that starts when the Controls tab opens and exits
  30 seconds after it was last used. Commands are fixed strings built from validated values; the renderer never sends text.
- The Wi-Fi and Bluetooth chevrons open lists inside Gabay. Wi-Fi shows nearby networks with signal bars; saved networks
  connect in place, new ones open Windows Settings (passwords never pass through Gabay). Bluetooth lists paired devices
  and which are connected; connecting stays in Windows Settings, which is the only supported way.
- **Not possible from an app:** showing other apps' tray icons (the overflow arrow). Keep the Windows taskbar on
  auto-hide and reach those at the bottom edge as before.

## Windows tab, live activities and alerts

- **Windows tab** (Ctrl+2): your open windows with their icons, most recently used first. Click one to switch to it,
  hover for the x to close it (the app can still ask to save), or type in the bar to filter. Arrow keys and Enter work too.
- **Live activity:** while music or a video plays, the collapsed notch widens a little and shows the album art on the left
  and a moving level meter on the right.
- **Toasts:** the collapsed notch grows for a few seconds, like an iPhone's Dynamic Island, for:
  - **Windows notifications** (app, sender and message). Settings can switch this off, or show only the app name.
    The text is shown, never stored or logged.
  - **A new track** (art, title, artist).
  - **Charging** (a ring fills to the battery level), **fully charged**, and **low battery** at 20% and 10% (in red).
  - **Calendar:** a heads-up 10 minutes before an event.
  - **An available update.**
  Nothing pops up while something is full screen.
- **Gestures on the open notch:** scroll over the tab bar to change the volume (a small volume bar appears); middle-click
  anywhere on the notch to play or pause.
- **Calendar:** paste your calendar's private iCal address in Settings (Google Calendar: Settings > your calendar >
  Integrate calendar > Secret address in iCal format). It is stored encrypted with Windows' DPAPI and only read by the main
  process. The Today tab shows what's on now and the next few events; it refreshes every 10 minutes.
- **Updates:** Gabay checks this repo's GitHub releases 20 seconds after start and every 6 hours. Installing waits for
  you (Settings > Install). The installer must come from this repo's releases and match the SHA-512 in the release's
  `latest.yml`, or it is thrown away. To publish one: `npm run dist`, then attach `dist/Gabay Setup <v>.exe` and
  `dist/latest.yml` to a GitHub release tagged `v<version>`.

## Tray, Settings and startup

- **Tray icon:** click to show the panel; right-click for Show, Launch at login and Quit. Launch at login works only in
  the packaged app (it is greyed out in dev). A second launch just opens the panel of the running instance.
- **Always shown (default):** the notch stays visible, and steps aside by itself while a video, game or any window is full
  screen on its display (a maximized window doesn't count). Rest the pointer on the very top edge, within the notch's width,
  to bring it back while hidden; it slides away again shortly after the pointer leaves.
- **Auto-hide** (Settings): the notch is always tucked away until revealed that way, so it never covers a browser tab.
- **Reserve space at the top** (Settings > Experiments, off by default): a 24 px black band across the top of the notch's
  screen, registered with Windows as an app bar (the taskbar's mechanism), so maximized and snapped windows start below
  the notch. Windows you drag up by hand can still go under it. Full-screen apps still get the whole screen.
- Full screen, now playing, notifications, the window list, focus and volume come from one small native helper (about
  25 MB, no measurable CPU) compiled once from `electron/nativeSource.ts` with the C# compiler built into Windows, against
  the Windows Runtime metadata in `System32\WinMetadata`, and cached in `%APPDATA%\gabay\bin`. Without that compiler
  those features quietly go away and the notch simply stays visible.
- **Settings tab:** global hotkey, how long the pointer must stay away before the panel collapses (200-1500 ms), which
  display the notch sits on (or Follow mouse), notifications, calendar and updates. Saved to `settings.json` in `%APPDATA%\gabay`; the main process validates every value.
- The app and tray icons are drawn in `resources/` (a notch plus a compass, since gabay means guide); edit `resources/icon.svg` / `tray.svg` and run `npx electron scripts/render-icons.cjs` to regenerate the PNGs.

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

## UI preview without touching the desktop (dev only)

```powershell
$env:GABAY_PREVIEW='Controls'; $env:GABAY_PREVIEW_OUT="$PWD\controls.png"; npx electron .
```

Renders the panel on that tab (or `Pill` for the collapsed notch, `Live`, `Toast` or `Note` for the grown notch with
sample data, or `Controls&sub=project|wifi|bt` for a Controls sub-view) in a hidden window, saves a screenshot and quits. It shows no
window, registers no hotkey or tray icon, never reads the clipboard and uses a throwaway data folder, so it is safe to run
while Gabay is in use. Ignored in packaged builds.

## Build an installer

```
npm run dist
```

Produces `dist/Gabay Setup <version>.exe` (unsigned, so Windows SmartScreen warns on first run). The config uses the local Electron copy (`electronDist`) because downloading and renaming a fresh one hit an EPERM lock on this machine.

## Credits

Icons are from [Lucide](https://lucide.dev) (ISC license), stored as inline SVG data in `src/icons.ts`.
