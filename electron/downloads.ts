import { app } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

// Browser downloads in progress, from the Downloads folder: Chrome, Edge and Brave write "<name>.crdownload", Firefox
// "<name>.part". While one exists its size is read once a second; when it disappears and the final file is there, the
// download finished. Nothing runs while no download is active (only the folder watcher, which is event-driven).

export interface DownloadState {
  name: string
  bytes: number
}

const TEMP = /\.(crdownload|part|partial|download)$/i

let watcher: FSWatcher | null = null
let poll: NodeJS.Timeout | undefined
const active = new Map<string, number>() // temp file -> bytes so far

export function startDownloads(onProgress: (d: DownloadState | null) => void, onDone: (name: string) => void): void {
  const dir = app.getPath('downloads')
  const finalName = (temp: string): string =>
    temp.replace(TEMP, '').replace(/^Unconfirmed \d+$/, '') // Chromium's placeholder before the real name is known

  const tick = async (): Promise<void> => {
    for (const f of [...active.keys()]) {
      try {
        active.set(f, (await stat(join(dir, f))).size)
      } catch {
        // Gone: renamed to its final name (done) or cancelled.
        active.delete(f)
        const name = finalName(f)
        if (name) {
          try {
            await stat(join(dir, name))
            onDone(name)
          } catch {
            // cancelled
          }
        }
      }
    }
    if (!active.size) {
      clearInterval(poll)
      poll = undefined
      onProgress(null)
      return
    }
    // The biggest download in progress is the one shown.
    const [f, bytes] = [...active.entries()].sort((a, b) => b[1] - a[1])[0]
    onProgress({ name: finalName(f) || 'Download', bytes })
  }

  try {
    watcher = watch(dir, (_event, file) => {
      if (!file || !TEMP.test(file) || active.has(file)) return
      active.set(file, 0)
      poll ??= setInterval(() => void tick(), 1000)
    })
  } catch {
    // No Downloads folder: feature off.
  }
}

export function stopDownloads(): void {
  watcher?.close()
  clearInterval(poll)
}
