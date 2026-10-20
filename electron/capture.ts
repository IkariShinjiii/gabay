import { app, desktopCapturer, type Display } from 'electron'
import { writeImage } from './clipboardHistory'
import { logError } from './diagnostics'
import { createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Screenshots and screen recordings. Files go to the user's own Pictures\Screenshots and Videos\Gabay folders; names
// are generated here (the renderer never names a path). Gabay's window is excluded from captures by the caller
// (setContentProtection), so the notch never appears in them.

const stamp = (): string => {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`
}

/** Full-resolution PNG of one display, saved and copied to the clipboard. Returns a small thumbnail for the toast. */
export async function screenshot(display: Display): Promise<{ thumb: string; file: string } | null> {
  const size = { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) }
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
  const src = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!src || src.thumbnail.isEmpty()) return null
  const dir = join(app.getPath('pictures'), 'Screenshots')
  await mkdir(dir, { recursive: true })
  const file = join(dir, `Gabay ${stamp()}.png`)
  await writeFile(file, src.thumbnail.toPNG())
  await writeImage(src.thumbnail)
  return { thumb: src.thumbnail.resize({ width: 160 }).toDataURL(), file }
}

/** The screen source to record: the notch's display. */
export async function screenSource(display: Display): Promise<Electron.DesktopCapturerSource | null> {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
  return sources.find((s) => s.display_id === String(display.id)) ?? sources[0] ?? null
}

let out: WriteStream | null = null
let outFile = ''

export async function recordingStart(): Promise<boolean> {
  if (out) return false
  const dir = join(app.getPath('videos'), 'Gabay')
  await mkdir(dir, { recursive: true })
  outFile = join(dir, `Recording ${stamp()}.webm`)
  const stream = createWriteStream(outFile)
  stream.on('error', (e) => {
    logError('recording', e) // disk full or the folder went away: stop writing, keep Gabay running
    if (out === stream) out = null
  })
  out = stream
  return true
}

const MAX_CHUNK = 64 * 1024 * 1024
export function recordingChunk(data: unknown): void {
  if (!out || !(data instanceof Uint8Array) || data.byteLength > MAX_CHUNK) return
  out.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
}

export function recordingStop(): Promise<string | null> {
  const o = out
  out = null
  if (!o) return Promise.resolve(null)
  return new Promise((resolve) => o.end(() => resolve(outFile)))
}

export const isRecording = (): boolean => out !== null
