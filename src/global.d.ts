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
  /** Fires when the global hotkey is pressed. Returns an unsubscribe function. */
  onSummon(cb: () => void): () => void
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
}

export type PowerAction = 'lock' | 'sleep' | 'restart' | 'shutdown'

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
