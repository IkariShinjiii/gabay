import Empty from './Empty'
import AppIcon from './AppIcon'
import Icon from './Icon'
import type { LauncherItem } from './global'

interface Props {
  items: LauncherItem[]
  selected: number
  emptyHint: string
  onHover: (index: number) => void
  onLaunch: (item: LauncherItem) => void
  onToggleStar: (item: LauncherItem) => void
}

export default function Launcher({ items, selected, emptyHint, onHover, onLaunch, onToggleStar }: Props): React.JSX.Element {
  if (items.length === 0) return <Empty icon="search" title={emptyHint} hint={emptyHint.startsWith('No') ? 'Try fewer letters, or part of the name.' : undefined} />

  return (
    <div className="body results">
      {items.map((it, i) => (
        // mousedown is cancelled so clicking a row never steals focus from the search field.
        <div
          key={it.id}
          className={i === selected ? 'row on' : 'row'}
          onMouseMove={() => onHover(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onLaunch(it)}
        >
          <AppIcon id={it.id} />
          <span className="row-name">{it.name}</span>
          <button
            className={it.starred ? 'star on' : 'star'}
            title={it.starred ? 'Unstar' : 'Star'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation()
              onToggleStar(it)
            }}
          >
            <Icon name="star" size={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
