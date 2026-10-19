import { contextBridge, ipcRenderer } from 'electron'

// The only surface the renderer gets. Keep in sync with src/global.d.ts.
contextBridge.exposeInMainWorld('overlay', {
  setInteractive: (interactive: boolean): void => {
    ipcRenderer.send('overlay:set-interactive', interactive)
  },
  getStats: () => ipcRenderer.invoke('stats:get'),
  searchApps: (query: string) => ipcRenderer.invoke('launcher:search', query),
  launchApp: (id: string) => ipcRenderer.invoke('launcher:launch', id),
  toggleStar: (id: string) => ipcRenderer.invoke('launcher:toggle-star', id),
  runPower: (action: string) => ipcRenderer.invoke('power:run', action),
  // Subscribe to the global-hotkey summon. Returns an unsubscribe function.
  onSummon: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('overlay:summon', handler)
    return () => ipcRenderer.removeListener('overlay:summon', handler)
  }
})
