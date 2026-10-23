import { motion } from 'motion/react'
import Icon from './Icon'
import type { IconName } from './icons'
import { tr } from './i18n'

export interface Toast {
  id: number
  icon: IconName
  /** Album art or another image; replaces the icon. */
  art?: string
  title: string
  sub?: string
  /** Small caps label above the title (the app a notification came from). */
  label?: string
  tone?: 'accent' | 'warn' | 'plain'
  /** 0..1 ring around the icon (battery level while charging). */
  ring?: number
  ms?: number
  /** A Windows notification: it can be dismissed or its app opened. */
  noteId?: number
}

const R = 17
const C = 2 * Math.PI * R

/** What the notch shows while it is briefly grown for a toast, like an iPhone's Dynamic Island alert. */
export default function NotchToast({ toast, actions }: { toast: Toast; actions?: { onDismiss: () => void; onOpen: () => void } }): React.JSX.Element {
  const tone = toast.tone ?? 'plain'
  return (
    <motion.div
      key={toast.id}
      className={`toast toast-${tone}`}
      initial={{ opacity: 0, scale: 0.92, filter: 'blur(4px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)' }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
    >
      <span className="toast-lead">
        {toast.art ? (
          <img src={toast.art} alt="" draggable={false} />
        ) : (
          <span className="toast-well">
            <Icon name={toast.icon} size={18} />
          </span>
        )}
        {toast.ring !== undefined && (
          <svg className="toast-ring" width="42" height="42" viewBox="0 0 42 42" aria-hidden="true">
            <circle cx="21" cy="21" r={R} className="toast-ring-bg" />
            <motion.circle
              cx="21"
              cy="21"
              r={R}
              className="toast-ring-fg"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - toast.ring) }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
              transform="rotate(-90 21 21)"
            />
          </svg>
        )}
      </span>
      <span className="toast-text" data-acts={toast.noteId !== undefined ? '1' : undefined}>
        {toast.label && <span className="toast-label">{toast.label}</span>}
        <span className="toast-title">{toast.title}</span>
        {toast.sub && <span className="toast-sub">{toast.sub}</span>}
      </span>
      {toast.noteId !== undefined && actions && (
        <span className="toast-actions">
          <button type="button" className="toast-act" aria-label={tr('Open the app')} title={tr('Open the app')} onClick={actions.onOpen}>
            <Icon name="app-window" size={15} />
          </button>
          <button type="button" className="toast-act" aria-label={tr('Dismiss')} title={tr('Dismiss')} onClick={actions.onDismiss}>
            <Icon name="x" size={15} />
          </button>
        </span>
      )}
    </motion.div>
  )
}
