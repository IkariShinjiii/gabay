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
  if (items.length === 0) return <div className="body body-center">{emptyHint}</div>

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
            {it.starred ? '★' : '☆'}
          </button>
        </div>
      ))}
    </div>
  )
}
