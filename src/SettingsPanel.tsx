import { useEffect, useRef, useState } from 'react'
import { latestTour } from './UpdateTour'
import type { SettingsSnapshot, UpdateInfo } from './global'
import { ACCENT_PRESETS } from './accent'
import Icon from './Icon'
import { notesFor } from './whatsNew'
import { COLLAPSE_STEP_MS } from './constants'
import { tr } from './i18n'

interface Props {
  /** Tells the notch the new settings immediately, without a reload. */
  onSettings: (s: SettingsSnapshot['settings']) => void
  /** A focused text field keeps the panel open. */
  onHold: (held: boolean) => void
  onShowWelcome: () => void
  onShowTour: (version: string) => void
  /** The hotkey App knows is registered (the snapshot's copy can be older). */
  liveHotkey: string | null
}

// Dev preview only: &open expands the collapsible rows, &bottom scrolls to the end (for screenshots).
const previewFlags = new URLSearchParams(location.hash.slice(1))
const PREVIEW_OPEN = previewFlags.has('open')

const keysOf = (hotkey: string | null): string => (hotkey ? hotkey.replace('Control', 'Ctrl').split('+').join(' + ') : tr('No hotkey'))

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
    <details className="set-row set-details" open={PREVIEW_OPEN || undefined}>
      <summary className="set-label">
        <Icon name="keyboard" size={14} />
        {tr('Shortcuts and commands')}
      </summary>
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
    </details>
  )
}

function WhatsNewRow({ version, onTour }: { version: string; onTour: (version: string) => void }): React.JSX.Element {
  const tourVersion = latestTour(version)
  return (
    <details className="set-row set-details" open={PREVIEW_OPEN || undefined}>
      <summary className="set-label">
        <Icon name="sparkles" size={14} />
        {tr("What's new in {0}", version)}
      </summary>
      <ul className="news">
        {notesFor(version).map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {tourVersion && (
        <div className="set-opts">
          <button className="chip" onClick={() => onTour(tourVersion)}>
            {tr('Take the tour')}
          </button>
        </div>
      )}
    </details>
  )
}

/** Settings back to defaults, after an on-screen confirmation (no browser dialogs in Gabay). */
function ResetRow({ onReset }: { onReset: () => Promise<void> }): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState(false)
  return (
    <div className="set-row">
      <div className="set-label">{tr('Reset settings')}</div>
      {asking ? (
        <div className="set-opts">
          <span className="set-ask">{tr('Reset every setting to its default? To-dos, notes, pinned clips and your calendar stay.')}</span>
          <button
            className="chip danger"
            onClick={() =>
              void onReset().then(() => {
                setAsking(false)
                setDone(true)
              })
            }
          >
            {tr('Reset')}
          </button>
          <button className="chip" onClick={() => setAsking(false)}>
            {tr('Cancel')}
          </button>
        </div>
      ) : (
        <div className="set-opts">
          <button
            className="chip"
            onClick={() => {
              setDone(false)
              setAsking(true)
            }}
          >
            <Icon name="rotate-ccw" size={13} />
            {tr('Reset to defaults')}
          </button>
          {done && <span className="set-note muted">{tr('Done. Everything is back to how it started.')}</span>}
        </div>
      )}
    </div>
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
  return (
    <div className="set-row">
      <div className="set-label">
        {tr('Calendar')} {connected && <span className="set-val">{tr('connected')}</span>}
      </div>
      {connected ? (
        <div className="set-opts">
          <button className="chip" onClick={() => void save('')}>
            {tr('Disconnect')}
          </button>
        </div>
      ) : (
        <>
          <div className="set-inline">
            <input
              className="field"
              type="password"
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
            <button className="chip on" disabled={!draft.trim() || state === 'saving'} onClick={() => void save(draft)}>
              {state === 'saving' ? tr('Saving…') : tr('Connect')}
            </button>
          </div>
          <div className="set-note muted">
            {state === 'bad'
              ? tr('That address did not work. It should start with https:// or webcal://.')
              : tr("Google Calendar: Settings › your calendar › Integrate calendar › Secret address in iCal format. It's stored encrypted on this PC.")}
          </div>
        </>
      )}
    </div>
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
    <div className="set-row">
      <div className="set-label">
        {tr('Weather')} {place && <span className="set-val">{place}</span>}
      </div>
      <div className="set-inline">
        <input
          className="field"
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
        <button className="chip on" disabled={!draft.trim() || state === 'finding'} onClick={() => void find()}>
          {state === 'finding' ? tr('Finding…') : place ? tr('Change') : tr('Set')}
        </button>
      </div>
      {state === 'none' && <div className="set-note">{tr('Couldn\'t find that place. Try the city name only.')}</div>}
    </div>
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
    <div className="set-row">
      <div className="set-label">{tr('Report a bug')}</div>
      <textarea
        className="field report-field"
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
      <div className="set-opts">
        <button className="chip on" disabled={!text.trim()} onClick={() => void send('github')} title={tr('Opens a prefilled issue on GitHub (needs a GitHub account)')}>
          {tr('Send on GitHub')}
        </button>
        <button className="chip" disabled={!text.trim()} onClick={() => void send('copy')} title={tr('Copies the report so you can paste it in a chat')}>
          {tr('Copy report')}
        </button>
      </div>
      <div className="set-note muted">
        {sent === 'copy'
          ? tr('Copied. Paste it in a message to the developer.')
          : sent === 'github'
            ? tr('Opened in your browser. Press Submit there to send it.')
            : tr('Adds your Gabay and Windows versions, screen setup and recent errors. Nothing personal: no names, files, clipboard or messages.')}
      </div>
    </div>
  )
}

function UpdateRow(): React.JSX.Element {
  const [info, setInfo] = useState<{ current: string; available: UpdateInfo | null; packaged: boolean } | null>(null)
  const [state, setState] = useState<'idle' | 'checking' | 'installing' | 'failed'>('idle')
  useEffect(() => {
    void window.overlay.updateGet(false).then(setInfo, () => undefined)
  }, [])
  const check = async (): Promise<void> => {
    setState('checking')
    setInfo(await window.overlay.updateGet(true).catch(() => info))
    setState('idle')
  }
  const install = async (): Promise<void> => {
    setState('installing')
    if (!(await window.overlay.updateInstall().catch(() => false))) setState('failed')
  }
  if (!info) return <div className="set-row" />
  return (
    <div className="set-row">
      <div className="set-label">
        {tr('Version')} <span className="set-val">{info.current}</span>
      </div>
      <div className="set-opts">
        {info.available ? (
          <button className="chip on" disabled={state === 'installing'} onClick={() => void install()}>
            {state === 'installing' ? tr('Downloading…') : tr('Install {0}', info.available.version)}
          </button>
        ) : (
          <button className="chip" disabled={!info.packaged || state === 'checking'} onClick={() => void check()}>
            {state === 'checking' ? tr('Checking…') : tr('Check for updates')}
          </button>
        )}
      </div>
      {state === 'failed' && <div className="set-note">{tr('The update couldn\'t be downloaded or didn\'t check out. Try again later.')}</div>}
      {!info.packaged && <div className="set-note muted">{tr('Updates work in the installed app.')}</div>}
    </div>
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

  if (!snap || delay === null) return <div className="body body-center">{tr('Loading…')}</div>

  const { settings, activeHotkey, hotkeys, displays, collapseRange } = snap
  const hotkeyTaken = activeHotkey !== settings.hotkey
  const shownDisplay = displays.some((d) => d.id === settings.displayId) ? settings.displayId : null

  return (
    <div
      className="body settings"
      ref={(el) => {
        if (el && previewFlags.has('bottom')) el.scrollTop = el.scrollHeight
      }}
    >
      <div className="set-row">
        <div className="set-label">{tr('Hotkey')}</div>
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
            {tr('{0} is taken by another app.', settings.hotkey.replace('Control', 'Ctrl'))}{' '}
            {activeHotkey ? tr('Using {0} instead.', activeHotkey.replace('Control', 'Ctrl')) : tr('No hotkey is active.')}
          </div>
        )}
      </div>

      <div className="set-row">
        <div className="set-label">
          {tr('Collapse delay')} <span className="set-val">{delay} ms</span>
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
        <div className="set-label">{tr('Notch visibility')}</div>
        <div className="set-opts">
          <button
            className={settings.visibility === 'always' ? 'chip on' : 'chip'}
            title={tr('Steps aside while a video, game or other window is full screen')}
            onClick={() => void save({ visibility: 'always' })}
          >
            {tr('Always shown')}
          </button>
          <button
            className={settings.visibility === 'auto' ? 'chip on' : 'chip'}
            title={tr('Hidden until you rest the pointer on the top edge, so it never covers a tab or button')}
            onClick={() => void save({ visibility: 'auto' })}
          >
            {tr('Auto-hide')}
          </button>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">{tr('Show on')}</div>
        <div className="set-opts">
          <button
            className={settings.followMouse ? 'chip on' : 'chip'}
            title={tr('Moves to whichever screen the mouse is on')}
            onClick={() => void save({ followMouse: true })}
          >
            {tr('Follow mouse')}
          </button>
          <button
            className={!settings.followMouse && shownDisplay === null ? 'chip on' : 'chip'}
            title={tr("Windows' main display")}
            onClick={() => void save({ displayId: null, followMouse: false })}
          >
            {tr('Main display')}
          </button>
          {displays.map((d) => (
            <button
              key={d.id}
              className={!settings.followMouse && shownDisplay === d.id ? 'chip on' : 'chip'}
              title={d.detail}
              onClick={() => void save({ displayId: d.id, followMouse: false })}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">{tr('Notifications in the notch')}</div>
        <div className="set-opts">
          <button className={settings.notifications ? 'chip on' : 'chip'} onClick={() => void save({ notifications: true })}>
            {tr('On')}
          </button>
          <button className={!settings.notifications ? 'chip on' : 'chip'} onClick={() => void save({ notifications: false })}>
            {tr('Off')}
          </button>
          {settings.notifications && (
            <>
              <span className="set-sep" />
              <button className={settings.notePreview ? 'chip on' : 'chip'} title={tr('Sender and message')} onClick={() => void save({ notePreview: true })}>
                {tr('Show text')}
              </button>
              <button className={!settings.notePreview ? 'chip on' : 'chip'} title={tr('Only which app it came from')} onClick={() => void save({ notePreview: false })}>
                {tr('App name only')}
              </button>
            </>
          )}
        </div>
        {settings.notifications && snap.notificationAccess && snap.notificationAccess !== 'Allowed' && (
          <div className="set-warn">
            <span>
              {snap.notificationAccess === 'Unavailable'
                ? tr("This version of Windows doesn't let apps read notifications, so they won't show in the notch.")
                : tr('Windows is blocking Gabay from reading notifications. Turn on "Notification access" for apps, then come back: Gabay notices by itself.')}
            </span>
            {snap.notificationAccess !== 'Unavailable' && (
              <button className="chip on" onClick={() => void window.overlay.quickOpen('notifyaccess')}>
                {tr('Open privacy settings')}
              </button>
            )}
          </div>
        )}
        {settings.notifications && snap.notificationAccess === 'Allowed' && winDnd === false && (
          <div className="set-tip">
            <span>
              {tr('Seeing every notification twice? Turn on Do not disturb in Windows: its pop-ups stop, and Gabay still shows each one in the notch.')}
            </span>
            <button className="chip" onClick={() => void window.overlay.quickOpen('notifications')}>
              {tr('Open Windows notifications')}
            </button>
          </div>
        )}
        {settings.notifications && winDnd && (
          <div className="set-opts set-sub">
            <span className="set-sub-label" title={tr('Windows is silent while its Do not disturb is on')}>
              {tr('Sound (Windows is on Do not disturb)')}
            </span>
            <button className={settings.noteSound ? 'chip on' : 'chip'} onClick={() => void save({ noteSound: true })}>
              {tr('On')}
            </button>
            <button className={!settings.noteSound ? 'chip on' : 'chip'} onClick={() => void save({ noteSound: false })}>
              {tr('Off')}
            </button>
          </div>
        )}
      </div>

      <div className="set-row">
        <div className="set-label">{tr('Accent colour')}</div>
        <div className="set-opts swatches">
          {Object.entries(ACCENT_PRESETS).map(([key, a]) => (
            <button
              key={key}
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
      </div>

      <div className="set-row">
        <div className="set-label">{tr('Language')}</div>
        <div className="set-opts">
          <button className={settings.language === 'en' ? 'chip on' : 'chip'} onClick={() => void save({ language: 'en' })}>
            English
          </button>
          <button className={settings.language === 'fil' ? 'chip on' : 'chip'} onClick={() => void save({ language: 'fil' })}>
            Filipino
          </button>
        </div>
      </div>

      <WeatherRow place={settings.place?.name ?? null} onHold={onHold} onSaved={() => void window.overlay.getSettings().then((r) => { setSnap(r); onSettings(r.settings) })} />

      <div className="set-row">
        <div className="set-label">{tr('Lyrics in Now playing')}</div>
        <div className="set-opts">
          <button className={settings.lyrics ? 'chip on' : 'chip'} onClick={() => void save({ lyrics: true })}>
            {tr('On')}
          </button>
          <button className={!settings.lyrics ? 'chip on' : 'chip'} onClick={() => void save({ lyrics: false })}>
            {tr('Off')}
          </button>
        </div>
        <div className="set-note muted">{tr('Looks up the song\'s title and artist on lrclib.net (free, open lyrics).')}</div>
      </div>

      <CalendarRow onHold={onHold} />
      <UpdateRow />
      <div className="set-row">
        <div className="set-label">{tr('Install updates automatically')}</div>
        <div className="set-opts">
          <button
            className={settings.autoUpdate ? 'chip on' : 'chip'}
            title={tr("While you're away from the PC for a few minutes, Gabay updates and restarts by itself")}
            onClick={() => void save({ autoUpdate: true })}
          >
            {tr('On')}
          </button>
          <button className={!settings.autoUpdate ? 'chip on' : 'chip'} onClick={() => void save({ autoUpdate: false })}>
            {tr('Off')}
          </button>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">{tr('Update channel')}</div>
        <div className="set-opts">
          <button className={settings.updateChannel === 'stable' ? 'chip on' : 'chip'} onClick={() => void save({ updateChannel: 'stable' })}>
            {tr('Stable')}
          </button>
          <button
            className={settings.updateChannel === 'preview' ? 'chip on' : 'chip'}
            title={tr('Get new versions before everyone else. They may have rough edges.')}
            onClick={() => void save({ updateChannel: 'preview' })}
          >
            {tr('Preview')}
          </button>
        </div>
        {settings.updateChannel === 'preview' && <div className="set-note muted">{tr('You get new versions first, before they go out to everyone.')}</div>}
      </div>
      <WhatsNewRow version={snap.version} onTour={onShowTour} />
      <ShortcutsRow hotkey={liveHotkey ?? activeHotkey} />
      <div className="set-row">
        <div className="set-label">{tr('Welcome tour')}</div>
        <div className="set-opts">
          <button className="chip" onClick={onShowWelcome}>
            {tr('Show it again')}
          </button>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">{tr('Rate Gabay')}</div>
        <div className="set-opts">
          <button className="chip on" onClick={() => void window.overlay.openReview()} title={tr('Opens the review form on GitHub (needs a GitHub account)')}>
            {tr('Write a review')}
          </button>
        </div>
        <div className="set-note muted">{tr('Reviews show on the Gabay website once checked for spam.')}</div>
      </div>
      <ReportRow onHold={onHold} />
      <ResetRow
        onReset={async () => {
          const r = await window.overlay.resetSettings()
          setSnap(r)
          setDelay(r.settings.collapseMs)
          onSettings(r.settings)
        }}
      />
      <div className="set-row">
        <div className="set-label">{tr('Quit Gabay')}</div>
        <div className="set-opts">
          <button className="chip" onClick={() => void window.overlay.quit()}>
            {tr('Quit')}
          </button>
        </div>
        <div className="set-note muted">{tr('Closes Gabay and brings back the taskbar. Open it again from the Start menu.')}</div>
      </div>

      <div className="set-section">{tr('Experiments')}</div>
      <div className="set-row">
        <div className="set-label">{tr('Reserve space at the top')}</div>
        <div className="set-opts">
          <button
            className={settings.reserveTop ? 'chip on' : 'chip'}
            title={tr('Maximized and snapped windows fit below the notch, like they do above the taskbar')}
            onClick={() => void save({ reserveTop: true })}
          >
            {tr('On')}
          </button>
          <button className={!settings.reserveTop ? 'chip on' : 'chip'} onClick={() => void save({ reserveTop: false })}>
            {tr('Off')}
          </button>
        </div>
        {settings.reserveTop && <div className="set-note muted">{tr('Maximized windows now start below the notch. Full screen still uses the whole screen.')}</div>}
      </div>
      <div className="set-row">
        <div className="set-label">{tr('Hide the Windows taskbar')}</div>
        <div className="set-opts">
          <button
            className={settings.hideTaskbar ? 'chip on' : 'chip'}
            title={tr('Auto-hides the taskbar and shows your open apps at the bottom of this panel')}
            onClick={() => void save({ hideTaskbar: true })}
          >
            {tr('On')}
          </button>
          <button className={!settings.hideTaskbar ? 'chip on' : 'chip'} onClick={() => void save({ hideTaskbar: false })}>
            {tr('Off')}
          </button>
        </div>
        {settings.hideTaskbar && (
          <div className="set-note muted">
            {settings.taskbarFull
              ? tr('Your open apps are at the bottom of this panel: click one to switch to it, or the one you\'re using to minimize it. Turning this off or quitting Gabay puts the taskbar back.')
              : tr('Your open apps are at the bottom of this panel: click one to switch to it, or the one you\'re using to minimize it. The taskbar is still there if you push the pointer to the bottom edge. Turning this off or quitting Gabay puts it back.')}
          </div>
        )}
      </div>
      {settings.hideTaskbar && (
        <div className="set-row">
          <div className="set-label">{tr('At the bottom edge')}</div>
          <div className="set-opts">
            <button className={!settings.taskbarFull ? 'chip on' : 'chip'} onClick={() => void save({ taskbarFull: false })}>
              {tr('Taskbar slides up')}
            </button>
            <button className={settings.taskbarFull ? 'chip on' : 'chip'} title={tr('Hides the taskbar completely. Turn on Tray icons below to keep reaching icons in its corner.')} onClick={() => void save({ taskbarFull: true })}>
              {tr('Nothing')}
            </button>
          </div>
        </div>
      )}
      {settings.hideTaskbar && (
        <div className="set-row">
          <div className="set-label">{tr('Tray icons')}</div>
          <div className="set-opts">
            <button className={settings.trayIcons ? 'chip on' : 'chip'} onClick={() => void save({ trayIcons: true })}>
              {tr('On')}
            </button>
            <button className={!settings.trayIcons ? 'chip on' : 'chip'} onClick={() => void save({ trayIcons: false })}>
              {tr('Off')}
            </button>
          </div>
          {settings.trayIcons && <div className="set-note muted">{tr('Icons from the corner of the taskbar show in the dock. Click one as you would there; right-click for its menu. Experimental.')}</div>}
        </div>
      )}
    </div>
  )
}
