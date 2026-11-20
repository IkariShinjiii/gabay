# Taskbar (Phase A)

Gabay does not touch the Windows taskbar. To use the notch as the main surface, turn on the Windows setting yourself:
Settings > Personalization > Taskbar > Taskbar behaviors > **Automatically hide the taskbar**.

- The notch is at the top edge and the taskbar at the bottom, so they never overlap on a normal layout.
- Reach the tray by moving the pointer to the bottom edge; Windows reveals the taskbar natively (kill-test item 6 passed).
- Fully reversible: turn the setting off again. Gabay changes no Windows settings.

## Hide the taskbar and use the dock (Settings)

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
