import Icon from './Icon'
import type { IconName } from './icons'

/** Empty and waiting states: an icon in a soft well, a short line, and an optional hint under it. */
export default function Empty({ icon, title, hint }: { icon: IconName; title: string; hint?: string }): React.JSX.Element {
  return (
    <div className="body body-center empty">
      <span className="empty-well">
        <Icon name={icon} size={20} />
      </span>
      <span className="empty-title">{title}</span>
      {hint && <span className="empty-hint">{hint}</span>}
    </div>
  )
}
