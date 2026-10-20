import { useCallback, useEffect, useRef, useState } from 'react'

// Screen recording of the notch's display (with system audio) to Videos\Gabay. Main answers getDisplayMedia only
// after rec:start, writes the chunks to a file it names itself, and hides Gabay from the capture.

export interface Recorder {
  /** Wall-clock start while recording, else null. */
  startedAt: number | null
  start: () => Promise<void>
  stop: () => void
}

const pickType = (): string =>
  ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''

export function useRecorder(onSaved: (ok: boolean) => void): Recorder {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const saved = useRef(onSaved)
  saved.current = onSaved

  const start = useCallback(async (): Promise<void> => {
    if (rec.current) return
    if (!(await window.overlay.recStart())) return
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })
      const mr = new MediaRecorder(stream, { mimeType: pickType(), videoBitsPerSecond: 6_000_000 })
      // Chunks go to main strictly in order, even though reading each Blob is async.
      let queue = Promise.resolve()
      mr.ondataavailable = (e): void => {
        if (!e.data.size) return
        queue = queue.then(async () => window.overlay.recChunk(new Uint8Array(await e.data.arrayBuffer())))
      }
      const s = stream
      mr.onstop = (): void => {
        s.getTracks().forEach((t) => t.stop())
        void queue.then(async () => saved.current(await window.overlay.recStop()))
      }
      // The person stopping the share from Windows ends the recording too.
      s.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (rec.current === mr) {
          rec.current = null
          setStartedAt(null)
          mr.stop()
        }
      })
      mr.start(1000)
      rec.current = mr
      setStartedAt(Date.now())
    } catch {
      stream?.getTracks().forEach((t) => t.stop())
      await window.overlay.recStop()
      saved.current(false)
    }
  }, [])

  const stop = useCallback((): void => {
    const mr = rec.current
    rec.current = null
    setStartedAt(null)
    if (mr && mr.state !== 'inactive') mr.stop()
  }, [])

  // Closing Gabay mid-recording still finishes the file.
  useEffect(() => () => stop(), [stop])

  return { startedAt, start, stop }
}
