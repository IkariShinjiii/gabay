import { useEffect, useId, useRef, useState } from 'react'
import { latestTour } from './UpdateTour'
import type { SettingsSnapshot, UpdateInfo, UpdateProgress } from './global'
import { ACCENT_PRESETS } from './accent'
import Icon from './Icon'
import { notesFor } from './whatsNew'
import { COLLAPSE_STEP_MS } from './constants'
import { tr } from './i18n'
import Skeleton from './Skeleton'

interface Props {
  /** Tells the notch the new settings immediately, without a reload. */
  onSettings: (s: SettingsSnapshot['settings'], activeHotkey: string | null) => void
  /** A focused text field keeps the panel open. */
  onHold: (held: boolean) => void
  onShowWelcome: () => void
  onShowTour: (version: string) => void
  /** The hotkey App knows is registered (the snapshot's copy can be older). */
  liveHotkey: string | null
}

// Dev preview only: &open expands the folded rows, &bottom scrolls to the end, &scroll=<px> to a point, &updating shows
// an update halfway through downloading (for screenshots).
const previewFlags = new URLSearchParams(location.hash.slice(1))
const PREVIEW_OPEN = previewFlags.has('open')

const keysOf = (hotkey: string | null): string => (hotkey ? hotkey.replace('Control', 'Ctrl').split('+').join(' + ') : tr('No hotkey'))

// ---------- building blocks ----------
// A settings group is a title over one card of rows. A row has its name (and a line of help) on the left and its
// control on the right; a "stack" row puts a wide control (chips, a slider, a text field) under its name instead.

function Group({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }): React.JSX.Element {
  const id = useId()
  return (
    <section className="set-group" aria-labelledby={id}>
      <h3 className="set-group-title" id={id}>
        {title}
        {badge && <span className="set-badge">{badge}</span>}
      </h3>
      <div className="set-card">{children}</div>
    </section>
  )
}

function Row({ label, value, desc, stack, children, after, labelId, onLabelClick }: {
  label: string
  /** Shown beside the name, e.g. the current value. */
  value?: string | null
  desc?: React.ReactNode
  stack?: boolean
  children?: React.ReactNode
  /** Full-width notes under the row (warnings, recording hints). */
  after?: React.ReactNode
  labelId?: string
  onLabelClick?: () => void
}): React.JSX.Element {
  return (
    <div className={stack ? 'set-row stack' : 'set-row'}>
      <div className={onLabelClick ? 'set-text set-text-click' : 'set-text'} onClick={onLabelClick}>
        <div className="set-label" id={labelId}>
          {label}
          {value && <span className="set-val">{value}</span>}
        </div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      {children && <div className="set-ctl">{children}</div>}
      {after}
    </div>
  )
}

/** An on/off setting: a switch on the right; clicking the name flips it too. */
function SwitchRow({ label, desc, on, onChange }: { label: string; desc?: React.ReactNode; on: boolean; onChange: (on: boolean) => void }): React.JSX.Element {
  const id = useId()
  return (
    <Row label={label} desc={desc} labelId={id} onLabelClick={() => onChange(!on)}>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={id} className={on ? 'switch on' : 'switch'} onClick={() => onChange(!on)} />
    </Row>
  )
}

/** Two or three choices side by side. */
function Seg<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
}): React.JSX.Element {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'seg-btn on' : 'seg-btn'} aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A row that folds open to show more (lists, a form). */
function FoldRow({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <details className="set-row set-fold" open={PREVIEW_OPEN || undefined}>
      <summary>
        <span className="set-label">{label}</span>
        <Icon name="chevron-right" size={16} />
      </summary>
      <div className="set-fold-body">{children}</div>
    </details>
  )
}

// ---------- rows with their own state ----------

/** The accelerator for a key press ("Control+Alt+K"), or just the held modifiers while no key is down yet. */
function comboOf(e: KeyboardEvent): { mods: string[]; key: string | null } {
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter((m): m is string => !!m)
  const c = e.code
  const key = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit[0-9]$/.test(c) ? c.slice(5) : /^F([1-9]|1[0-9]|2[0-4])$/.test(c) ? c : c === 'Space' ? 'Space' : null
  return { mods, key }
}

/** Mirrors main's rule: two of Ctrl, Alt and Shift (one of them Ctrl or Alt), then a letter, digit, F-key or Space. */
const allowedCombo = (mods: string[], key: string | null): boolean =>
  key !== null && mods.length >= 2 && (mods.includes('Control') || mods.includes('Alt'))

/** The preset hotkeys, the saved custom one, and a chip that records a new shortcut. */
function HotkeyRow({ settings, activeHotkey, hotkeys, onHold, onPick }: {
  settings: SettingsSnapshot['settings']
  activeHotkey: string | null
  hotkeys: string[]
  onHold: (held: boolean) => void
  onPick: (hotkey: string) => Promise<void>
}): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  const [held, setHeld] = useState<string[]>([])
  const [bad, setBad] = useState(false)
  // Read through refs so a parent re-render never restarts a recording in progress.
  const cb = useRef({ onHold, onPick })
  cb.current = { onHold, onPick }

  useEffect(() => {
    if (!recording) return
    // The current hotkey is let go so pressing it again is recorded, and the panel stays open meanwhile.
    void window.overlay.pauseHotkey(true).catch(() => undefined)
    cb.current.onHold(true)
    const stop = (): void => setRecording(false)
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.repeat) return
      const { mods, key } = comboOf(e)
      if (e.key === 'Escape' && !mods.length) return stop()
      setHeld(mods)
      if (key === null) return // only modifiers so far
      if (!allowedCombo(mods, key)) return setBad(true)
      setBad(false)
      stop()
      void cb.current.onPick([...mods, key].join('+'))
    }
    const onUp = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopImmediatePropagation()
      setHeld(comboOf(e).mods)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onUp, true)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onUp, true)
      window.removeEventListener('blur', stop)
      setHeld([])
      cb.current.onHold(false)
      // Saving already registered the new one; otherwise this takes the old one back.
      void window.overlay.pauseHotkey(false).catch(() => undefined)
    }
  }, [recording])

  const custom = hotkeys.includes(settings.hotkey) ? null : settings.hotkey
  const hotkeyTaken = !recording && activeHotkey !== settings.hotkey
  return (
    <Row
      label={tr('Hotkey')}
      desc={tr('Open Gabay and search your apps')}
      stack
      after={
        <>
          {recording && (
            <div className={bad ? 'set-note' : 'set-note quiet'} role="status">
              {bad ? tr('Use two of Ctrl, Alt and Shift with a letter, number, F-key or Space.') : tr('Press the keys together. Esc cancels.')}
            </div>
          )}
          {hotkeyTaken && (
            <div className="set-note">
              {tr('{0} is taken by another app.', settings.hotkey.replace('Control', 'Ctrl'))}{' '}
              {activeHotkey ? tr('Using {0} instead.', activeHotkey.replace('Control', 'Ctrl')) : tr('No hotkey is active.')}
            </div>
          )}
        </>
      }
    >
      {[...hotkeys, ...(custom ? [custom] : [])].map((k) => (
        <button key={k} type="button" className={k === activeHotkey && !recording ? 'opt on' : 'opt'} aria-pressed={k === activeHotkey && !recording} onClick={() => void onPick(k)}>
          {k.replace('Control', 'Ctrl')}
        </button>
      ))}
      <button
        type="button"
        className={recording ? 'opt on' : 'opt'}
        aria-pressed={recording}
        onClick={() => {
          setBad(false)
          setRecording((r) => !r)
        }}
      >
        {recording ? (
          // as wide as its longest label throughout, so the row doesn't rewrap (and the panel jump) with each key
          <span className="chip-fit">
            <span aria-hidden="true">{tr('Press a shortcut…')}</span>
            <span aria-hidden="true">Ctrl+Alt+Shift+…</span>
            <span>{held.length ? held.join('+').replace('Control', 'Ctrl') + '+…' : tr('Press a shortcut…')}</span>
          </span>
        ) : (
          tr('Custom…')
        )}
      </button>
    </Row>
  )
}

/** Every hotkey, gesture and typed command in one place. */
function ShortcutsRow({ hotkey }: { hotkey: string | null }): React.JSX.Element {
  const groups: [string, [string, string][]][] = [
    ['Anywhere', [[keysOf(hotkey), 'Open Gabay and search your apps'], ['Rest on the top edge', 'Bring back a hidden notch']]],
    [
      'In the open notch',
      [
        ['Ctrl + 1 to 7', 'Switch tabs'],
        ['Scroll over the tabs', 'Change the volume'],
        ['Middle-click', 'Play or pause'],
        ['Esc', 'Clear the search, then let the notch close'],
        ['Ctrl + Enter on a file', 'Open its folder']
      ]
    ],
    [
      'Controls',
      [
        ['Scroll on a slider', 'Fine-tune it'],
        ['Arrow keys on a slider', '5% a step (Shift: 10%)'],
        ['Scroll elsewhere', 'Next or previous page']
      ]
    ],
    [
      'Type in Launch',
      [
        ['lock · sleep', 'Right away'],
        ['restart · shut down', 'Asks first'],
        ['focus 25 · pause · reset', 'The focus timer'],
        ['todo buy milk', 'Add a to-do'],
        ['open spotify', 'Open an app'],
        ['clear clips', 'Clear clipboard history'],
        ['tab notes', 'Go to a tab']
      ]
    ]
  ]
  return (
    <FoldRow label={tr('Shortcuts and commands')}>
      <div className="keys">
        {groups.map(([title, rows]) => (
          <div key={title} className="keys-group">
            <div className="keys-title">{tr(title)}</div>
            {rows.map(([k, what]) => (
              <div key={k} className="keys-row">
                <kbd>{tr(k)}</kbd>
                <span>{tr(what)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </FoldRow>
  )
}

function WhatsNewRow({ version, onTour }: { version: string; onTour: (version: string) => void }): React.JSX.Element {
  const tourVersion = latestTour(version)
  return (
    <FoldRow label={tr("What's new in {0}", version)}>
      <ul className="news">
        {notesFor(version).map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {tourVersion && (
        <div className="set-actions">
          <button type="button" className="set-btn" onClick={() => onTour(tourVersion)}>
            {tr('Take the tour')}
          </button>
        </div>
      )}
    </FoldRow>
  )
}

/** Settings back to defaults, after an on-screen confirmation (no browser dialogs in Gabay). */
function ResetRow({ onReset }: { onReset: () => Promise<void> }): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState(false)
  if (asking) {
    return (
      <Row label={tr('Reset settings')} desc={tr('Reset every setting to its default? To-dos, notes, pinned clips and your calendar stay.')} stack>
        <button
          type="button"
          className="set-btn danger"
          onClick={() =>
            void onReset().then(() => {
              setAsking(false)
              setDone(true)
            })
          }
        >
          {tr('Reset')}
        </button>
        <button type="button" className="set-btn" onClick={() => setAsking(false)}>
          {tr('Cancel')}
        </button>
      </Row>
    )
  }
  return (
    <Row label={tr('Reset settings')} desc={done ? tr('Done. Everything is back to how it started.') : undefined}>
      <button
        type="button"
        className="set-btn"
        onClick={() => {
          setDone(false)
          setAsking(true)
        }}
      >
        <Icon name="rotate-ccw" size={13} />
        {tr('Reset to defaults')}
      </button>
    </Row>
  )
}

/** Private iCal address: typed here, sent once to main (which encrypts it), never shown back. */
function CalendarRow({ onHold }: { onHold: (held: boolean) => void }): React.JSX.Element {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'bad'>('idle')
  useEffect(() => {
    void window.overlay.calendarGet(false).then((a) => setConnected(a.connected), () => setConnected(false))
  }, [])
  useEffect(() => () => onHold(false), [onHold])
  const save = async (url: string): Promise<void> => {
    setState('saving')
    const ok = await window.overlay.calendarSet(url).catch(() => false)
    if (!ok) return setState('bad')
    setState('idle')
    setDraft('')
    setConnected(url !== '')
    if (url) void window.overlay.calendarGet(true)
  }
  if (connected) {
    return (
      <Row label={tr('Calendar')} value={tr('connected')}>
        <button type="button" className="set-btn" onClick={() => void save('')}>
          {tr('Disconnect')}
        </button>
      </Row>
    )
  }
  return (
    <Row
      label={tr('Calendar')}
      stack
      after={
        <div className={state === 'bad' ? 'set-note' : 'set-desc'}>
          {state === 'bad'
            ? tr('That address did not work. It should start with https:// or webcal://.')
            : tr("Google Calendar: Settings › your calendar › Integrate calendar › Secret address in iCal format. It's stored encrypted on this PC.")}
        </div>
      }
    >
      <input
        className="field"
        type="password"
        aria-label={tr('Calendar')}
        placeholder={tr("Paste your calendar's secret iCal address")}
        spellCheck={false}
        autoComplete="off"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setState('idle')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) void save(draft)
          else if (e.key === 'Escape') e.currentTarget.blur()
        }}
        onFocus={() => onHold(true)}
        onBlur={() => onHold(false)}
      />
      <button type="button" className="set-btn primary" disabled={!draft.trim() || state === 'saving'} onClick={() => void save(draft)}>
        {state === 'saving' ? tr('Saving…') : tr('Connect')}
      </button>
    </Row>
  )
}

/** Type a city; it is looked up once (Open-Meteo) and saved as coordinates. */
function WeatherRow({ place, onHold, onSaved }: { place: string | null; onHold: (h: boolean) => void; onSaved: () => void }): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [state, setState] = useState<'idle' | 'finding' | 'none'>('idle')
  const find = async (): Promise<void> => {
    if (!draft.trim()) return
    setState('finding')
    const p = await window.overlay.weatherFind(draft).catch(() => null)
    if (!p) return setState('none')
    setState('idle')
    setDraft('')
    onSaved()
  }
  return (
    <Row label={tr('Weather')} value={place} stack after={state === 'none' && <div className="set-note">{tr("Couldn't find that place. Try the city name only.")}</div>}>
      <input
        className="field"
        aria-label={tr('Weather')}
        placeholder={place ? tr('Change city') : tr('Your city, e.g. Iloilo')}
        spellCheck={false}
        autoComplete="off"
        maxLength={100}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setState('idle')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void find()
          else if (e.key === 'Escape') e.currentTarget.blur()
        }}
        onFocus={() => onHold(true)}
        onBlur={() => onHold(false)}
      />
      <button type="button" className="set-btn primary" disabled={!draft.trim() || state === 'finding'} onClick={() => void find()}>
        {state === 'finding' ? tr('Finding…') : place ? tr('Change') : tr('Set')}
      </button>
    </Row>
  )
}

/** Report a bug: a description plus scrubbed app details, sent as a GitHub issue or copied for a chat. */
function ReportRow({ onHold }: { onHold: (h: boolean) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const [sent, setSent] = useState<'github' | 'copy' | null>(null)
  const send = async (how: 'github' | 'copy'): Promise<void> => {
    if (!text.trim()) return
    if (await window.overlay.reportBug(text, how).catch(() => false)) {
      setSent(how)
      if (how === 'github') setText('')
    }
  }
  return (
    <FoldRow label={tr('Report a bug')}>
      <textarea
        className="field report-field"
        aria-label={tr('Report a bug')}
        placeholder={tr('What went wrong, and what were you doing?')}
        spellCheck
        maxLength={2000}
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setSent(null)
        }}
        onFocus={() => onHold(true)}
        onBlur={() => onHold(false)}
      />
      <div className="set-actions">
        <button type="button" className="set-btn primary" disabled={!text.trim()} onClick={() => void send('github')} title={tr('Opens a prefilled issue on GitHub (needs a GitHub account)')}>
          {tr('Send on GitHub')}
        </button>
        <button type="button" className="set-btn" disabled={!text.trim()} onClick={() => void send('copy')} title={tr('Copies the report so you can paste it in a chat')}>
          {tr('Copy report')}
        </button>
      </div>
      <div className="set-desc">
        {sent === 'copy'
          ? tr('Copied. Paste it in a message to the developer.')
          : sent === 'github'
            ? tr('Opened in your browser. Press Submit there to send it.')
            : tr('Adds your Gabay and Windows versions, screen setup and recent errors. Nothing personal: no names, files, clipboard or messages.')}
      </div>
    </FoldRow>
  )
}

type UpdateState = { current: string; available: UpdateInfo | null; packaged: boolean }
const mbOf = (bytes: number): string => String(Math.max(0, Math.round(bytes / 1e6)))

/**
 * The version, and checking for or installing an update. The install runs in main, so its progress comes from there:
 * read when the row opens and followed live, so closing and reopening Settings mid-download shows where it is.
 */
function UpdateRow(): React.JSX.Element {
  // Dev preview (&updating): a download halfway through, with made-up numbers.
  const sample = previewFlags.has('updating')
  const [info, setInfo] = useState<UpdateState | null>(sample ? { current: '1.6.1', available: { version: '1.6.2', notes: '' }, packaged: true } : null)
  const [progress, setProgress] = useState<UpdateProgress | null>(sample ? { version: '1.6.2', phase: 'downloading', received: 47_000_000, total: 112_000_000 } : null)
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    if (sample) return
    void window.overlay.updateGet(false).then((r) => {
      setInfo(r)
      setProgress(r.progress)
    }, () => undefined)
    return window.overlay.onUpdateProgress(setProgress)
  }, [sample])
  const check = async (): Promise<void> => {
    setChecking(true)
    const r = await window.overlay.updateGet(true).catch(() => null)
    if (r) setInfo(r)
    setChecking(false)
  }
  const install = async (): Promise<void> => {
    if (!info?.available) return
    setProgress({ version: info.available.version, phase: 'downloading', received: 0, total: 0 })
    const ok = await window.overlay.updateInstall().catch(() => false)
    // main says "failed" itself when a download goes wrong; this covers it refusing to start at all
    if (!ok) setProgress((p) => (p && p.phase !== 'failed' ? { ...p, phase: 'failed' } : p))
  }
  const busy = progress !== null && progress.phase !== 'failed'
  const pct = progress && progress.total ? Math.min(100, Math.floor((progress.received / progress.total) * 100)) : null
  const label = !progress
    ? ''
    : progress.phase === 'downloading'
      ? pct !== null
        ? tr('Downloading… {0}%', pct)
        : tr('Downloading…')
      : progress.phase === 'verifying'
        ? tr('Checking…')
        : tr('Installing…')
  return (
    <Row
      label={tr('Version')}
      value={info?.current ?? null}
      desc={info && !info.packaged ? tr('Updates work in the installed app.') : progress?.phase === 'installing' ? tr('Gabay restarts in a moment.') : undefined}
      after={
        <>
          {busy && progress.phase === 'downloading' && (
            <>
              <div className="set-progress" role="progressbar" aria-label={tr('Downloading Gabay {0}', progress.version)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
                <span style={{ width: `${pct ?? 0}%` }} />
              </div>
              <div className="set-desc">{progress.total ? tr('{0} of {1} MB', mbOf(progress.received), mbOf(progress.total)) : tr('{0} MB', mbOf(progress.received))}</div>
            </>
          )}
          {progress?.phase === 'failed' && <div className="set-note">{tr("The update couldn't be downloaded or didn't check out. Try again later.")}</div>}
        </>
      }
    >
      {busy ? (
        <button type="button" className="set-btn primary" disabled>
          {label}
        </button>
      ) : info?.available ? (
        <button type="button" className="set-btn primary" onClick={() => void install()}>
          {tr('Install {0}', info.available.version)}
        </button>
      ) : (
        <button type="button" className="set-btn" disabled={!info?.packaged || checking} onClick={() => void check()}>
          {checking ? tr('Checking…') : tr('Check for updates')}
        </button>
      )}
    </Row>
  )
}

/**
 * Buttons and a slider rather than <select>: a native dropdown opens its own popup window, which would take
 * the pointer off the notch and collapse the panel under the user.
 */
export default function SettingsPanel({ onSettings, onHold, onShowWelcome, onShowTour, liveHotkey }: Props): React.JSX.Element {
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null)
  // Windows' Do not disturb, re-read every few seconds while Settings is open (it's turned on outside Gabay).
  const [winDnd, setWinDnd] = useState<boolean | null>(null)
  useEffect(() => {
    const read = (): void => void window.overlay.windowsDnd().then(setWinDnd, () => undefined)
    read()
    const id = window.setInterval(read, 4000)
    return () => window.clearInterval(id)
  }, [])
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
      onSettings(r.settings, r.activeHotkey)
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
  const pickHotkey = (hotkey: string): Promise<void> => save({ hotkey })

  if (!snap || delay === null) return <Skeleton kind="settings" />

  const { settings, activeHotkey, hotkeys, displays, collapseRange } = snap
  const shownDisplay = displays.some((d) => d.id === settings.displayId) ? settings.displayId : null
  const noteAccessBlocked = settings.notifications && snap.notificationAccess && snap.notificationAccess !== 'Allowed'

  return (
    <div
      className="body settings"
      ref={(el) => {
        if (el && previewFlags.has('bottom')) el.scrollTop = el.scrollHeight
        else if (el && previewFlags.has('scroll')) el.scrollTop = Number(previewFlags.get('scroll'))
      }}
    >
      <Group title={tr('General')}>
        <HotkeyRow settings={settings} activeHotkey={activeHotkey} hotkeys={hotkeys} onHold={onHold} onPick={pickHotkey} />
        <Row label={tr('Language')}>
          <Seg
            label={tr('Language')}
            value={settings.language}
            options={[
              { value: 'en', label: 'English' },
              { value: 'fil', label: 'Filipino' }
            ]}
            onChange={(language) => void save({ language })}
          />
        </Row>
      </Group>

      <Group title={tr('Notch')}>
        <Row
          label={tr('Notch visibility')}
          desc={
            settings.visibility === 'auto'
              ? tr('Hidden until you rest the pointer on the top edge, so it never covers a tab or button')
              : settings.visibility === 'smart'
                ? tr('Steps aside only while a window is under it, so it never covers a tab. Rest the pointer on the top edge to bring it back')
                : tr('Steps aside while a video, game or other window is full screen')
          }
        >
          <Seg
            label={tr('Notch visibility')}
            value={settings.visibility}
            options={[
              { value: 'always', label: tr('Always shown') },
              { value: 'smart', label: tr('Smart') },
              { value: 'auto', label: tr('Auto-hide') }
            ]}
            onChange={(visibility) => void save({ visibility })}
          />
        </Row>
        <Row label={tr('Show on')} stack>
          <button type="button" className={settings.followMouse ? 'opt on' : 'opt'} aria-pressed={settings.followMouse} title={tr('Moves to whichever screen the mouse is on')} onClick={() => void save({ followMouse: true })}>
            {tr('Follow mouse')}
          </button>
          <button
            type="button"
            className={!settings.followMouse && shownDisplay === null ? 'opt on' : 'opt'}
            aria-pressed={!settings.followMouse && shownDisplay === null}
            title={tr("Windows' main display")}
            onClick={() => void save({ displayId: null, followMouse: false })}
          >
            {tr('Main display')}
          </button>
          {displays.map((d) => (
            <button
              key={d.id}
              type="button"
              className={!settings.followMouse && shownDisplay === d.id ? 'opt on' : 'opt'}
              aria-pressed={!settings.followMouse && shownDisplay === d.id}
              title={d.detail}
              onClick={() => void save({ displayId: d.id, followMouse: false })}
            >
              {tr(d.label)}
            </button>
          ))}
        </Row>
        <Row label={tr('Collapse delay')} value={`${delay} ms`} stack>
          <input
            type="range"
            className="slider"
            aria-label={tr('Collapse delay')}
            min={collapseRange.min}
            max={collapseRange.max}
            step={COLLAPSE_STEP_MS}
            value={delay}
            onChange={(e) => onDelay(Number(e.target.value))}
          />
        </Row>
        <Row label={tr('Accent colour')} stack>
          <div className="swatches" role="group" aria-label={tr('Accent colour')}>
            {Object.entries(ACCENT_PRESETS).map(([key, a]) => (
              <button
                key={key}
                type="button"
                className={settings.accent === key ? 'swatch on' : 'swatch'}
                title={tr(a.label)}
                aria-label={tr('{0} accent', tr(a.label))}
                aria-pressed={settings.accent === key}
                style={a.hex ? { background: a.hex } : undefined}
                onClick={() => void save({ accent: key })}
              >
                {key === 'windows' && <span className="swatch-win">W</span>}
              </button>
            ))}
          </div>
        </Row>
      </Group>

      <Group title={tr('Notifications')}>
        <SwitchRow label={tr('Notifications in the notch')} on={settings.notifications} onChange={(notifications) => void save({ notifications })} />
        {noteAccessBlocked && (
          <Row
            label={tr('Notification access')}
            desc={
              <span className="set-warn">
                {snap.notificationAccess === 'Unavailable'
                  ? tr("This version of Windows doesn't let apps read notifications, so they won't show in the notch.")
                  : tr('Windows is blocking Gabay from reading notifications. Turn on "Notification access" for apps, then come back: Gabay notices by itself.')}
              </span>
            }
            stack={snap.notificationAccess !== 'Unavailable'}
          >
            {snap.notificationAccess !== 'Unavailable' && (
              <button type="button" className="set-btn primary" onClick={() => void window.overlay.quickOpen('notifyaccess')}>
                {tr('Open privacy settings')}
              </button>
            )}
          </Row>
        )}
        {settings.notifications && (
          <SwitchRow
            label={tr('Show text')}
            desc={settings.notePreview ? tr('Sender and message') : tr('Only which app it came from')}
            on={settings.notePreview}
            onChange={(notePreview) => void save({ notePreview })}
          />
        )}
        {settings.notifications && winDnd && (
          <SwitchRow
            label={tr('Sound (Windows is on Do not disturb)')}
            desc={tr('Windows is silent while its Do not disturb is on')}
            on={settings.noteSound}
            onChange={(noteSound) => void save({ noteSound })}
          />
        )}
        {settings.notifications && snap.notificationAccess === 'Allowed' && winDnd === false && (
          <Row label={tr('Seeing every notification twice?')} desc={tr('Turn on Do not disturb in Windows: its pop-ups stop, and Gabay still shows each one in the notch.')} stack>
            <button type="button" className="set-btn" onClick={() => void window.overlay.quickOpen('notifications')}>
              {tr('Open Windows notifications')}
            </button>
          </Row>
        )}
      </Group>

      <Group title={tr('Features')}>
        <SwitchRow
          label={tr('Recent files in Launch')}
          desc={tr('Files you opened lately, from Windows\' own list. None while Windows\' "Show recently opened items" is off.')}
          on={settings.recentFiles}
          onChange={(recentFiles) => void save({ recentFiles })}
        />
        <SwitchRow
          label={tr('Lyrics in Now playing')}
          desc={tr("Looks up the song's title and artist on lrclib.net (free, open lyrics).")}
          on={settings.lyrics}
          onChange={(lyrics) => void save({ lyrics })}
        />
        <WeatherRow place={settings.place?.name ?? null} onHold={onHold} onSaved={() => void window.overlay.getSettings().then((r) => { setSnap(r); onSettings(r.settings, r.activeHotkey) })} />
        <CalendarRow onHold={onHold} />
      </Group>

      <Group title={tr('Taskbar')} badge={tr('Experimental')}>
        <SwitchRow
          label={tr('Reserve space at the top')}
          desc={settings.reserveTop ? tr('Maximized windows now start below the notch. Full screen still uses the whole screen.') : tr('Maximized and snapped windows fit below the notch, like they do above the taskbar')}
          on={settings.reserveTop}
          onChange={(reserveTop) => void save({ reserveTop })}
        />
        <SwitchRow
          label={tr('Hide the Windows taskbar')}
          desc={
            settings.hideTaskbar
              ? (settings.taskbarFull
                  ? tr('Your open apps are at the bottom of this panel: click one to switch to it, or the one you\'re using to minimize it. Turning this off or quitting Gabay puts the taskbar back.')
                  : tr('Your open apps are at the bottom of this panel: click one to switch to it, or the one you\'re using to minimize it. The taskbar is still there if you push the pointer to the bottom edge. Turning this off or quitting Gabay puts it back.')) +
                (displays.length > 1 ? ' ' + tr('Your other screens get a small notch too: hover it for the dock.') : '')
              : tr('Auto-hides the taskbar and shows your open apps at the bottom of this panel')
          }
          on={settings.hideTaskbar}
          onChange={(hideTaskbar) => void save({ hideTaskbar })}
        />
        {settings.hideTaskbar && (
          <Row label={tr('At the bottom edge')} desc={settings.taskbarFull ? tr('Hides the taskbar completely. Turn on Tray icons below to keep reaching icons in its corner.') : undefined}>
            <Seg
              label={tr('At the bottom edge')}
              value={settings.taskbarFull ? 'full' : 'slide'}
              options={[
                { value: 'slide', label: tr('Taskbar slides up') },
                { value: 'full', label: tr('Nothing') }
              ]}
              onChange={(v) => void save({ taskbarFull: v === 'full' })}
            />
          </Row>
        )}
        {settings.hideTaskbar && (
          <SwitchRow
            label={tr('Tray icons')}
            desc={settings.trayIcons ? tr('Icons from the corner of the taskbar show in the dock. Click one as you would there; right-click for its menu. Experimental.') : undefined}
            on={settings.trayIcons}
            onChange={(trayIcons) => void save({ trayIcons })}
          />
        )}
      </Group>

      <Group title={tr('Help and feedback')}>
        <ShortcutsRow hotkey={liveHotkey ?? activeHotkey} />
        <Row label={tr('Welcome tour')}>
          <button type="button" className="set-btn" onClick={onShowWelcome}>
            {tr('Show it again')}
          </button>
        </Row>
        <Row label={tr('Rate Gabay')} desc={tr('Reviews show on the Gabay website once checked for spam.')}>
          <button type="button" className="set-btn" onClick={() => void window.overlay.openReview()} title={tr('Opens the review form on GitHub (needs a GitHub account)')}>
            {tr('Write a review')}
          </button>
        </Row>
        <ReportRow onHold={onHold} />
      </Group>

      <Group title={tr('About Gabay')}>
        <UpdateRow />
        <SwitchRow
          label={tr('Install updates automatically')}
          desc={tr("While you're away from the PC for a few minutes, Gabay updates and restarts by itself")}
          on={settings.autoUpdate}
          onChange={(autoUpdate) => void save({ autoUpdate })}
        />
        <Row label={tr('Update channel')} desc={settings.updateChannel === 'preview' ? tr('You get new versions first, before they go out to everyone.') : undefined}>
          <Seg
            label={tr('Update channel')}
            value={settings.updateChannel}
            options={[
              { value: 'stable', label: tr('Stable') },
              { value: 'preview', label: tr('Preview'), title: tr('Get new versions before everyone else. They may have rough edges.') }
            ]}
            onChange={(updateChannel) => void save({ updateChannel })}
          />
        </Row>
        <WhatsNewRow version={snap.version} onTour={onShowTour} />
        <ResetRow
          onReset={async () => {
            const r = await window.overlay.resetSettings()
            setSnap(r)
            setDelay(r.settings.collapseMs)
            onSettings(r.settings, r.activeHotkey)
          }}
        />
        <Row label={tr('Quit Gabay')} desc={tr('Closes Gabay and brings back the taskbar. Open it again from the Start menu.')}>
          <button type="button" className="set-btn" onClick={() => void window.overlay.quit()}>
            {tr('Quit')}
          </button>
        </Row>
      </Group>
    </div>
  )
}
