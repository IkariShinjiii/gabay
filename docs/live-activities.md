# Live activities and alerts

- **The collapsed pill** shows, besides the clock, network and battery: the weather (Settings > Weather), and an iPhone-style dot while an app uses the camera (green) or microphone (orange). It widens as needed.
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
- **Focus** (Controls, do not disturb): until you turn it off, for an hour, until 6 PM or until 7 AM, the pill shows
  only the time (plus the camera/microphone and recording dots, which guard your privacy), and nothing pops
  up or plays a sound. Notifications still collect in the Inbox. Timers you set still ring, and your own screenshots and
  recordings still confirm.
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
  you (Settings > Install), or for you to be away a few minutes with automatic updates on. While it downloads, the pill
  shows a ring and the percentage, and Settings shows the same progress even after closing and reopening; pressing
  Install again joins the download already running. A download that receives nothing for a minute gives up.
  The installer must come from this repo's releases and match the SHA-512 in the release's
  `latest.yml`, or it is thrown away. To publish one: `npm run dist`, then attach `dist/Gabay Setup <v>.exe` and
  `dist/latest.yml` to a GitHub release tagged `v<version>`.
