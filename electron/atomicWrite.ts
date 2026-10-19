import { rename, writeFile } from 'node:fs/promises'

// Last write queued per file. Chaining makes concurrent saves run one after another in call order,
// so two overlapping saves can't both use the same temp file and fail on the second rename.
const queues = new Map<string, Promise<void>>()

/** Write JSON to `path` via a temp file and rename, so a crash mid-write never leaves a half-written store. */
export function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const body = JSON.stringify(data) // snapshot now; a later call to this function queues behind this one
  const run = async (): Promise<void> => {
    const tmp = path + '.tmp'
    await writeFile(tmp, body, 'utf8')
    await rename(tmp, path)
  }
  const prev = queues.get(path) ?? Promise.resolve()
  const next = prev.then(run, run) // a failed earlier save must not block this one
  queues.set(path, next.catch(() => undefined))
  return next
}
