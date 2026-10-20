import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeJsonAtomic } from './atomicWrite'

// Quick notes: one scratchpad, saved as you type to notes.json in userData. Plain text on this PC only.

const MAX_CHARS = 100_000
const file = (): string => join(app.getPath('userData'), 'notes.json')
let cache: string | null = null

export async function getNotes(): Promise<string> {
  if (cache !== null) return cache
  try {
    const raw = JSON.parse(await readFile(file(), 'utf8')) as { text?: unknown }
    cache = typeof raw.text === 'string' ? raw.text.slice(0, MAX_CHARS) : ''
  } catch {
    cache = ''
  }
  return cache
}

/** Saves the whole note. Returns false for anything that isn't text within the size limit. */
export async function setNotes(text: unknown): Promise<boolean> {
  if (typeof text !== 'string' || text.length > MAX_CHARS) return false
  cache = text
  await writeJsonAtomic(file(), { text })
  return true
}
