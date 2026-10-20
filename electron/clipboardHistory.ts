import { app, clipboard, ClipboardItem, nativeImage, type NativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { writeJsonAtomic } from './atomicWrite'
import { join } from 'node:path'

export interface ClipItem {
  id: string
  preview: string // single-line, truncated: the renderer never receives the full text
  pinned: boolean
  /** Small thumbnail (data URL) for copied images. */
  image?: string
}

interface Item {
  id: string
  text: string
  pinned: boolean
  // Images are memory-only (never written to disk, can't be pinned), kept as compressed PNG bytes, and capped by count
  // and total size.
  image?: { png: Buffer; width: number; height: number; thumb: string; hash: string }
}
const MAX_IMAGES = 10
const MAX_IMAGE_BYTES = 60 * 1024 * 1024 // all images together
const MAX_IMAGE_PIXELS = 40_000_000

const POLL_MS = 1000 // Electron has no clipboard change event, so a slow poll
const MAX_UNPINNED = 50
const MAX_PINNED = 50
const MAX_CHARS = 10_000
const PREVIEW_CHARS = 160
const RESULT_LIMIT = 30

// Known limit: Electron 44's clipboard API only checks MIME types, so Windows' "exclude from history" format
// (set by password managers) can't be read. Secrets copied from a password manager WILL appear here until you
// clear them or quit; that's why unpinned history is memory-only and there is a Clear action.

// Privacy: unpinned history lives in memory only and disappears when Gabay quits. Only items the user
// pins are written to disk (plain text, in userData), because pinning is the opt-in to keep something.
let items: Item[] = [] // newest first
let lastSeen = ''
let timer: NodeJS.Timeout | undefined

const storePath = (): string => join(app.getPath('userData'), 'clipboard-pinned.json')

async function loadPinned(): Promise<void> {
  try {
    const raw = JSON.parse(await readFile(storePath(), 'utf8')) as { id?: unknown; text?: unknown }[]
    const pinned = raw.flatMap((r) =>
      typeof r.id === 'string' && typeof r.text === 'string' && r.text.length <= MAX_CHARS
        ? [{ id: r.id, text: r.text, pinned: true }]
        : []
    )
    items = [...items.filter((i) => !i.pinned), ...pinned.slice(0, MAX_PINNED)]
  } catch {
    // no file yet, or unreadable: start with no pins
  }
}

async function savePinned(): Promise<void> {
  const pinned = items.filter((i) => i.pinned && !i.image).map(({ id, text }) => ({ id, text }))
  await writeJsonAtomic(storePath(), pinned)
}

let polling = false
// Asks whether the current clipboard may be kept (see the native helper's clipok). Unset or unanswered means yes.
let guard: () => Promise<boolean> = async () => true
// Windows' clipboard sequence number: a cheap "did anything change?" so the clipboard itself is only read after a copy.
let sequence: () => Promise<number | null> = async () => null
let lastSeq: number | null = null
let seeded = false // the first sequence number seen is a baseline, not a copy
export function setClipboardGuard(fn: () => Promise<boolean>, seq: () => Promise<number | null>): void {
  guard = fn
  sequence = seq
}

export async function writeImage(img: NativeImage): Promise<void> {
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(img.toPNG())], { type: 'image/png' }) })])
}

function recordImage(png: Buffer): void {
  if (png.length > MAX_IMAGE_BYTES) return
  const img = nativeImage.createFromBuffer(png)
  const { width, height } = img.getSize()
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) return
  const hash = createHash('sha1').update(png).digest('hex')
  const existing = items.find((i) => i.image?.hash === hash)
  const thumb = existing?.image?.thumb ?? img.resize({ width: Math.min(160, width) }).toDataURL()
  const entry = existing ?? { id: randomUUID(), text: '', pinned: false, image: { png, width, height, thumb, hash } }
  items = [entry, ...items.filter((i) => i !== entry)]
  // Newest images win: drop the oldest past the count or total-size cap.
  let bytes = 0
  let count = 0
  const drop = new Set<Item>()
  for (const i of items) {
    if (!i.image) continue
    count++
    bytes += i.image.png.length
    if (count > MAX_IMAGES || bytes > MAX_IMAGE_BYTES) drop.add(i)
  }
  if (drop.size) items = items.filter((i) => !drop.has(i))
}

async function poll(): Promise<void> {
  if (polling) return // a slow read must not stack up
  polling = true
  try {
    const seq = await sequence()
    if (seq !== null) {
      if (!seeded) {
        // First number after start (the helper may come up after us): whatever is there now is not a new copy.
        seeded = true
        lastSeq = seq
        return
      }
      if (seq === lastSeq) return
    }
    await readNewCopy(seq)
    // Only now is this copy handled; if reading threw (another app held the clipboard), the next tick retries it.
    if (seq !== null) lastSeq = seq
  } catch {
    // clipboard busy (another app holds it); try again next tick
  } finally {
    polling = false
  }
}

async function readNewCopy(seq: number | null): Promise<void> {
  const text = (await clipboard.has('text/plain')) ? await clipboard.readText() : ''
  if (!text && (await clipboard.has('image/png'))) {
    if (seq === null) return // no change signal: don't re-read big images every second
    if (!(await guard())) return
    const item = (await clipboard.read()).find((i) => i.types.includes('image/png'))
    const blob = item ? await item.getType('image/png') : null
    if (blob instanceof Blob) recordImage(Buffer.from(await blob.arrayBuffer()))
    return
  }
  if (!text || text === lastSeen) return
  lastSeen = text
  if (!text.trim() || text.length > MAX_CHARS) return
  if (!(await guard())) return // a password manager or private window asked not to be remembered
  record(text)
}

function record(text: string): void {

  const existing = items.find((i) => i.text === text)
  const entry = existing ?? { id: randomUUID(), text, pinned: false }
  // Newest first: re-copying something moves it back to the top without duplicating it.
  items = [entry, ...items.filter((i) => i !== entry)]
  const unpinned = items.filter((i) => !i.pinned)
  if (unpinned.length > MAX_UNPINNED) {
    const drop = new Set(unpinned.slice(MAX_UNPINNED))
    items = items.filter((i) => !drop.has(i))
  }
}

export function startClipboardHistory(): void {
  void loadPinned()
  // Whatever is on the clipboard at launch is not "new": the first poll just records it as seen.
  void clipboard.readText().then((t) => {
    lastSeen = t
  })
  timer = setInterval(() => void poll(), POLL_MS)
}

export function stopClipboardHistory(): void {
  clearInterval(timer)
}

const preview = (t: string): string => t.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_CHARS)

/** Pinned items first, then newest. Optional case-insensitive substring filter. */
export function listClipboard(query: string): ClipItem[] {
  const q = query.trim().toLowerCase().slice(0, 100)
  const ordered = [...items.filter((i) => i.pinned), ...items.filter((i) => !i.pinned)]
  return ordered
    .filter((i) => !q || (!i.image && i.text.toLowerCase().includes(q)) || (!!i.image && 'image'.includes(q)))
    .slice(0, RESULT_LIMIT)
    .map((i) =>
      i.image
        ? { id: i.id, preview: `Image · ${i.image.width}×${i.image.height}`, pinned: false, image: i.image.thumb }
        : { id: i.id, preview: preview(i.text), pinned: i.pinned }
    )
}

export async function copyBack(id: string): Promise<boolean> {
  const item = items.find((i) => i.id === id)
  if (!item) return false
  if (item.image) await writeImage(nativeImage.createFromBuffer(item.image.png))
  else {
    await clipboard.writeText(item.text)
    lastSeen = item.text // our own write is not a new copy
  }
  items = [item, ...items.filter((i) => i !== item)]
  return true
}

export async function togglePin(id: string): Promise<boolean> {
  const item = items.find((i) => i.id === id)
  if (!item || item.image) return false
  if (!item.pinned && items.filter((i) => i.pinned).length >= MAX_PINNED) return false
  item.pinned = !item.pinned
  await savePinned()
  return item.pinned
}

/** Forget everything unpinned (pinned items stay). */
export function clearHistory(): void {
  items = items.filter((i) => i.pinned)
}
