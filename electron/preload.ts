import { contextBridge, ipcRenderer } from 'electron'

// The only surface the renderer gets. Keep in sync with src/global.d.ts.
contextBridge.exposeInMainWorld('overlay', {
  setInteractive: (interactive: boolean): void => {
    ipcRenderer.send('overlay:set-interactive', interactive)
  },
  getStats: () => ipcRenderer.invoke('stats:get')
})
