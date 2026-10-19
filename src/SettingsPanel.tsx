import { useEffect, useRef, useState } from 'react'
import type { SettingsSnapshot } from './global'
import { COLLAPSE_STEP_MS } from './constants'

interface Props {
  /** Tells the notch the new settings immediately, without a reload. */
  onSettings: (s: SettingsSnapshot['settings']) => void
}

/**
 * Buttons and a slider rather than <select>: a native dropdown opens its own popup window, which would take
 * the pointer off the notch and collapse the panel under the user.
 */
export default function SettingsPanel({ onSettings }: Props): React.JSX.Element {
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null)
  const [delay, setDelay] = useState<number | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    void window.overlay.getSettings().then((r) => {
      setSnap(r)
      setDelay(r.settings.collapseMs)
    })
  }, [])

  const save = async (patch: Parameters<typeof window.overlay.setSettings>[0]): Promise<void> => {
    try {
      const r = await window.overlay.setSettings(patch)
      setSnap(r)
      onSettings(r.settings)
    } catch {
      // Main refused or is closing; the panel keeps showing the last good values.
    }
  }

  // The slider commits shortly after the last change, whether it was dragged, clicked or moved with the keys,
  // so there is one write per adjustment and nothing depends on pointer or key release events.
  const onDelay = (ms: number): void => {
    setDelay(ms)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void save({ collapseMs: ms }), 250)
  }
  useEffect(() => () => window.clearTimeout(saveTimer.current), [])

  if (!snap || delay === null) return <div className="body body-center">Loading…</div>

  const { settings, activeHotkey, hotkeys, displays, collapseRange } = snap
  const hotkeyTaken = activeHotkey !== settings.hotkey
  const shownDisplay = displays.some((d) => d.id === settings.displayId) ? settings.displayId : null

  return (
    <div className="body settings">
      <div className="set-row">
        <div className="set-label">Hotkey</div>
        <div className="set-opts">
          {hotkeys.map((k) => (
            <button
              key={k}
              className={k === activeHotkey ? 'chip on' : 'chip'}
              onClick={() => void save({ hotkey: k })}
            >
              {k.replace('Control', 'Ctrl')}
            </button>
          ))}
        </div>
        {hotkeyTaken && (
          <div className="set-note">
            {settings.hotkey.replace('Control', 'Ctrl')} is taken by another app.{' '}
            {activeHotkey ? `Using ${activeHotkey.replace('Control', 'Ctrl')} instead.` : 'No hotkey is active.'}
          </div>
        )}
      </div>

      <div className="set-row">
        <div className="set-label">
          Collapse delay <span className="set-val">{delay} ms</span>
        </div>
        <input
          type="range"
          className="slider"
          min={collapseRange.min}
          max={collapseRange.max}
          step={COLLAPSE_STEP_MS}
          value={delay}
          onChange={(e) => onDelay(Number(e.target.value))}
        />
      </div>

      <div className="set-row">
        <div className="set-label">Notch visibility</div>
        <div className="set-opts">
          <button
            className={settings.visibility === 'auto' ? 'chip on' : 'chip'}
            title="Hidden until you rest the pointer on the top edge, so it never covers a tab or button"
            onClick={() => void save({ visibility: 'auto' })}
          >
            Auto-hide
          </button>
          <button
            className={settings.visibility === 'always' ? 'chip on' : 'chip'}
            onClick={() => void save({ visibility: 'always' })}
          >
            Always shown
          </button>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">Show on</div>
        <div className="set-opts">
          <button className={shownDisplay === null ? 'chip on' : 'chip'} onClick={() => void save({ displayId: null })}>
            Primary
          </button>
          {displays.map((d) => (
            <button
              key={d.id}
              className={shownDisplay === d.id ? 'chip on' : 'chip'}
              onClick={() => void save({ displayId: d.id })}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
