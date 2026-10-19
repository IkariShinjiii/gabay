import { useEffect, useState } from 'react'
import type { SettingsSnapshot } from './global'
import { COLLAPSE_RANGE } from './constants'

interface Props {
  /** Tells the notch the new collapse delay immediately, without a reload. */
  onCollapseMs: (ms: number) => void
}

/**
 * Buttons and a slider rather than <select>: a native dropdown opens its own popup window, which would take
 * the pointer off the notch and collapse the panel under the user.
 */
export default function SettingsPanel({ onCollapseMs }: Props): React.JSX.Element {
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null)
  const [delay, setDelay] = useState<number | null>(null)

  useEffect(() => {
    void window.overlay.getSettings().then((r) => {
      setSnap(r)
      setDelay(r.settings.collapseMs)
    })
  }, [])

  const save = async (patch: Parameters<typeof window.overlay.setSettings>[0]): Promise<void> => {
    const r = await window.overlay.setSettings(patch)
    setSnap(r)
    onCollapseMs(r.settings.collapseMs)
  }

  if (!snap || delay === null) return <div className="body body-center">Loading…</div>

  const { settings, activeHotkey, hotkeys, displays } = snap
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
          min={COLLAPSE_RANGE.min}
          max={COLLAPSE_RANGE.max}
          step={COLLAPSE_RANGE.step}
          value={delay}
          onChange={(e) => setDelay(Number(e.target.value))}
          onPointerUp={() => void save({ collapseMs: delay })}
          onKeyUp={() => void save({ collapseMs: delay })}
        />
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
