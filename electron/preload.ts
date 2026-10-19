import { contextBridge, ipcRenderer } from 'electron'

// The only surface the renderer gets. Keep in sync with src/global.d.ts.
contextBridge.exposeInMainWorld('overlay', {
  setInteractive: (interactive: boolean): void => {
    ipcRenderer.send('overlay:set-interactive', interactive)
  },
  quickGet: () => ipcRenderer.invoke('quick:get'),
  quickSet: (action: unknown) => ipcRenderer.invoke('quick:set', action),
  quickOpen: (key: string) => ipcRenderer.invoke('quick:open', key),
  networkKind: () => ipcRenderer.invoke('network:kind'),
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
  runPower: (action: string) => ipcRenderer.invoke('power:run', action),
  // Subscribe to the global-hotkey summon. Returns an unsubscribe function.
  onSummon: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('overlay:summon', handler)
    return () => ipcRenderer.removeListener('overlay:summon', handler)
  }
})
