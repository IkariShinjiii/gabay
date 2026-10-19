import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Flat layout: electron/ (main + preload), src/ (renderer), index.html at the root.
// Preload must stay CommonJS (no "type": "module" in package.json) so the sandbox can load it.
export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'electron/main.ts') } } }
  },
  preload: {
    build: { rollupOptions: { input: { index: resolve(__dirname, 'electron/preload.ts') } } }
  },
  renderer: {
    root: __dirname,
    build: { rollupOptions: { input: { index: resolve(__dirname, 'index.html') } } },
    plugins: [react()]
  }
})
