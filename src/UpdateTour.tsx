import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import Icon from './Icon'
import type { IconName } from './icons'
import { tr } from './i18n'

interface Step {
  icons: IconName[]
  title: string
  text: string
}

// A short tour for releases that change where things are. Shown once after updating to that version (instead of the
// "Updated" toast), and again from Settings › What's new. Strings are English keys, translated when shown.
const TOURS: Record<string, Step[]> = {
  '1.4.0': [
    {
      icons: ['bell'],
      title: 'New: the Inbox tab',
      text: 'Your recent notifications in one list, including the ones Do not disturb kept quiet. Nothing is saved to disk.'
    },
    {
      icons: ['calendar', 'mic'],
      title: 'Your month, your microphone',
      text: 'Click the date on Today to see the whole month. Mute your microphone from Controls.'
    },
    {
      icons: ['bell', 'sliders-horizontal', 'monitor'],
      title: 'A fuller dock',
      text: 'With the taskbar hidden, the dock at the bottom of this panel now opens Notifications, Quick Settings and Show desktop. Right-click a pinned app to move it left or right.'
    },
    {
      icons: ['layers', 'pin'],
      title: 'Replace the taskbar',
      text: 'Settings › Hide the Windows taskbar can now hide it completely and show your tray icons in the dock (experimental). Enjoying Gabay? Rate it in Settings.'
    }
  ]
}

export const hasTour = (version: string): boolean => Object.hasOwn(TOURS, version)

interface Props {
  version: string
  onDone: () => void
  /** Ends the tour and opens the Settings tab. */
  onOpenSettings: () => void
}

/** What changed in this version, in a few steps in the open notch. Holds the panel open until finished or skipped. */
export default function UpdateTour({ version, onDone, onOpenSettings }: Props): React.JSX.Element {
  const steps = TOURS[version] ?? []
  // screenshot previews can start on a later step (#preview=Tour&step=2)
  const [step, setStep] = useState(() => Math.max(0, Math.min(steps.length - 1, Number(new URLSearchParams(location.hash.slice(1)).get('step')) || 0)))
  const [dir, setDir] = useState(1)
  const go = (i: number): void => {
    setDir(i > step ? 1 : -1)
    setStep(Math.max(0, Math.min(steps.length - 1, i)))
  }
  const s = steps[step]
  if (!s) return <div className="body welcome" />
  const last = step === steps.length - 1

  return (
    <div className="body welcome tour">
      <span className="tour-label">{tr("What's new in {0}", version)}</span>
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
          <div className="wl-art tour-icons" aria-hidden="true">
            {s.icons.map((n, i) => (
              <span key={n + i} style={{ animationDelay: `${i * 80}ms` }}>
                <Icon name={n} size={22} />
              </span>
            ))}
          </div>
          <h2 className="wl-title">{tr(s.title)}</h2>
          <p className="wl-text">{tr(s.text)}</p>
        </motion.div>
      </AnimatePresence>
      <div className="wl-foot">
        <span className="q-dots" aria-label={tr('Step {0} of {1}', step + 1, steps.length)}>
          {steps.map((_, i) => (
            <button key={i} className={i === step ? 'q-dot on' : 'q-dot'} aria-label={tr('Step {0}', i + 1)} onClick={() => go(i)} />
          ))}
        </span>
        <span className="wl-buttons">
          {step > 0 && (
            <button className="btn small" onClick={() => go(step - 1)}>
              {tr('Back')}
            </button>
          )}
          {last && (
            <button className="btn small" onClick={onOpenSettings}>
              {tr('Open Settings')}
            </button>
          )}
          <button className="btn small wl-next" onClick={() => (last ? onDone() : go(step + 1))}>
            {last ? tr('Done') : tr('Next')}
          </button>
        </span>
      </div>
    </div>
  )
}
