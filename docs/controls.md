# Controls tab and status

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
