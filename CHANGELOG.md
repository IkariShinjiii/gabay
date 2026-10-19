# Changelog

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
