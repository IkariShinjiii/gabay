import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Icon from './Icon'
import { ACCENT_PRESETS, applyAccent, resolveAccent } from './accent'
import { tr } from './i18n'

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
    title = tr("Hi, I'm Gabay.")
    text = <>{tr('Your taskbar, folded into the notch at the top of the screen. Hover the notch to open it; move away and it closes.')}</>
  } else if (step === 1) {
    art = (
      <div className="wl-art wl-keys">
        {keys.length ? keys.map((k) => <kbd key={k}>{k}</kbd>) : <kbd>{tr('Hover')}</kbd>}
      </div>
    )
    title = tr('Everything is one hover away.')
    text = (
      <>
        {tr('Your day, controls, notifications, notes and apps live in these tabs. Clipboard and power are inside Controls.')}{' '}
        {keys.length ? <>{tr('Press {0} any time to search your apps.', keys.join(' + '))}</> : tr('Pick a search hotkey in Settings.')}
      </>
    )
  } else if (step === 2) {
    art = (
      <div className="wl-art wl-edge">
        <span className="wl-line" />
        <Icon name="arrow-left" size={16} />
      </div>
    )
    title = tr('I step aside for full screen.')
    text = <>{tr('When a video or game fills the screen, I hide. Rest the pointer on the very top edge to bring me back.')}</>
  } else {
    art = (
      <div className="wl-art wl-swatches" role="radiogroup" aria-label={tr('Accent colour')}>
        {Object.entries(ACCENT_PRESETS).map(([key, a]) => (
          <button
            key={key}
            role="radio"
            aria-checked={picked === key}
            aria-label={tr('{0} accent', tr(a.label))}
            title={tr(a.label)}
            className={picked === key ? 'swatch on' : 'swatch'}
            style={a.hex ? { background: a.hex } : undefined}
            onClick={() => pick(key)}
          >
            {key === 'windows' && <span className="swatch-win">W</span>}
          </button>
        ))}
      </div>
    )
    title = tr('Make it yours.')
    text = <>{tr('Pick an accent colour. Settings has the rest: weather, your calendar, Focus, and which screen I sit on.')}</>
  }

  return (
    <div className="body welcome">
      <button className="wl-skip" onClick={onDone}>
        {tr('Skip')}
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
        <span className="q-dots" aria-label={tr('Step {0} of {1}', step + 1, STEPS)}>
          {Array.from({ length: STEPS }, (_, i) => (
            <button key={i} className={i === step ? 'q-dot on' : 'q-dot'} aria-label={tr('Step {0}', i + 1)} onClick={() => go(i)} />
          ))}
        </span>
        <span className="wl-buttons">
          {step > 0 && (
            <button className="btn small" onClick={() => go(step - 1)}>
              {tr('Back')}
            </button>
          )}
          <button className="btn small wl-next" onClick={() => (step === STEPS - 1 ? onDone() : go(step + 1))}>
            {step === STEPS - 1 ? tr('Start using Gabay') : tr('Next')}
          </button>
        </span>
      </div>
    </div>
  )
}
