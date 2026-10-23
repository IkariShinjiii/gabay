import { contextBridge, ipcRenderer } from 'electron'

// The only surface the renderer gets. Keep in sync with src/global.d.ts.
contextBridge.exposeInMainWorld('overlay', {
  setInteractive: (interactive: boolean): void => {
    ipcRenderer.send('overlay:set-interactive', interactive)
  },
  quickGet: () => ipcRenderer.invoke('quick:get'),
  quickSet: (action: unknown) => ipcRenderer.invoke('quick:set', action),
  quickPeek: () => ipcRenderer.invoke('quick:peek'),
  quickSlide: (kind: string, value: number) => ipcRenderer.invoke('quick:slide', kind, value),
  quickOpen: (key: string) => ipcRenderer.invoke('quick:open', key),
  networkKind: () => ipcRenderer.invoke('network:kind'),
  hardware: () => ipcRenderer.invoke('hardware:get'),
  windowsDnd: () => ipcRenderer.invoke('windows:dnd'),
  noteDismiss: (id: number) => ipcRenderer.invoke('note:dismiss', id),
  noteOpen: (id: number) => ipcRenderer.invoke('note:open', id),
  projectGet: () => ipcRenderer.invoke('project:get'),
  projectSet: (mode: string) => ipcRenderer.invoke('project:set', mode),
  getStats: () => ipcRenderer.invoke('stats:get'),
  searchApps: (query: string) => ipcRenderer.invoke('launcher:search', query),
  appIcon: (id: string) => ipcRenderer.invoke('launcher:icon', id),
  launchApp: (id: string) => ipcRenderer.invoke('launcher:launch', id),
  toggleStar: (id: string) => ipcRenderer.invoke('launcher:toggle-star', id),
  listClipboard: (query: string) => ipcRenderer.invoke('clipboard:list', query),
  listTodos: () => ipcRenderer.invoke('todos:list'),
  addTodo: (text: string) => ipcRenderer.invoke('todos:add', text),
  toggleTodo: (id: string) => ipcRenderer.invoke('todos:toggle', id),
  removeTodo: (id: string) => ipcRenderer.invoke('todos:remove', id),
  clearClips: () => ipcRenderer.invoke('clipboard:clear'),
  copyClip: (id: string) => ipcRenderer.invoke('clipboard:copy', id),
  togglePin: (id: string) => ipcRenderer.invoke('clipboard:toggle-pin', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  getNotes: () => ipcRenderer.invoke('notes:get'),
  setNotes: (text: string) => ipcRenderer.invoke('notes:set', text),
  runPower: (action: string) => ipcRenderer.invoke('power:run', action),
  mediaGet: () => ipcRenderer.invoke('media:get'),
  mediaCommand: (c: string) => ipcRenderer.invoke('media:command', c),
  volumeNudge: (delta: number) => ipcRenderer.invoke('volume:nudge', delta),
  listBluetooth: () => ipcRenderer.invoke('bt:list'),
  mediaSeek: (seconds: number) => ipcRenderer.invoke('media:seek', seconds),
  mixerList: () => ipcRenderer.invoke('mixer:list'),
  mixerIcon: (pid: number) => ipcRenderer.invoke('mixer:icon', pid),
  mixerSet: (pid: number, volume: number) => ipcRenderer.invoke('mixer:set', pid, volume),
  screenshot: () => ipcRenderer.invoke('capture:shot'),
  snip: () => ipcRenderer.invoke('capture:snip'),
  recStart: () => ipcRenderer.invoke('rec:start'),
  recChunk: (data: Uint8Array): void => ipcRenderer.send('rec:chunk', data),
  recStop: () => ipcRenderer.invoke('rec:stop'),
  weatherGet: () => ipcRenderer.invoke('weather:get'),
  weatherFind: (city: string) => ipcRenderer.invoke('weather:find', city),
  lyricsGet: (title: string, artist: string, duration: number) => ipcRenderer.invoke('lyrics:get', title, artist, duration),
  accentColor: () => ipcRenderer.invoke('theme:accent'),
  reportBug: (description: string, how: 'github' | 'copy') => ipcRenderer.invoke('bug:report', description, how),
  logError: (msg: string): void => ipcRenderer.send('log:error', msg),
  onPrivacy: (cb: (p: unknown) => void): (() => void) => {
    const handler = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('overlay:privacy', handler)
    return () => ipcRenderer.removeListener('overlay:privacy', handler)
  },
  onWindows: (cb: (w: unknown) => void): (() => void) => {
    const handler = (_e: unknown, w: unknown): void => cb(w)
    ipcRenderer.on('overlay:windows', handler)
    return () => ipcRenderer.removeListener('overlay:windows', handler)
  },
  whenPresent: () => ipcRenderer.invoke('presence:wait'),
  windowsGet: () => ipcRenderer.invoke('windows:get'),
  windowsClick: (id: string) => ipcRenderer.invoke('windows:click', id),
  windowsLaunch: (key: string) => ipcRenderer.invoke('windows:launch', key),
  windowsMenu: (key: string) => ipcRenderer.invoke('windows:menu', key),
  onDownload: (cb: (d: unknown) => void): (() => void) => {
    const handler = (_e: unknown, d: unknown): void => cb(d)
    ipcRenderer.on('overlay:download', handler)
    return () => ipcRenderer.removeListener('overlay:download', handler)
  },
  onDownloadDone: (cb: (name: unknown) => void): (() => void) => {
    const handler = (_e: unknown, n: unknown): void => cb(n)
    ipcRenderer.on('overlay:download-done', handler)
    return () => ipcRenderer.removeListener('overlay:download-done', handler)
  },
  listWifi: () => ipcRenderer.invoke('wifi:list'),
  connectWifi: (ssid: string) => ipcRenderer.invoke('wifi:connect', ssid),
  disconnectWifi: () => ipcRenderer.invoke('wifi:disconnect'),
  calendarGet: (force: boolean) => ipcRenderer.invoke('calendar:get', force),
  calendarSet: (url: string) => ipcRenderer.invoke('calendar:set', url),
  updateGet: (check: boolean) => ipcRenderer.invoke('update:get', check),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  onMedia: (cb: (m: unknown) => void): (() => void) => {
    const handler = (_e: unknown, m: unknown): void => cb(m)
    ipcRenderer.on('overlay:media', handler)
    return () => ipcRenderer.removeListener('overlay:media', handler)
  },
  onNote: (cb: (n: unknown) => void): (() => void) => {
    const handler = (_e: unknown, n: unknown): void => cb(n)
    ipcRenderer.on('overlay:note', handler)
    return () => ipcRenderer.removeListener('overlay:note', handler)
  },
  onUpdate: (cb: (u: unknown) => void): (() => void) => {
    const handler = (_e: unknown, u: unknown): void => cb(u)
    ipcRenderer.on('overlay:update', handler)
    return () => ipcRenderer.removeListener('overlay:update', handler)
  },
  // Subscribe to full-screen changes on the notch's display. Returns an unsubscribe function.
  onFullscreen: (cb: (fullscreen: boolean) => void): (() => void) => {
    const handler = (_e: unknown, fs: unknown): void => cb(fs === true)
    ipcRenderer.on('overlay:fullscreen', handler)
    return () => ipcRenderer.removeListener('overlay:fullscreen', handler)
  },
  // Subscribe to the global-hotkey summon. Returns an unsubscribe function.
  onSummon: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('overlay:summon', handler)
    return () => ipcRenderer.removeListener('overlay:summon', handler)
  }
})
