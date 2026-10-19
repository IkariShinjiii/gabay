export interface OverlayApi {
  /** true: window captures the mouse. false: click-through (events forwarded for mousemove only). */
  setInteractive(interactive: boolean): void
  /** CPU/RAM snapshot. Only call while the System tab is visible. */
  getStats(): Promise<SystemStats>
  /** Fuzzy-search Start Menu apps. Empty query returns starred, then recent. */
  searchApps(query: string): Promise<LauncherItem[]>
  launchApp(id: string): Promise<boolean>
  /** Returns the new starred state. */
  toggleStar(id: string): Promise<boolean>
  /** Fires when the global hotkey is pressed. Returns an unsubscribe function. */
  onSummon(cb: () => void): () => void
}

export interface LauncherItem {
  id: string
  name: string
  starred: boolean
}

export interface SystemStats {
  cpuPercent: number
  ramUsedBytes: number
  ramTotalBytes: number
}

declare global {
  interface Window {
    overlay: OverlayApi
  }
}
