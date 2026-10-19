export interface OverlayApi {
  /** true: window captures the mouse. false: click-through (events forwarded for mousemove only). */
  setInteractive(interactive: boolean): void
  /** CPU/RAM snapshot. Only call while the System tab is visible. */
  getStats(): Promise<SystemStats>
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
