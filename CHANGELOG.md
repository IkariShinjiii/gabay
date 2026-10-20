# Changelog

## 0.30.0

- **Removed** the Windows tab (Alt+Tab does it better). The search bar shows only on Launch and Clipboard.
- **Screenshot and Record** in Controls: full-screen PNG (copied and saved) or region snip; screen recording with sound.
- **Weather** in the pill and on Today (Open-Meteo, city set in Settings).
- **Downloads** in progress as a live activity, and a toast when one finishes.
- **Focus** (do not disturb) for an hour, until 6 PM, until 7 AM, or until turned off.
- **Stopwatch** with laps and **multiple timers** on Today, shown in the pill while running, with a chime.
- **Camera and microphone dots** in the pill while an app uses them.
- **Volume per app** (Controls > Audio).
- **Accent colours:** mint, Windows accent, blue, purple, pink, orange, red, green.
- **Clipboard images:** the last 10 copied images (memory only).
- **Seek** in Now playing, and optional **synced lyrics** (lrclib.net).
- **Report a bug** in Settings (GitHub issue or copied text; personal details removed).
- Fixes: two toasts at once no longer skip the first; toasts wait while the panel is open; the notch page reloads itself
  if it crashes (at most 3 times a minute); errors are logged for bug reports; the clipboard is only read after a copy.

## 0.29.1

Bug fixes:
- Clipboard history no longer records text a password manager or private window marks as "keep out of clipboard history".
- Windows tab: Enter with a command in the bar no longer also switches windows; the panel now closes after switching;
  icons can't show the wrong app when Windows reuses a window handle.
- The native helper restarts after a crash (up to 5 times in 10 minutes) and re-applies notifications and the reserved band.
- The helper answers requests in parallel, so a slow Bluetooth scan no longer delays window switching or volume.
- Now playing recovers if Windows' media service wasn't ready when Gabay started.
- Updater: a failed download of latest.yml is treated as a failure instead of being parsed.

## 0.29.0

- **Experiments > Reserve space at the top** (Settings, off by default): Gabay registers a 24 px black band at the top
  of the notch's screen as an app bar, like the taskbar, so maximized and snapped windows sit below the notch. It steps
  behind full-screen apps, follows the notch to another screen, and is given back when turned off or when Gabay quits.

## 0.28.0

- **Windows tab:** open windows with icons, most recent first; click to switch, x to close, type to filter.
- **Live activity:** album art and a level meter in the collapsed notch while media plays.
- **Toasts in the notch:** Windows notifications (can be off or app-name-only), new track, charging ring, fully charged,
  low battery, calendar heads-up, update available. None during full screen.
- **Gestures:** scroll the tab bar for volume (with a volume pop-up), middle-click to play/pause.
- **Wi-Fi and Bluetooth lists** in Controls: connect to saved networks in place; paired devices and their status.
- **Calendar** from a private iCal address (stored encrypted): up next on Today, heads-up 10 minutes before.
- **Updates** from GitHub releases, verified against the release's SHA-512, installed only when you press Install.
- **Polish:** System shows ring gauges, empty states have icons and hints, Today's timer sits in a card, thin dark scrollbars.
- **Performance:** one native helper replaces the full-screen watcher; spellcheck, occlusion tracking and the spare
  renderer are off; the level meter redraws about 7 times a second and stops when hidden. See docs/PERFORMANCE.md.

## 0.27.1

- App and tray icons recolored to black and mint, matching the app and installer.

## 0.27.0

- Installed Gabay starts at login by default (turned on once on first run; the tray checkbox decides after that).
- Scroll wheel: over a slider it nudges volume or brightness; elsewhere on the Controls tab it flips pages.
- Branded installer: black-and-mint sidebar and header (scripts/render-installer.cjs).

## 0.26.0

- Sliders rebuilt to feel like iOS: drag-driven (no jump on grab), the fill tracks the pointer every frame, values stream to Windows while dragging, rubber-band stretch past the ends, glide on tap. Dragging volume while muted unmutes.
- Controls open instantly: the last snapshot is cached (and warmed right after launch), so tiles paint at once and refresh in place.
- Night light removed; Airplane mode takes its place next to Dark mode.
- Show on: Follow mouse, plus friendly screen names (Laptop screen, External screen).
- SF Pro is used when installed, else Segoe UI Variable.

## 0.25.1

- The notch now hides during browser video full screen (YouTube, Netflix in Brave/Chrome/Edge). Those windows stay "maximized" in full screen, so detection now looks for a missing title bar instead.

## 0.25.0

- Smaller notch: 216x24 (was 268x32), so less of the browser tab strip is covered.
- Black surfaces; the mint accent stays.

## 0.24.0 Controls tab

The Quick tab is now Controls (first tab), redesigned after the reference: split tiles for Wi-Fi, Bluetooth, Audio (output name, mute), Night light and Dark mode (switches the Windows theme live), iOS-style volume and brightness bars, and a now-playing card from the Windows media session with artwork and previous, play/pause, next and progress. Airplane mode, Project and the Settings shortcuts move to a second page. The open notch can grow to 540 px for it.

## 0.23.0 Teal palette

Orange replaced by a deep-teal surface palette and a mint accent matching the editor theme and the Windows accent, defined once as tokens in index.css. Filled accent controls use dark text; selection and caret use the palette.

## 0.22.0 Content-sized panel, compact Power

The open notch now takes the height of the current tab's content (up to 400 px) and springs between tabs, instead of a fixed box that stretched the content. Power is one row of four buttons, icon over label, with a staggered entrance, hover lift and press; the restart and shut-down confirmation takes the same footprint. System gauges align with the panel edges.

## 0.21.0 Full-screen aware, real airplane mode, Project chooser

The notch is Always shown again by default and steps aside only while something is full screen on its display (a 9 MB watcher compiled once with the C# compiler built into Windows). Reveal from hidden is faster (90 ms rest on the top edge, was 350). Airplane mode now reads and sets Windows' own airplane switch, so turning Wi-Fi off with Bluetooth already off no longer shows as airplane mode. Project opens a Win+P chooser (PC screen only, Duplicate, Extend, Second screen only) with the current mode marked.

## 0.20.0 Quick tab and status

The taskbar's tray features in the notch: the collapsed pill shows network, clock and battery; a new Quick tab has Wi-Fi, Bluetooth and Airplane mode toggles, shortcuts to Windows Settings pages, brightness and volume sliders, mute, battery and keyboard layout. One hidden helper process runs only while the Quick tab is used. Motion polish: sliding tab marker, tab crossfade, spring press on tiles, sliding quick-settings pages, iOS-style page dots and custom sliders. Dev-only hidden preview mode for screenshots.

## 0.19.0 Auto-hide

The notch no longer sits on top of browser tabs and buttons: new Notch visibility setting, Auto-hide by default (revealed by resting the pointer on the top edge for a moment, hidden again shortly after it leaves) or Always shown.

## 0.18.0 App icons

Launcher results show each app's own icon. Shortcut icons come from the shortcut or its target; Store app icons come from the package manifest (one background lookup, about 4 s, the first time a Store app is listed). Icons are resolved in the main process and sent as small data URLs keyed by the opaque app id, so paths still never reach the renderer. The page policy gains img-src data: only.

## 0.17.0 Notch-native panel

The expanded panel redesigned from a critique: tabs sit in the notch band with text labels and an active marker, one bar replaces the separate search and command fields, content sits on black without boxes, secondary text raised to readable contrast, the accent now means state (active tab, focus, running timer), real icons replace the check and cross glyphs, Ctrl+1 to Ctrl+6 switch tabs, and picking a tab clears the bar.

## 0.16.0 iPhone-style notch

Collapsed notch redesigned after the iPhone XS Max: flush with the top edge, concave flared shoulders, rounder bottom corners, 210x32, content centered. The expanded panel gets the same shoulders.

## 0.15.0 Real icon

Notch-and-compass app icon and a notch-only tray mark (with a 2x variant), as SVG sources plus a render script (scripts/render-icons.cjs).

## 0.14.2 Polish

README and performance notes brought up to date; performance re-checked (126 MB private, 0.03% CPU).

## 0.14.1 Review fixes

Saves are serialized and atomic for every store. The notch re-centers when displays change. A second launch during startup is no longer dropped. Re-picking a hotkey retries it. The slider commits with a debounce.

## 0.14.0 Icons

Lucide icons on the tabs (active tab shows its label), power actions, and star and pin buttons. Inline SVG, no new dependency.

## 0.13.0 Settings

Settings tab: global hotkey (from a fixed list, with a notice when another app owns it), collapse delay, and which display the notch sits on. Saved to settings.json in the app data folder and validated in the main process.

## 0.12.0 Tray and basics

Tray icon (Show, Launch at login, Quit), placeholder app icon, single-instance lock. Launch at login is enabled only in the packaged app.

## 0.11.0 Packaging

`npm run dist` builds an unsigned NSIS installer in dist/ with electron-builder. React and motion moved to devDependencies since Vite bundles them.

## 0.10.0 Disk gauge

System tab shows system-drive usage next to CPU and RAM. Debug label removed.

## 0.9.0 Performance check

Disable hardware acceleration (saves about 110 MB private memory with no CPU cost). Budget check and baseline in docs/PERFORMANCE.md.

## 0.8.0 Today tab and command bar

Clock, to-dos, focus timer (ring and countdown on the collapsed pill), and a command bar that routes to the same actions as the buttons.

## 0.7.0 Clipboard tab

Text clipboard history with search, pin, copy back and clear. Unpinned history is memory-only.

## 0.6.0 Power tab

Power tab with Lock, Sleep, Restart, Shut down. Confirmation for Restart and Shut down holds the panel open. Dev-only dry-run mode.

## 0.5.0 Search bar and launcher

Real search field with fuzzy app search (Start menu + Store apps), recents and stars, global hotkey (Ctrl+Alt+G), panel stays open while the search field is focused.

## 0.4.0 Taskbar Phase A

Document the auto-hide taskbar setup. No code change; Gabay does not modify Windows settings.

## 0.3.0 Stats tab

System tab shows live CPU and RAM gauges, polled every 1.5 s only while the panel is open on that tab. Uses Node's built-in os module (no new dependency). Performance baseline recorded in docs/PERFORMANCE.md.

## 0.2.0 Notch states

Rename to Gabay. Notch expands on hover and collapses 400 ms after the pointer leaves, animated with a Motion spring inside the fixed window. Panel shows inert placeholders (four tabs, search bar, command bar).

## 0.1.0 Overlay kill test scaffold
