# Tray, Settings and startup

- **Tray icon:** click to show the panel; right-click for Show, Launch at login and Quit. Launch at login works only in
  the packaged app (it is greyed out in dev). A second launch just opens the panel of the running instance.
- **Always shown (default):** the notch stays visible, and steps aside by itself while a video, game or any window is full
  screen on its display (a maximized window doesn't count). Rest the pointer on the very top edge, within the notch's width,
  to bring it back while hidden; it slides away again shortly after the pointer leaves.
- **Smart** (Settings, Notch visibility): the notch steps aside only while a window is under it, so it never covers a browser
  tab, and stays up on the desktop. Rest the pointer on the top edge to bring it back. A short delay on the way back keeps
  it from blinking when you drag a window past.
- **Auto-hide** (Settings): the notch is always tucked away until revealed that way, so it never covers a browser tab.
- **Lock, sleep and Remote Desktop:** locking the PC closes the panel and lets go of the mouse (a tour in progress stays
  to finish). Unlocking or waking, which is also when a Remote Desktop session takes over with its own screens and
  scaling, puts the notch back on top and in place, again once the screens settle, and the taskbar setting back in force.
  Follow mouse holds still while the PC is locked.
- **Reserve space at the top** (Settings > Taskbar, off by default): a 24 px clear band (nothing is painted, so the desktop shows through and the notch still looks like it floats) across the top of the notch's
  screen, registered with Windows as an app bar (the taskbar's mechanism), so maximized and snapped windows start below
  the notch. Windows already open when it turns on (snapped or placed at the top, where Windows leaves them) move down
  to start below it, keeping their bottom edge, and so do windows that open or come back from minimized at the very top;
  turning it off moves windows that start right below the band back up. Each time it turns on the band gets a new window
  and its requests go straight to Explorer (not through Gabay's own tray window), because on some PCs Explorer otherwise
  leaves the band out of the usable area; if something keeps resetting that area the band steps back for a while and
  tries again later, rather than giving up. Only app windows on that screen: nothing
  always on top, full screen, a dialog or Gabay's own. Windows you drag up by hand can still go under it. Full-screen
  apps still get the whole screen.
- Full screen, now playing, notifications, the window list, focus and volume come from one small native helper (about
  25 MB, no measurable CPU) compiled once from `electron/nativeSource.ts` with the C# compiler built into Windows, against
  the Windows Runtime metadata in `System32\WinMetadata`, and cached in `%APPDATA%\gabay\bin`. Without that compiler
  those features quietly go away and the notch simply stays visible.
- **Language** (Settings): English or Filipino. The text lives in `src/fil.ts` (the English sentence is the key; anything missing shows in English), looked up with `tr()` from `src/i18n.ts`. Release notes and the Windows-provided names stay in English.
- **Settings tab:** grouped into General (hotkey, language), Notch (visibility, which display or Follow mouse, how long the
  pointer must stay away before the panel collapses, accent colour), Notifications, Features (recent files, lyrics, the Shinji tab,
  weather city, calendar), Taskbar (experimental), Help and feedback (shortcuts, tour, review, **Report a bug**) and
  About Gabay (version, updates, What's new, reset, quit).
- **Report a bug** (Settings): describe the problem, then send it as a prefilled GitHub issue or copy it to paste in a
  chat. It adds the Gabay and Windows versions, screen setup, a few settings and recent error messages, with user names
  and home folders removed. Nothing from the clipboard, notifications, calendar or files.
- **The search bar** shows only on Launch (apps and commands) and Clipboard (filter). The hotkey opens Launch.
- **Inbox tab:** recent Windows notifications grouped by app (the app with the newest one first), including ones Do not disturb kept quiet. Open or dismiss one, clear one app's, or clear all; an app with many shows its newest three and Show more. They are held in memory only: never saved to disk, and gone when Gabay quits.
- **Notes tab:** one scratchpad that saves as you type (to `notes.json` in `%APPDATA%\gabay`), with copy and clear.
- **What's new:** the first start after an update shows a short note in the notch; Settings › What's new lists it
  (`src/whatsNew.ts`, one entry per release).
- **Settings extras:** Shortcuts and commands (every hotkey, gesture and typed command), and Reset to defaults (settings
  only; to-dos, notes, pinned clips and the calendar stay).
- **Welcome tour:** the first start opens the notch into a four-step tour; Settings > Welcome tour shows it again. Preview it
  with `GABAY_PREVIEW='Welcome'`. Saved to `settings.json` in `%APPDATA%\gabay`; the main process validates every value.
- The app and tray icons are drawn in `resources/` (a notch plus a compass, since gabay means guide); edit `resources/icon.svg` / `tray.svg` and run `npx electron scripts/render-icons.cjs` to regenerate the PNGs.

## Shinji tab (companion)
Off by default (Settings > Features > Shinji tab). A tab for the separate Shinji OS app, which runs a small console on this
PC. The main process reads its `/api/status` and `/api/usage` from the saved address (`shinjiUrl` in `settings.json`,
default `http://127.0.0.1:3000`; plain http on this PC only, never changed from the page) and passes the page small,
validated values. The page can also send a typed question and ask to open the console in the browser. It polls only
while the tab is open. Check the reply parsing with `npm run check:shinji`.
