export interface OverlayApi {
  /** true: window captures the mouse. false: click-through (events forwarded for mousemove only). */
  setInteractive(interactive: boolean): void
}

declare global {
  interface Window {
    overlay: OverlayApi
  }
}
