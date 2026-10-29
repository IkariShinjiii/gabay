export interface OverlayApi {
  /** true: window captures the mouse. false: click-through (events forwarded for mousemove only). */
  setInteractive(interactive: boolean): void
  /** CPU/RAM snapshot. Only call while the System tab is visible. */
  getStats(): Promise<SystemStats>
  /** Volume, brightness, radios, keyboard layout and Wi-Fi name; helper process runs only while this is being polled. */
  quickGet(): Promise<QuickState>
  quickSet(action: QuickAction): Promise<QuickState>
  quickPeek(): Promise<QuickState | null>
  quickSlide(kind: 'volume' | 'brightness', value: number): Promise<void>
  /** Opens a fixed Windows Settings page by key. */
  quickOpen(key: SettingsKey): Promise<boolean>
  networkKind(): Promise<'wifi' | 'ethernet' | 'offline'>
  /** What this PC has; desktops often have no battery or Wi-Fi. */
  hardware(): Promise<{ battery: boolean; wifi: boolean } | null>
  /** Show desktop: minimize every window, or bring them back. */
  showDesktop(): Promise<boolean>
  /** Opens the Start menu (or closes it when it is open), as the taskbar's Start button does. */
  startMenu(): Promise<boolean>
  /** Opens Task view: every window, and the virtual desktops. */
  taskView(): Promise<boolean>
  /** Microphone mute state of the default recording device; null when there is none. */
  micGet(): Promise<boolean | null>
  micSet(muted: boolean): Promise<boolean | null>
  /** Whether Windows' own Do not disturb is on. */
  windowsDnd(): Promise<boolean>
  /** Remove a Windows notification (by the id Gabay was given), or open the app it came from. */
  noteDismiss(id: number): Promise<boolean>
  noteOpen(id: number): Promise<boolean>
  /** Win+P display mode: read the current one, or switch with Windows' DisplaySwitch. */
  projectGet(): Promise<ProjectMode>
  projectSet(mode: ProjectMode): Promise<boolean>
  /** Fuzzy-search Start Menu apps. Empty query returns starred, then recent. */
  searchApps(query: string): Promise<LauncherItem[]>
  /** Small PNG data URL for an app's icon, or null. Resolved in main; the renderer never sees a path. */
  appIcon(id: string): Promise<string | null>
  launchApp(id: string): Promise<boolean>
  /** Returns the new starred state. */
  toggleStar(id: string): Promise<boolean>
  /** Clipboard history, pinned first then newest. Previews only; full text never reaches the renderer. */
  listClipboard(query: string): Promise<ClipItem[]>
  /** To-dos (local file). Each call returns the updated list. */
  listTodos(): Promise<Todo[]>
  addTodo(text: string): Promise<Todo[]>
  toggleTodo(id: string): Promise<Todo[]>
  removeTodo(id: string): Promise<Todo[]>
  /** Forgets all unpinned history. */
  clearClips(): Promise<void>
  /** Puts the item back on the clipboard. */
  copyClip(id: string): Promise<boolean>
  /** Returns the new pinned state. Pinned items are the only ones saved to disk. */
  togglePin(id: string): Promise<boolean>
  /** Lock, sleep, restart or shut down. Confirmation for the last two is the caller's job (see PowerPanel). */
  runPower(action: PowerAction): Promise<boolean>
  getSettings(): Promise<SettingsSnapshot>
  /** Partial patch; main validates it and returns the settings now in effect. */
  setSettings(patch: Partial<Settings>): Promise<SettingsSnapshot>
  /** Settings back to defaults (to-dos, notes, pinned clips and calendar are kept). */
  resetSettings(): Promise<SettingsSnapshot>
  /** Quits Gabay (the taskbar comes back). */
  quit(): Promise<boolean>
  getNotes(): Promise<string>
  /** Saves the whole scratchpad; false if it is too long. */
  setNotes(text: string): Promise<boolean>
  /** Fires when the global hotkey is pressed. Returns an unsubscribe function. */
  onSummon(cb: () => void): () => void
  /** Now playing, from the native helper (art is a data URL). */
  mediaGet(): Promise<LiveMedia | null>
  mediaCommand(c: 'toggle' | 'next' | 'prev'): Promise<boolean>
  /** Changes volume by delta percent; returns the new level. */
  volumeNudge(delta: number): Promise<{ volume: number; muted: boolean } | null>
  listBluetooth(): Promise<{ name: string; connected: boolean }[]>
  mediaSeek(seconds: number): Promise<boolean>
  outputList(): Promise<OutputDevice[]>
  outputSet(id: string): Promise<boolean>
  mixerList(): Promise<MixerApp[]>
  mixerIcon(pid: number): Promise<string | null>
  mixerSet(pid: number, volume: number): Promise<boolean>
  /** Saves a PNG of the notch's screen to Pictures\Screenshots and copies it. Returns a thumbnail. */
  screenshot(): Promise<{ thumb: string } | null>
  /** Opens Windows' own region snip. */
  snip(): Promise<boolean>
  recStart(): Promise<boolean>
  recChunk(data: Uint8Array): void
  recStop(): Promise<boolean>
  weatherGet(): Promise<Weather | null>
  weatherFind(city: string): Promise<{ name: string; lat: number; lon: number } | null>
  lyricsGet(title: string, artist: string, duration: number): Promise<{ t: number; text: string }[] | null>
  /** The Windows accent colour as #rrggbb. */
  accentColor(): Promise<string | null>
  /** Opens a prefilled GitHub issue ('github') or copies the report ('copy'). Personal paths are scrubbed. */
  reportBug(description: string, how: 'github' | 'copy'): Promise<boolean>
  logError(msg: string): void
  /** Opens the Gabay review form on GitHub. */
  openReview(): Promise<boolean>
  onPrivacy(cb: (p: { mic: string[]; cam: string[] }) => void): () => void
  /** Open windows, while "Hide the Windows taskbar" is on. */
  /** Resolves once someone is using the PC (keyboard or mouse in the last few seconds). */
  whenPresent(): Promise<boolean>
  onWindows(cb: (w: DockApp[]) => void): () => void
  windowsGet(): Promise<DockApp[]>
  onTray(cb: (t: TrayIcon[]) => void): () => void
  trayGet(): Promise<TrayIcon[]>
  trayClick(id: string, button: 'l' | 'r'): Promise<boolean>
  /** Switch to an open window, or minimize it when it's the one in use. */
  windowsClick(id: string): Promise<boolean>
  /** Pictures of one dock app's windows, for the hover preview (null for minimized windows). */
  windowsThumbs(key: string): Promise<WindowThumb[]>
  /** Brings this window to the front (never minimizes it). */
  windowsFocus(id: string): Promise<boolean>
  /** Asks this window to close, like its X button. */
  windowsClose(id: string): Promise<boolean>
  /** Start a dock app (a pinned app that isn't open, or another window of one that is). */
  windowsLaunch(key: string): Promise<boolean>
  /** Right-click menu for a dock app; resolves when the menu closes. */
  windowsMenu(key: string): Promise<boolean>
  onDownload(cb: (d: DownloadState | null) => void): () => void
  onDownloadDone(cb: (name: string) => void): () => void
  listWifi(): Promise<{ networks: WifiNetwork[]; error: 'off' | 'location' | null }>
  connectWifi(ssid: string): Promise<boolean>
  disconnectWifi(): Promise<boolean>
  calendarGet(force: boolean): Promise<{ connected: boolean; events: CalEvent[]; error: boolean }>
  /** Saves the private iCal address (empty string forgets it). */
  calendarSet(url: string): Promise<boolean>
  updateGet(check: boolean): Promise<{ current: string; available: UpdateInfo | null; packaged: boolean }>
  updateInstall(): Promise<boolean>
  onMedia(cb: (m: LiveMedia | null) => void): () => void
  onNote(cb: (n: NoteInfo) => void): () => void
  onUpdate(cb: (u: UpdateInfo) => void): () => void
  /** Fires when a full-screen window appears on or leaves the notch's display. Returns an unsubscribe function. */
  onFullscreen(cb: (fullscreen: boolean) => void): () => void
  /** Fires when the Start menu opens or closes, while Gabay stands in for the taskbar. Returns an unsubscribe function. */
  onStart(cb: (open: boolean) => void): () => void
}

/** An open window, as the taskbar would show it. id is opaque; the program's path stays in main. */
export interface OpenWindow {
  id: string
  title: string
  minimized: boolean
  /** The window last in use before Gabay. */
  active: boolean
  /** Flashing for attention. */
  attention: boolean
}

/** One window in a dock hover preview. */
export interface WindowThumb {
  id: string
  title: string
  /** PNG data URL, or null when there is nothing to show (minimized). */
  thumb: string | null
}

/** One tray icon (from another app's notification area icon). */
export interface TrayIcon {
  id: string
  tip: string
  icon: string
}

/** One icon in the dock: an app, with its open windows (none for a pinned app that isn't running). */
export interface DockApp {
  key: string
  name: string
  icon: string | null
  pinned: boolean
  wins: OpenWindow[]
}

export interface Settings {
  hotkey: string
  collapseMs: number
  displayId: number | null
  followMouse: boolean
  notifications: boolean
  notePreview: boolean
  noteSound: boolean
  reserveTop: boolean
  accent: string
  place: { name: string; lat: number; lon: number } | null
  lyrics: boolean
  dndUntil: number
  welcomed: boolean
  reviewAt: number
  seenVersion: string
  visibility: 'always' | 'auto'
  hideTaskbar: boolean
  taskbarFull: boolean
  trayIcons: boolean
  autoUpdate: boolean
  updateChannel: 'stable' | 'preview'
  language: 'en' | 'fil'
  taskbarWasAutoHide: boolean | null
}

export interface SettingsSnapshot {
  settings: Settings
  /** The hotkey actually registered, which differs from settings.hotkey when another app owns it. */
  activeHotkey: string | null
  hotkeys: string[]
  /** Gabay's version, e.g. 1.0.0. */
  version: string
  /** Whether Windows lets Gabay read notifications ('Allowed', 'Denied', ...); null until known. */
  notificationAccess: string | null
  collapseRange: { min: number; max: number }
  displays: { id: number; label: string; detail: string }[]
}

export interface Todo {
  id: string
  text: string
  done: boolean
}

export interface ClipItem {
  id: string
  preview: string
  pinned: boolean
  image?: string
}

export type PowerAction = 'lock' | 'sleep' | 'restart' | 'shutdown'

export interface LauncherItem {
  id: string
  name: string
  starred: boolean
}

export interface QuickState {
  volume: number | null
  muted: boolean
  brightness: number | null
  layout: string
  radios: { wifi?: boolean; bluetooth?: boolean }
  airplane: boolean | null
  audioName: string | null
  dark: boolean | null
  media: MediaInfo | null
  wifi: { ssid: string | null; signal: number | null }
}

export interface MediaInfo {
  title: string
  artist: string
  playing: boolean
  position: number
  duration: number
  updated: number
  art: string | null
}

export type QuickAction =
  | { kind: 'volume'; value: number }
  | { kind: 'mute' }
  | { kind: 'brightness'; value: number }
  | { kind: 'radio'; radio: 'wifi' | 'bluetooth'; on: boolean }
  | { kind: 'airplane' }
  | { kind: 'dark'; on: boolean }
  | { kind: 'media'; command: 'toggle' | 'next' | 'prev' }

export type ProjectMode = 'internal' | 'clone' | 'extend' | 'external'

export type SettingsKey =
  | 'energy'
  | 'airplane'
  | 'wifi'
  | 'notifyaccess'
  | 'accessibility'
  | 'display'
  | 'colors'
  | 'captions'
  | 'hotspot'
  | 'nearby'
  | 'cast'
  | 'sound'
  | 'notifications'
  | 'network'
  | 'bluetooth'
  | 'settings'

export interface SystemStats {
  cpuPercent: number
  ramUsedBytes: number
  ramTotalBytes: number
  diskUsedBytes: number
  diskTotalBytes: number
}

declare global {
  interface Window {
    overlay: OverlayApi
  }
}

export interface LiveMedia {
  title: string
  artist: string
  app: string
  playing: boolean
  duration: number
  /** data: URL, or '' when the player gives none */
  art: string
}

export interface NoteInfo {
  /** Identifies the notification for dismiss and open. */
  id?: number
  app: string
  title: string | null
  body: string | null
  /** Play the notification sound (Windows' Do not disturb is on, so Windows is silent). */
  sound?: boolean
  /** Do not disturb is on: keep it for the inbox, show no toast. */
  quiet?: boolean
}

export interface WifiNetwork {
  ssid: string
  signal: number
  secure: boolean
  known: boolean
  connected: boolean
}

export interface CalEvent {
  title: string
  start: number
  end: number
  allDay: boolean
  location: string
}

export interface UpdateInfo {
  version: string
  notes: string
}

export interface OutputDevice {
  id: string
  name: string
  kind: 'speakers' | 'headphones' | 'display'
  current: boolean
}
export interface MixerApp {
  pid: number
  name: string
  volume: number
}

export interface Weather {
  place: string
  temp: number
  code: number
  day: boolean
  high: number
  low: number
  at: number
}

export interface DownloadState {
  name: string
  bytes: number
}
