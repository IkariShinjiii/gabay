import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { tr } from './i18n'

const SAVE_MS = 400
const MAX_CHARS = 100_000

/**
 * Quick notes: one scratchpad that saves as you type (a moment after the last key) and when the tab closes.
 * Typing holds the notch open, like the other text fields.
 */
export default function NotesPanel({ onHold }: { onHold: (held: boolean) => void }): React.JSX.Element {
  const [text, setText] = useState<string | null>(null)
  const [state, setState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [confirmClear, setConfirmClear] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef<string | null>(null)
  const dirty = useRef(false)

  useEffect(() => {
    void window.overlay.getNotes().then(
      (t) => {
        latest.current = t
        setText(t)
      },
      () => setText('')
    )
  }, [])

  const save = async (): Promise<void> => {
    window.clearTimeout(timer.current)
    if (!dirty.current || latest.current === null) return
    dirty.current = false
    setState('saving')
    const ok = await window.overlay.setNotes(latest.current).catch(() => false)
    setState(ok ? 'saved' : 'error')
  }

  // Save what's pending when the tab closes; release the hold if the field was focused.
  useEffect(
    () => () => {
      void save()
      onHold(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const change = (t: string): void => {
    setText(t)
    latest.current = t
    dirty.current = true
    setState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void save(), SAVE_MS)
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text ?? '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard refused: nothing to undo.
    }
  }

  if (text === null) return <div className="body body-center muted">{tr('Opening notes…')}</div>

  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return (
    <div className="body notes">
      <textarea
        className="notes-field"
        placeholder={tr('Jot something down. It saves as you type.')}
        spellCheck
        maxLength={MAX_CHARS}
        value={text}
        aria-label={tr('Quick notes')}
        onChange={(e) => change(e.target.value)}
        onFocus={() => onHold(true)}
        onBlur={() => {
          onHold(false)
          void save()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur()
        }}
      />
      <div className="notes-foot">
        <span className={state === 'error' ? 'notes-state err' : 'notes-state'}>
          {state === 'error' ? "Couldn't save. Try again in a moment." : state === 'saving' ? 'Saving…' : 'Saved'} · {words} {words === 1 ? 'word' : 'words'}
        </span>
        {confirmClear ? (
          <span className="notes-actions">
            <span className="notes-ask">{tr('Clear the whole note?')}</span>
            <button
              className="chip danger"
              onClick={() => {
                change('')
                setConfirmClear(false)
              }}
            >
              {tr('Clear')}
            </button>
            <button className="chip" onClick={() => setConfirmClear(false)}>
              {tr('Keep')}
            </button>
          </span>
        ) : (
          <span className="notes-actions">
            <button className="chip" disabled={!text} onClick={() => void copy()} title={tr('Copy the whole note')}>
              <Icon name={copied ? 'check' : 'copy'} size={13} />
              {copied ? tr('Copied') : tr('Copy')}
            </button>
            <button className="chip" disabled={!text} onClick={() => setConfirmClear(true)}>
              {tr('Clear')}
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
