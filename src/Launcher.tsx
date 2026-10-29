import { Fragment, useEffect, useRef } from 'react'
import Empty from './Empty'
import AppIcon from './AppIcon'
import Icon from './Icon'
import type { LauncherItem } from './global'
import { tr } from './i18n'

interface Props {
  items: LauncherItem[]
  selected: number
  emptyHint: string
  onHover: (index: number) => void
  onLaunch: (item: LauncherItem) => void
  onToggleStar: (item: LauncherItem) => void
}

export default function Launcher({ items, selected, emptyHint, onHover, onLaunch, onToggleStar }: Props): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  // keep the row picked with the arrow keys in view when the list scrolls
  useEffect(() => {
    listRef.current?.querySelector('.row.on')?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  if (items.length === 0) return <Empty icon="search" title={emptyHint} hint={emptyHint.startsWith(tr('No')) ? tr('Try fewer letters, or part of the name.') : undefined} />

  return (
    <div className="body results" ref={listRef}>
      {items.map((it, i) => (
        // mousedown is cancelled so clicking a row never steals focus from the search field.
        <Fragment key={it.id}>
        {it.kind === 'file' && items[i - 1]?.kind !== 'file' && <div className="results-head">{tr('Files')}</div>}
        <div
          className={i === selected ? 'row on' : 'row'}
          onMouseMove={() => onHover(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onLaunch(it)}
        >
          <AppIcon id={it.id} />
          <span className="row-name">{it.name}</span>
          {it.kind === 'file' ? (
            it.folder && <span className="row-sub">{it.folder}</span>
          ) : (
            <button
              className={it.starred ? 'star on' : 'star'}
              title={it.starred ? tr('Unstar') : tr('Star')}
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
      ))}
    </div>
  )
}
