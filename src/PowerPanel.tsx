import { useEffect, useState } from 'react'
import type { PowerAction } from './global'

interface Props {
  /** A restart/shutdown asked for by the command bar: open its confirmation (never runs directly). */
  request: PowerAction | null
  onRequestHandled: () => void
  /** Told whenever the confirmation prompt opens or closes, so the panel can't collapse under it. */
  onConfirming: (confirming: boolean) => void
  /** Called after an action was sent, so the panel can close. */
  onDone: () => void
}

const ACTIONS: { action: PowerAction; label: string; confirm: boolean }[] = [
  { action: 'lock', label: 'Lock', confirm: false },
  { action: 'sleep', label: 'Sleep', confirm: false },
  { action: 'restart', label: 'Restart', confirm: true },
  { action: 'shutdown', label: 'Shut down', confirm: true }
]

export default function PowerPanel({ request, onRequestHandled, onConfirming, onDone }: Props): React.JSX.Element {
  const [pending, setPending] = useState<PowerAction | null>(null)

  const confirming = (a: PowerAction | null): void => {
    setPending(a)
    onConfirming(a !== null)
  }

  useEffect(() => {
    if (!request) return
    confirming(request)
    onRequestHandled()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  // Leaving the tab (or collapsing) while a prompt is open must release the hold.
  useEffect(() => () => onConfirming(false), [onConfirming])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') confirming(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  const run = async (action: PowerAction): Promise<void> => {
    confirming(null)
    await window.overlay.runPower(action)
    onDone()
  }

  if (pending) {
    const label = ACTIONS.find((a) => a.action === pending)!.label.toLowerCase()
    return (
      <div className="body body-center confirm">
        <div className="confirm-text">{`Really ${label} now?`}</div>
        <div className="confirm-sub">Unsaved work in open apps may be lost.</div>
        <div className="confirm-buttons">
          {/* Cancel is first and autofocused so a stray Enter never powers the machine off. */}
          <button className="btn" autoFocus onClick={() => confirming(null)}>
            Cancel
          </button>
          <button className="btn danger" onClick={() => void run(pending)}>
            {label.charAt(0).toUpperCase() + label.slice(1)}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="body power">
      {ACTIONS.map(({ action, label, confirm }) => (
        <button key={action} className="power-btn" onClick={() => (confirm ? confirming(action) : void run(action))}>
          {label}
        </button>
      ))}
    </div>
  )
}
