# Launcher and hotkey

- **Ctrl+Alt+G** (default) opens the panel with the search field focused. Pick another in the Settings tab (Ctrl+Shift+G,
  Ctrl+Alt+Space or Ctrl+Alt+J), or choose **Custom…** and press your own: two of Ctrl, Alt and Shift with a letter,
  number, F-key or Space (so it can never take over typing or shortcuts like Ctrl+C). The current hotkey is paused while
  you record, and Esc cancels. If another app owns the chosen combo, Gabay uses the next free one and Settings says so.
  No Win-key shortcuts. Ctrl+Alt+Space is taken by the Claude desktop app on the dev machine.
- Search covers everything the Start menu shows, including Store apps (via `Get-StartApps`), with Start Menu `.lnk`
  shortcuts as fallback. Fuzzy matching is a small built-in matcher. Enter launches, arrows move, Esc clears then releases focus.
- Files and folders in your user folder show below the apps, newest first, from Windows' own search index (what
  Explorer's search box uses; Gabay indexes nothing itself). Enter opens one; Ctrl+Enter or right-click opens its
  folder. App data and hidden folders are left out.
- Star an app with the star button to pin it to the Launch tab; recent launches are remembered.
- With nothing typed, Launch shows your pinned and recent apps, up to four **recent files** (Windows' own Recent list,
  the one Start and File Explorer use: local files that still exist, newest first), and an **All apps** row that opens
  every app A to Z with letter headings. Esc goes back. Recent files are hidden while Windows' "Show recently opened
  items" is off or a policy stops Windows keeping the list, and Settings › Recent files in Launch turns them off in
  Gabay. Gabay records nothing of its own here.
- Recents and stars live in `launcher.json` in Electron's userData folder (`%APPDATA%\gabay`). The renderer only handles opaque ids; paths never leave the main process.
- While the search field has focus the panel stays open even if the pointer is elsewhere.
