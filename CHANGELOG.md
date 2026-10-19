# Changelog

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
