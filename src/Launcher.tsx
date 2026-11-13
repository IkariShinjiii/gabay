import { Fragment, useEffect, useRef } from 'react'
import Empty from './Empty'
import AppIcon from './AppIcon'
import Icon from './Icon'
import type { LauncherItem, SettingsKey } from './global'
import { tr } from './i18n'

interface Props {
  items: LauncherItem[]
  selected: number
  /** 'search': matches for typed text. 'home': pinned and recent apps, recent files, then the All apps row. 'all': every app, A to Z. */
  mode: 'search' | 'home' | 'all'
  emptyHint: string
  onHover: (index: number) => void
  onLaunch: (item: LauncherItem) => void
  onToggleStar: (item: LauncherItem) => void
  onReveal: (item: LauncherItem) => void
  onBack: () => void
}

// Windows Settings pages the search finds by name. The key is opened in electron/quick.ts (SETTINGS_PAGES), not here.
const SETTINGS_FIND: { key: SettingsKey; name: string; words: string[] }[] = [
  { key: 'wifi', name: 'Wi-Fi', words: ['wifi', 'wi-fi', 'wireless', 'network', 'internet'] },
  { key: 'bluetooth', name: 'Bluetooth', words: ['bluetooth'] },
  { key: 'display', name: 'Display', words: ['display', 'screen', 'monitor', 'resolution'] },
  { key: 'nightlight', name: 'Night light', words: ['night light', 'nightlight', 'night', 'blue light'] },
  { key: 'sound', name: 'Sound', words: ['sound', 'volume', 'audio', 'speakers'] },
  { key: 'appsfeatures', name: 'Apps', words: ['apps', 'uninstall'] },
  { key: 'windowsupdate', name: 'Windows Update', words: ['update', 'updates', 'windows update'] }
]

/** Settings pages whose name or keywords contain the typed text (2+ letters), as launcher rows. */
export function findSettings(query: string): LauncherItem[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  return SETTINGS_FIND.filter((s) => s.words.some((w) => w.includes(q)))
    .map((s) => ({ id: s.key, name: tr(s.name), starred: false, kind: 'setting' as const }))
}

/** The letter an app files under in All apps: its first letter, or # for digits and symbols. */
const letterOf = (name: string): string => {
  const c = name.trim().charAt(0).toLocaleUpperCase()
  return /\p{L}/u.test(c) ? c : '#'
}

export default function Launcher({ items, selected, mode, emptyHint, onHover, onLaunch, onToggleStar, onReveal, onBack }: Props): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  // keep the row picked with the arrow keys in view when the list scrolls
  useEffect(() => {
    listRef.current?.querySelector('.row.on')?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  // a fresh list starts at its top (All apps opens at A, not where the last list was scrolled)
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
  }, [mode])
  if (mode === 'search' && items.length === 0) return <Empty icon="search" title={emptyHint} hint={tr('Try fewer letters, or part of the name.')} />

  // no pinned or recent apps yet: say how to get some, above the recent files
  const noApps = mode === 'home' && !items.some((it) => !it.kind)
  return (
    <div className="body results" ref={listRef}>
      {mode === 'all' && (
        <div className="results-back">
          <button className="q-icon-btn" title={tr('Back')} aria-label={tr('Back')} onMouseDown={(e) => e.preventDefault()} onClick={onBack}>
            <Icon name="arrow-left" size={16} />
          </button>
          <span className="results-back-title">{tr('All apps')}</span>
          <span className="results-back-count">{items.length}</span>
        </div>
      )}
      {noApps && <p className="results-hint">{emptyHint}</p>}
      {items.map((it, i) => {
        const prev = items[i - 1]
        let head: string | null = null
        if (it.kind === 'file' && prev?.kind !== 'file') head = mode === 'home' ? tr('Recent files') : tr('Files')
        else if (it.kind === 'emoji' && prev?.kind !== 'emoji') head = tr('Emoji')
        else if (it.kind === 'setting' && prev?.kind !== 'setting') head = tr('Settings')
        else if (mode === 'all' && (!prev || letterOf(prev.name) !== letterOf(it.name))) head = letterOf(it.name)
        if (it.kind === 'all') {
          return (
            <div
              key={it.id}
              className={i === selected ? 'row row-more on' : 'row row-more'}
              onMouseMove={() => onHover(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onLaunch(it)}
            >
              <span className="app-icon app-icon-none">
                <Icon name="layout-grid" size={16} />
              </span>
              <span className="row-name">{it.name}</span>
              <Icon name="chevron-right" size={16} />
            </div>
          )
        }
        return (
          // mousedown is cancelled so clicking a row never steals focus from the search field.
          <Fragment key={it.id}>
            {head && <div className={mode === 'all' && it.kind !== 'file' ? 'results-head results-letter' : 'results-head'}>{head}</div>}
            <div
              className={i === selected ? 'row on' : 'row'}
              onMouseMove={() => onHover(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onLaunch(it)}
              onContextMenu={(e) => {
                if (it.kind !== 'file') return
                e.preventDefault()
                onReveal(it)
              }}
              title={it.kind === 'file' ? tr('Right-click or Ctrl+Enter: open file location') : undefined}
            >
              {it.kind === 'emoji' ? (
                <span className="app-icon app-icon-none" aria-hidden="true">
                  {it.id}
                </span>
              ) : it.kind === 'setting' ? (
                <span className="app-icon app-icon-none">
                  <Icon name="settings" size={16} />
                </span>
              ) : (
                <AppIcon id={it.id} lazy={mode === 'all'} fallback={it.kind === 'file' ? 'file' : 'app-window'} />
              )}
              <span className="row-name">{it.name}</span>
              {it.kind === 'file' ? (
                it.folder && <span className="row-sub">{it.folder}</span>
              ) : it.kind === 'setting' || it.kind === 'emoji' ? null : (
                <button
                  className={it.starred ? 'star on' : 'star'}
                  title={it.starred ? tr('Unstar') : tr('Star')}
                  aria-label={it.starred ? tr('Unstar') : tr('Star')}
                  aria-pressed={it.starred}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleStar(it)
                  }}
                >
                  <Icon name="star" size={15} />
                </button>
              )}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
