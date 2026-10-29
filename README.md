# Gabay

Your Windows taskbar, folded into an iPhone-style notch: a strip at the top of the screen that expands into quick settings,
your day and your tools. Built and tested on Windows 11; Windows 10 version 1809 or later should work.
Electron + React + TypeScript + electron-vite, with a small C# helper for the Windows parts (see CHANGELOG.md for history).

## Download

**Website:** https://gabay-site-plum.vercel.app

Get the installer from the website or from [GitHub releases](https://github.com/IkariShinjiii/gabay/releases/latest).
It's free, installs for your account only, and updates itself. Windows may say "Windows protected your PC" the first
time, because the installer isn't code-signed yet: choose **More info**, then **Run anyway**.
Works on laptops and desktop PCs: on a PC without a battery, Wi-Fi or Bluetooth, those controls are hidden and a wired
connection shows as Ethernet.

**Reviews:** rate Gabay with the [review form](https://github.com/IkariShinjiii/gabay/issues/new?template=review.yml).
Approved reviews (label `approved`) appear on the website, and approving one closes it automatically.

## Website

The site is the single static page in `site/`. It deploys to **Vercel** (project root `site/`, settings in
`site/vercel.json`: caching for media, fonts and images, plus security headers) on every push to `main`, and to GitHub
Pages (https://ikarishinjiii.github.io/gabay/) through `.github/workflows/pages.yml`. The showcase video is made with
Remotion in a separate `gabay-video` project (`src/Showcase.tsx`); re-encode it for the web at 1600 px with a capped
bitrate so it streams without stalling.

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

### Hide the taskbar and use the dock (Settings)

**Hide the Windows taskbar** in Settings turns on auto-hide for you and shows your open apps in a dock at the bottom of
the panel. Turning it off, or quitting Gabay, puts the taskbar back as it was (a small watchdog does this even if Gabay
is killed).

- Click an app to switch to it, or the one you're using to minimize it. Middle-click opens a new window of it.
- Hover an open app to see a picture of each of its windows: click one to bring it up, or its X to close it. The
  pictures stay in memory and only go to Gabay's own page.
- Drag pinned apps sideways to put them in your order, or right-click one for Move left / Move right.
- Start, Task view and Show desktop buttons do what the taskbar's do.
- **Every screen:** hiding the taskbar hides it on all screens, so each other screen gets a slim notch with the time
  that opens to the same dock on hover (window previews open below it there). It is the same page in a dock-only mode
  (about 35 MB per screen) and may only use the dock's own IPC channels. It steps aside for full-screen apps on its
  screen and follows the auto-hide setting.
- **Taskbar slides up** keeps the real taskbar at the bottom edge; **Hidden** hides it completely. With **Tray icons**
  on (experimental), the icons from the taskbar's corner show in the dock instead.

## Launcher and hotkey

- **Ctrl+Alt+G** (default) opens the panel with the search field focused. Pick another in the Settings tab (Ctrl+Shift+G,
  Ctrl+Alt+Space or Ctrl+Alt+J). If another app owns the chosen combo, Gabay uses the next free one and Settings says so.
  No Win-key shortcuts. Ctrl+Alt+Space is taken by the Claude desktop app on the dev machine.
- Search covers everything the Start menu shows, including Store apps (via `Get-StartApps`), with Start Menu `.lnk`
  shortcuts as fallback. Fuzzy matching is a small built-in matcher. Enter launches, arrows move, Esc clears then releases focus.
- Files and folders in your user folder show below the apps, newest first, from Windows' own search index (what
  Explorer's search box uses; Gabay indexes nothing itself). Enter opens one; Ctrl+Enter or right-click opens its
  folder. App data and hidden folders are left out.
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

- Cap: 50 unpinned + 50 pinned items, 10,000 characters each. The last 10 images are kept too (memory only); files are ignored.
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
  will happen); anything else searches apps, or filters the clipboard on the Clipboard tab. Ctrl+1 to Ctrl+9 switch tabs.
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
- **Controls tab** (Ctrl+1; tabs are Ctrl+1 to Ctrl+9):
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

## Live activities and alerts

- **The collapsed pill** shows, besides the clock, network and battery: the weather (Settings > Weather), a moon while
  Focus is on, and an iPhone-style dot while an app uses the camera (green) or microphone (orange). It widens as needed.
- **Live activity:** while music or a video plays, the pill shows the album art and a moving level meter; while a browser
  download runs (Chrome, Edge, Brave, Firefox), how much has arrived; while recording, a red dot and the time. The middle
  shows a running stopwatch or the next timer instead of the clock.
- **Notification actions:** point at a Windows notification in the notch and two buttons appear: open its app, or dismiss it (removes it from Windows' list too). The panel doesn't open while you do.
- **Toasts:** the collapsed notch grows for a few seconds, like an iPhone's Dynamic Island, for:
  - **Windows notifications** (app, sender and message). Settings can switch this off, or show only the app name.
    The text is shown, never stored or logged. Windows shows its own banner too; turn on Windows' **Do not disturb** to
    hide it (notifications still reach Gabay), and Gabay then plays a soft sound with each one (Settings can turn it off).
  - **A new track** (art, title, artist).
  - **Charging** (a ring fills to the battery level), **fully charged**, and **low battery** at 20% and 10% (in red).
  - **Calendar:** a heads-up 10 minutes before an event.
  - **Timers** ending (with a chime), a **finished download**, a **saved screenshot** (with a thumbnail) or **recording**.
  - **An available update.**
  Nothing pops up while something is full screen; toasts that arrive while the panel is open wait until it closes.
- **Focus** (Controls): silences notification toasts until you turn it off, for an hour, until 6 PM or until 7 AM.
- **Screenshot** (Controls): saves the notch's screen to Pictures\Screenshots and copies it; the arrow opens Windows'
  region snip. **Record** saves the screen with its sound to Videos\Gabay as WebM. Gabay hides itself from both.
- **Volume per app** (Controls > Audio arrow): a slider for each app playing sound, like Windows' volume mixer.
- **Now playing** (Controls): drag the progress bar to seek. With **Lyrics** on (Settings), the current line shows
  under it, from lrclib.net (it sends the song's title and artist there, so it's off by default).
- **Today:** weather, a stopwatch with laps, and up to 6 timers (+1, +5, +10 or +30 minutes) that keep running when the
  notch closes.
- **Clipboard** also keeps the last 10 copied images (memory only, never saved).
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
- **Language** (Settings): English or Filipino. The text lives in `src/fil.ts` (the English sentence is the key; anything missing shows in English), looked up with `tr()` from `src/i18n.ts`. Release notes and the Windows-provided names stay in English.
- **Settings tab:** global hotkey, how long the pointer must stay away before the panel collapses (200-1500 ms), which
  display the notch sits on (or Follow mouse), notifications, accent colour (mint, your Windows accent, or six others),
  weather city, lyrics, calendar, updates, **Report a bug**, and Experiments.
- **Report a bug** (Settings): describe the problem, then send it as a prefilled GitHub issue or copy it to paste in a
  chat. It adds the Gabay and Windows versions, screen setup, a few settings and recent error messages, with user names
  and home folders removed. Nothing from the clipboard, notifications, calendar or files.
- **The search bar** shows only on Launch (apps and commands) and Clipboard (filter). The hotkey opens Launch.
- **Inbox tab:** recent Windows notifications, newest first, including ones Do not disturb kept quiet. Open or dismiss one, or clear all. They are held in memory only: never saved to disk, and gone when Gabay quits.
- **Notes tab:** one scratchpad that saves as you type (to `notes.json` in `%APPDATA%\gabay`), with copy and clear.
- **What's new:** the first start after an update shows a short note in the notch; Settings › What's new lists it
  (`src/whatsNew.ts`, one entry per release).
- **Settings extras:** Shortcuts and commands (every hotkey, gesture and typed command), and Reset to defaults (settings
  only; to-dos, notes, pinned clips and the calendar stay).
- **Welcome tour:** the first start opens the notch into a four-step tour; Settings > Welcome tour shows it again. Preview it
  with `GABAY_PREVIEW='Welcome'`. Saved to `settings.json` in `%APPDATA%\gabay`; the main process validates every value.
- The app and tray icons are drawn in `resources/` (a notch plus a compass, since gabay means guide); edit `resources/icon.svg` / `tray.svg` and run `npx electron scripts/render-icons.cjs` to regenerate the PNGs.

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

## Build an installer

```
npm run dist
```

Produces `dist/Gabay Setup <version>.exe` (unsigned, so Windows SmartScreen warns on first run). The config uses the local Electron copy (`electronDist`) because downloading and renaming a fresh one hit an EPERM lock on this machine.

## Credits

Icons are from [Lucide](https://lucide.dev) (ISC license), stored as inline SVG data in `src/icons.ts`.

## License

Copyright (c) 2026 IkariShinjiii. Gabay is free software under the **GNU General Public License v3.0 only**
([LICENSE](LICENSE)). You may use, study, change and share it. If you share a changed version, you must share its source
code under the same license. Gabay comes with no warranty.

**Name and logo:** the GPL covers the code, not the name. A changed version you share must use a different name and
icon, so people can tell it apart from official Gabay. Official downloads come only from
https://gabay-desktop.vercel.app and https://github.com/IkariShinjiii/gabay/releases.

Third-party software it includes is listed in [resources/THIRD-PARTY-NOTICES.txt](resources/THIRD-PARTY-NOTICES.txt).

## Code signing

See [docs/CODE_SIGNING.md](docs/CODE_SIGNING.md) for how releases are built and signed, and what Gabay connects to.
