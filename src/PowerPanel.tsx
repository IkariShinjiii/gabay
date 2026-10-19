import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Icon from './Icon'
import type { IconName } from './icons'
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

const ACTIONS: { action: PowerAction; label: string; confirm: boolean; icon: IconName }[] = [
  { action: 'lock', label: 'Lock', confirm: false, icon: 'lock' },
  { action: 'sleep', label: 'Sleep', confirm: false, icon: 'moon' },
  { action: 'restart', label: 'Restart', confirm: true, icon: 'rotate-cw' },
  { action: 'shutdown', label: 'Shut down', confirm: true, icon: 'power' }
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

  const pendingAction = pending ? ACTIONS.find((a) => a.action === pending)! : null
  const SWAP = { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.97 } }

  return (
    <div className="body power-wrap">
      <AnimatePresence mode="wait" initial={false}>
        {pendingAction ? (
          <motion.div key="confirm" className="power-confirm" {...SWAP} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}>
            <span className="power-confirm-icon">
              <Icon name={pendingAction.icon} size={18} />
            </span>
            <div className="power-confirm-text">
              <div className="confirm-text">{`${pendingAction.label} now?`}</div>
              <div className="confirm-sub">Unsaved work in open apps may be lost.</div>
            </div>
            {/* Cancel is first and autofocused so a stray Enter never powers the machine off. */}
            <button className="btn" autoFocus onClick={() => confirming(null)}>
              Cancel
            </button>
            <button className="btn danger" onClick={() => void run(pendingAction.action)}>
              {pendingAction.label}
            </button>
          </motion.div>
        ) : (
          <motion.div key="actions" className="power" {...SWAP} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}>
            {ACTIONS.map(({ action, label, confirm, icon }, i) => (
              <motion.button
                key={action}
                className="power-btn"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, type: 'spring', stiffness: 500, damping: 34 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => (confirm ? confirming(action) : void run(action))}
              >
                <Icon name={icon} size={18} />
                <span>{label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
