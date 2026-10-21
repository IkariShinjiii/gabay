import { useEffect, useRef, useState } from 'react'
import type { SettingsSnapshot, UpdateInfo } from './global'
import { ACCENT_PRESETS } from './accent'
import Icon from './Icon'
import { notesFor } from './whatsNew'
import { COLLAPSE_STEP_MS } from './constants'

interface Props {
  /** Tells the notch the new settings immediately, without a reload. */
  onSettings: (s: SettingsSnapshot['settings']) => void
  /** A focused text field keeps the panel open. */
  onHold: (held: boolean) => void
  onShowWelcome: () => void
  /** The hotkey App knows is registered (the snapshot's copy can be older). */
  liveHotkey: string | null
}

// Dev preview only: &open expands the collapsible rows, &bottom scrolls to the end (for screenshots).
const previewFlags = new URLSearchParams(location.hash.slice(1))
const PREVIEW_OPEN = previewFlags.has('open')

const keysOf = (hotkey: string | null): string => (hotkey ? hotkey.replace('Control', 'Ctrl').split('+').join(' + ') : 'No hotkey')

/** Every hotkey, gesture and typed command in one place. */
function ShortcutsRow({ hotkey }: { hotkey: string | null }): React.JSX.Element {
  const groups: [string, [string, string][]][] = [
    ['Anywhere', [[keysOf(hotkey), 'Open Gabay and search your apps'], ['Rest on the top edge', 'Bring back a hidden notch']]],
    [
      'In the open notch',
      [
        ['Ctrl + 1 to 8', 'Switch tabs'],
        ['Scroll over the tabs', 'Change the volume'],
        ['Middle-click', 'Play or pause'],
        ['Esc', 'Clear the search, then let the notch close']
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
        Shortcuts and commands
      </summary>
      <div className="keys">
        {groups.map(([title, rows]) => (
          <div key={title} className="keys-group">
            <div className="keys-title">{title}</div>
            {rows.map(([k, what]) => (
              <div key={k} className="keys-row">
                <kbd>{k}</kbd>
                <span>{what}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </details>
  )
}

function WhatsNewRow({ version }: { version: string }): React.JSX.Element {
  return (
    <details className="set-row set-details" open={PREVIEW_OPEN || undefined}>
      <summary className="set-label">
        <Icon name="sparkles" size={14} />
        What's new in {version}
      </summary>
      <ul className="news">
        {notesFor(version).map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </details>
  )
}

/** Settings back to defaults, after an on-screen confirmation (no browser dialogs in Gabay). */
function ResetRow({ onReset }: { onReset: () => Promise<void> }): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const [done, setDone] = useState(false)
  return (
    <div className="set-row">
      <div className="set-label">Reset settings</div>
      {asking ? (
        <div className="set-opts">
          <span className="set-ask">Reset every setting to its default? To-dos, notes, pinned clips and your calendar stay.</span>
          <button
            className="chip danger"
            onClick={() =>
              void onReset().then(() => {
                setAsking(false)
                setDone(true)
              })
            }
          >
            Reset
          </button>
          <button className="chip" onClick={() => setAsking(false)}>
            Cancel
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
            Reset to defaults
          </button>
          {done && <span className="set-note muted">Done. Everything is back to how it started.</span>}
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
        Calendar {connected && <span className="set-val">connected</span>}
      </div>
      {connected ? (
        <div className="set-opts">
          <button className="chip" onClick={() => void save('')}>
            Disconnect
          </button>
        </div>
      ) : (
        <>
          <div className="set-inline">
            <input
              className="field"
              type="password"
              placeholder="Paste your calendar's secret iCal address"
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
              {state === 'saving' ? 'Saving…' : 'Connect'}
            </button>
          </div>
          <div className="set-note muted">
            {state === 'bad'
              ? 'That address did not work. It should start with https:// or webcal://.'
              : "Google Calendar: Settings › your calendar › Integrate calendar › Secret address in iCal format. It's stored encrypted on this PC."}
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
        Weather {place && <span className="set-val">{place}</span>}
      </div>
      <div className="set-inline">
        <input
          className="field"
          placeholder={place ? 'Change city' : 'Your city, e.g. Iloilo'}
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
          {state === 'finding' ? 'Finding…' : place ? 'Change' : 'Set'}
        </button>
      </div>
      {state === 'none' && <div className="set-note">Couldn't find that place. Try the city name only.</div>}
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
      <div className="set-label">Report a bug</div>
      <textarea
        className="field report-field"
        placeholder="What went wrong, and what were you doing?"
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
        <button className="chip on" disabled={!text.trim()} onClick={() => void send('github')} title="Opens a prefilled issue on GitHub (needs a GitHub account)">
          Send on GitHub
        </button>
        <button className="chip" disabled={!text.trim()} onClick={() => void send('copy')} title="Copies the report so you can paste it in a chat">
          Copy report
        </button>
      </div>
      <div className="set-note muted">
        {sent === 'copy'
          ? 'Copied. Paste it in a message to the developer.'
          : sent === 'github'
            ? 'Opened in your browser. Press Submit there to send it.'
            : 'Adds your Gabay and Windows versions, screen setup and recent errors. Nothing personal: no names, files, clipboard or messages.'}
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
        Version <span className="set-val">{info.current}</span>
      </div>
      <div className="set-opts">
        {info.available ? (
          <button className="chip on" disabled={state === 'installing'} onClick={() => void install()}>
            {state === 'installing' ? 'Downloading…' : `Install ${info.available.version}`}
          </button>
        ) : (
          <button className="chip" disabled={!info.packaged || state === 'checking'} onClick={() => void check()}>
            {state === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        )}
      </div>
      {state === 'failed' && <div className="set-note">The update couldn't be downloaded or didn't check out. Try again later.</div>}
      {!info.packaged && <div className="set-note muted">Updates work in the installed app.</div>}
    </div>
  )
}

/**
 * Buttons and a slider rather than <select>: a native dropdown opens its own popup window, which would take
 * the pointer off the notch and collapse the panel under the user.
 */
export default function SettingsPanel({ onSettings, onHold, onShowWelcome, liveHotkey }: Props): React.JSX.Element {
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
    <div
      className="body settings"
      ref={(el) => {
        if (el && previewFlags.has('bottom')) el.scrollTop = el.scrollHeight
      }}
    >
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
            className={settings.visibility === 'always' ? 'chip on' : 'chip'}
            title="Steps aside while a video, game or other window is full screen"
            onClick={() => void save({ visibility: 'always' })}
          >
            Always shown
          </button>
          <button
            className={settings.visibility === 'auto' ? 'chip on' : 'chip'}
            title="Hidden until you rest the pointer on the top edge, so it never covers a tab or button"
            onClick={() => void save({ visibility: 'auto' })}
          >
            Auto-hide
          </button>
        </div>
      </div>

      <div className="set-row">
        <div className="set-label">Show on</div>
        <div className="set-opts">
          <button
            className={settings.followMouse ? 'chip on' : 'chip'}
            title="Moves to whichever screen the mouse is on"
            onClick={() => void save({ followMouse: true })}
          >
            Follow mouse
          </button>
          <button
            className={!settings.followMouse && shownDisplay === null ? 'chip on' : 'chip'}
            title="Windows' main display"
            onClick={() => void save({ displayId: null, followMouse: false })}
          >
            Main display
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
        <div className="set-label">Notifications in the notch</div>
        <div className="set-opts">
          <button className={settings.notifications ? 'chip on' : 'chip'} onClick={() => void save({ notifications: true })}>
            On
          </button>
          <button className={!settings.notifications ? 'chip on' : 'chip'} onClick={() => void save({ notifications: false })}>
            Off
          </button>
          {settings.notifications && (
            <>
              <span className="set-sep" />
              <button className={settings.notePreview ? 'chip on' : 'chip'} title="Sender and message" onClick={() => void save({ notePreview: true })}>
                Show text
              </button>
              <button className={!settings.notePreview ? 'chip on' : 'chip'} title="Only which app it came from" onClick={() => void save({ notePreview: false })}>
                App name only
              </button>
            </>
          )}
        </div>
        {settings.notifications && snap.notificationAccess && snap.notificationAccess !== 'Allowed' && (
          <div className="set-warn">
            <span>
              {snap.notificationAccess === 'Unavailable'
                ? "This version of Windows doesn't let apps read notifications, so they won't show in the notch."
                : 'Windows is blocking Gabay from reading notifications. Turn on "Notification access" for apps, then come back: Gabay notices by itself.'}
            </span>
            {snap.notificationAccess !== 'Unavailable' && (
              <button className="chip on" onClick={() => void window.overlay.quickOpen('notifyaccess')}>
                Open privacy settings
              </button>
            )}
          </div>
        )}
        {settings.notifications && snap.notificationAccess === 'Allowed' && (
          <div className="set-tip">
            <span>
              Seeing every notification twice? Turn on <b>Do not disturb</b> in Windows: its pop-ups stop, and Gabay still
              shows each one in the notch.
            </span>
            <button className="chip" onClick={() => void window.overlay.quickOpen('notifications')}>
              Open Windows notifications
            </button>
          </div>
        )}
      </div>

      <div className="set-row">
        <div className="set-label">Accent colour</div>
        <div className="set-opts swatches">
          {Object.entries(ACCENT_PRESETS).map(([key, a]) => (
            <button
              key={key}
              className={settings.accent === key ? 'swatch on' : 'swatch'}
              title={a.label}
              aria-label={`${a.label} accent`}
              aria-pressed={settings.accent === key}
              style={a.hex ? { background: a.hex } : undefined}
              onClick={() => void save({ accent: key })}
            >
              {key === 'windows' && <span className="swatch-win">W</span>}
            </button>
          ))}
        </div>
      </div>

      <WeatherRow place={settings.place?.name ?? null} onHold={onHold} onSaved={() => void window.overlay.getSettings().then((r) => { setSnap(r); onSettings(r.settings) })} />

      <div className="set-row">
        <div className="set-label">Lyrics in Now playing</div>
        <div className="set-opts">
          <button className={settings.lyrics ? 'chip on' : 'chip'} onClick={() => void save({ lyrics: true })}>
            On
          </button>
          <button className={!settings.lyrics ? 'chip on' : 'chip'} onClick={() => void save({ lyrics: false })}>
            Off
          </button>
        </div>
        <div className="set-note muted">Looks up the song's title and artist on lrclib.net (free, open lyrics).</div>
      </div>

      <CalendarRow onHold={onHold} />
      <UpdateRow />
      <div className="set-row">
        <div className="set-label">Install updates automatically</div>
        <div className="set-opts">
          <button
            className={settings.autoUpdate ? 'chip on' : 'chip'}
            title="While you're away from the PC for a few minutes, Gabay updates and restarts by itself"
            onClick={() => void save({ autoUpdate: true })}
          >
            On
          </button>
          <button className={!settings.autoUpdate ? 'chip on' : 'chip'} onClick={() => void save({ autoUpdate: false })}>
            Off
          </button>
        </div>
      </div>
      <div className="set-row">
        <div className="set-label">Update channel</div>
        <div className="set-opts">
          <button className={settings.updateChannel === 'stable' ? 'chip on' : 'chip'} onClick={() => void save({ updateChannel: 'stable' })}>
            Stable
          </button>
          <button
            className={settings.updateChannel === 'preview' ? 'chip on' : 'chip'}
            title="Get new versions before everyone else. They may have rough edges."
            onClick={() => void save({ updateChannel: 'preview' })}
          >
            Preview
          </button>
        </div>
        {settings.updateChannel === 'preview' && <div className="set-note muted">You get new versions first, before they go out to everyone.</div>}
      </div>
      <WhatsNewRow version={snap.version} />
      <ShortcutsRow hotkey={liveHotkey ?? activeHotkey} />
      <div className="set-row">
        <div className="set-label">Welcome tour</div>
        <div className="set-opts">
          <button className="chip" onClick={onShowWelcome}>
            Show it again
          </button>
        </div>
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

      <div className="set-section">Experiments</div>
      <div className="set-row">
        <div className="set-label">Reserve space at the top</div>
        <div className="set-opts">
          <button
            className={settings.reserveTop ? 'chip on' : 'chip'}
            title="Maximized and snapped windows fit below the notch, like they do above the taskbar"
            onClick={() => void save({ reserveTop: true })}
          >
            On
          </button>
          <button className={!settings.reserveTop ? 'chip on' : 'chip'} onClick={() => void save({ reserveTop: false })}>
            Off
          </button>
        </div>
        {settings.reserveTop && <div className="set-note muted">Maximized windows now start below the notch. Full screen still uses the whole screen.</div>}
      </div>
      <div className="set-row">
        <div className="set-label">Hide the Windows taskbar</div>
        <div className="set-opts">
          <button
            className={settings.hideTaskbar ? 'chip on' : 'chip'}
            title="Auto-hides the taskbar and shows your open apps at the bottom of this panel"
            onClick={() => void save({ hideTaskbar: true })}
          >
            On
          </button>
          <button className={!settings.hideTaskbar ? 'chip on' : 'chip'} onClick={() => void save({ hideTaskbar: false })}>
            Off
          </button>
        </div>
        {settings.hideTaskbar && (
          <div className="set-note muted">
            Your open apps are at the bottom of this panel: click one to switch to it, or the one you're using to minimize it.
            The taskbar is still there if you push the pointer to the bottom edge. Turning this off or quitting Gabay puts it back.
          </div>
        )}
      </div>
    </div>
  )
}
