import type { OpenWindow } from './global'
import Icon from './Icon'

/**
 * Open apps, shown at the foot of the panel while the Windows taskbar is hidden. Click to switch to one; click the
 * one in use to minimize it, like the taskbar. A mark under each icon: wide for the one in use, accent and pulsing
 * for an app that wants attention.
 */
export default function Dock({ wins, onClick }: { wins: OpenWindow[]; onClick: (id: string) => void }): React.JSX.Element {
  return (
    <div
      className="dock"
      role="toolbar"
      aria-label="Open apps"
      onWheel={(e) => {
        // A plain wheel scrolls the row sideways when there are more apps than fit.
        e.currentTarget.scrollLeft += e.deltaY + e.deltaX
      }}
    >
      {wins.map((w) => (
        <button
          key={w.id}
          className={['dock-app', w.active && !w.minimized && 'on', w.minimized && 'min', w.attention && 'attn'].filter(Boolean).join(' ')}
          title={w.attention ? `${w.title} (wants your attention)` : w.title}
          aria-label={w.title}
          onClick={() => onClick(w.id)}
        >
          {w.icon ? <img src={w.icon} alt="" draggable={false} /> : <Icon name="app-window" size={20} />}
          <span className="dock-mark" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
