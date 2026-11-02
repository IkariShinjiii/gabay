// Reads a download to the end while saying how far it has got. Kept free of Electron so it can be tested on its own.

export interface DownloadOptions {
  /** Expected size in bytes, 0 if unknown. The response's own Content-Length wins when it has one. */
  size: number
  /** Gives up once more than this has come in (a wrong or endless file). */
  maxBytes: number
  /** Gives up when no data has arrived for this long (a dead connection), however slow the line is otherwise. */
  stallMs: number
  /** Gives up after this long in all. */
  totalMs: number
  /** Bytes so far and the total (0 if unknown), at most about four times a second, and once at the end. */
  onProgress: (received: number, total: number) => void
}

type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>

/** The whole body, or null if the request failed, stalled, ran too long or grew too big. */
export async function downloadWithProgress(fetchFn: Fetch, url: string, o: DownloadOptions): Promise<Buffer | null> {
  const ctl = new AbortController()
  let stall: ReturnType<typeof setTimeout> | undefined
  const alive = (): void => {
    clearTimeout(stall)
    stall = setTimeout(() => ctl.abort(), o.stallMs)
  }
  const limit = setTimeout(() => ctl.abort(), o.totalMs)
  try {
    alive()
    const res = await fetchFn(url, { signal: ctl.signal })
    if (!res.ok || !res.body) return null
    const total = Number(res.headers.get('content-length')) || o.size || 0
    if (total > o.maxBytes) return null
    o.onProgress(0, total)
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    let told = Date.now()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      alive()
      chunks.push(value)
      received += value.byteLength
      if (received > o.maxBytes) {
        ctl.abort()
        return null
      }
      if (Date.now() - told >= 250) {
        told = Date.now()
        o.onProgress(received, total)
      }
    }
    o.onProgress(received, total)
    return Buffer.concat(chunks)
  } catch {
    return null // aborted (stalled, too long) or the connection dropped
  } finally {
    clearTimeout(stall)
    clearTimeout(limit)
  }
}
