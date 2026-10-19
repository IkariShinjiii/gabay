import { ICONS, type IconName } from './icons'

/** Decorative by default (the button around it carries the label). Sizes with the surrounding font via 1em. */
export default function Icon({ name, size = 16 }: { name: IconName; size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
    >
      {ICONS[name].map(([tag, attrs], i) => {
        const Tag = tag
        return <Tag key={i} {...attrs} />
      })}
    </svg>
  )
}
