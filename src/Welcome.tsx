import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Icon from './Icon'
import { ACCENT_PRESETS, applyAccent, resolveAccent } from './accent'

interface Props {
  /** The global hotkey that is actually registered (it can differ from the saved one), or null. */
  hotkey: string | null
  accent: string
  onAccent: (name: string) => void
  onDone: () => void
}

const STEPS = 4

/** The first-run tour: four short steps in the open notch. Shown once; Settings can show it again. */
export default function Welcome({ hotkey, accent, onAccent, onDone }: Props): React.JSX.Element {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [picked, setPicked] = useState(accent)
  const go = (i: number): void => {
    setDir(i > step ? 1 : -1)
    setStep(Math.max(0, Math.min(STEPS - 1, i)))
  }
  const keys = (hotkey ?? '').replace('Control', 'Ctrl').split('+').filter(Boolean)

  const pick = (name: string): void => {
    setPicked(name)
    void resolveAccent(name).then(applyAccent) // preview at once; saved when the tour ends
    onAccent(name)
  }

  let art: React.JSX.Element
  let title: string
  let text: React.JSX.Element
  if (step === 0) {
    art = (
      <div className="wl-art wl-notch">
        <span className="wl-pill">
          <Icon name="wifi" size={11} />
          <b>9:41</b>
          <Icon name="battery-full" size={12} />
        </span>
      </div>
    )
    title = "Hi, I'm Gabay."
    text = <>Your taskbar, folded into the notch at the top of the screen. Hover the notch to open it; move away and it closes.</>
  } else if (step === 1) {
    art = (
      <div className="wl-art wl-keys">
        {keys.length ? keys.map((k) => <kbd key={k}>{k}</kbd>) : <kbd>Hover</kbd>}
      </div>
    )
    title = 'Everything is one hover away.'
    text = (
      <>
        Controls, your day, apps, clipboard and power live in these tabs.{' '}
        {keys.length ? <>Press {keys.join(' + ')} any time to search your apps.</> : 'Pick a search hotkey in Settings.'}
      </>
    )
  } else if (step === 2) {
    art = (
      <div className="wl-art wl-edge">
        <span className="wl-line" />
        <Icon name="arrow-left" size={16} />
      </div>
    )
    title = 'I step aside for full screen.'
    text = <>When a video or game fills the screen, I hide. Rest the pointer on the very top edge to bring me back.</>
  } else {
    art = (
      <div className="wl-art wl-swatches" role="radiogroup" aria-label="Accent colour">
        {Object.entries(ACCENT_PRESETS).map(([key, a]) => (
          <button
            key={key}
            role="radio"
            aria-checked={picked === key}
            aria-label={`${a.label} accent`}
            title={a.label}
            className={picked === key ? 'swatch on' : 'swatch'}
            style={a.hex ? { background: a.hex } : undefined}
            onClick={() => pick(key)}
          >
            {key === 'windows' && <span className="swatch-win">W</span>}
          </button>
        ))}
      </div>
    )
    title = 'Make it yours.'
    text = <>Pick an accent colour. Settings has the rest: weather, your calendar, Focus, and which screen I sit on.</>
  }

  return (
    <div className="body welcome">
      <button className="wl-skip" onClick={onDone}>
        Skip
      </button>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div
          key={step}
          className="wl-step"
          initial={{ x: dir * 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: dir * -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        >
          {art}
          <h2 className="wl-title">{title}</h2>
          <p className="wl-text">{text}</p>
        </motion.div>
      </AnimatePresence>
      <div className="wl-foot">
        <span className="q-dots" aria-label={`Step ${step + 1} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => (
            <button key={i} className={i === step ? 'q-dot on' : 'q-dot'} aria-label={`Step ${i + 1}`} onClick={() => go(i)} />
          ))}
        </span>
        <span className="wl-buttons">
          {step > 0 && (
            <button className="btn small" onClick={() => go(step - 1)}>
              Back
            </button>
          )}
          <button className="btn small wl-next" onClick={() => (step === STEPS - 1 ? onDone() : go(step + 1))}>
            {step === STEPS - 1 ? 'Start using Gabay' : 'Next'}
          </button>
        </span>
      </div>
    </div>
  )
}
