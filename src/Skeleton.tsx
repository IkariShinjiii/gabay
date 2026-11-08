import { tr } from './i18n'

/**
 * Placeholders for a panel that is still loading (its code on first open, or its data). Each kind is drawn at about the
 * size of the real panel, so nothing jumps when the content arrives. Screen readers hear one "Loading", not the blocks.
 */
export type SkeletonKind = 'list' | 'tiles' | 'settings' | 'stats' | 'lines' | 'grid'

const bar = (w: string, h = 10): React.JSX.Element => <span className="sk sk-bar" style={{ width: w, height: h }} />

function Rows({ count }: { count: number }): React.JSX.Element {
  return (
    <div className="sk-rows">
      {Array.from({ length: count }, (_, i) => (
        <div className="sk-row" key={i}>
          <span className="sk sk-well" />
          <span className="sk-text">
            {bar(i % 2 ? '46%' : '62%', 11)}
            {bar(i % 3 ? '30%' : '38%', 9)}
          </span>
        </div>
      ))}
    </div>
  )
}

function Body({ kind }: { kind: SkeletonKind }): React.JSX.Element {
  switch (kind) {
    case 'tiles':
      return (
        <div className="sk-page">
          <div className="sk-tiles">
            {Array.from({ length: 9 }, (_, i) => (
              <span className="sk sk-block" key={i} style={{ height: 54, borderRadius: 14 }} />
            ))}
          </div>
          <span className="sk sk-block" style={{ height: 40, borderRadius: 14 }} />
          <span className="sk sk-block" style={{ height: 40, borderRadius: 14 }} />
          <span className="sk sk-block" style={{ height: 64 }} />
        </div>
      )
    case 'settings':
      return (
        <div className="sk-page">
          {[3, 2, 3].map((n, g) => (
            <div className="sk-group" key={g}>
              {bar('18%', 11)}
              <div className="sk-card">
                {Array.from({ length: n }, (_, i) => (
                  <div className="sk-setrow" key={i}>
                    <span className="sk-text">
                      {bar(i % 2 ? '34%' : '44%', 11)}
                      {bar('62%', 9)}
                    </span>
                    <span className="sk sk-pill" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )
    case 'stats':
      return (
        <div className="sk-stats">
          {Array.from({ length: 3 }, (_, i) => (
            <span className="sk sk-block" key={i} style={{ height: 140 }} />
          ))}
        </div>
      )
    case 'grid':
      return (
        <div className="sk-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <span className="sk sk-block" key={i} style={{ height: 84 }} />
          ))}
        </div>
      )
    case 'lines':
      return (
        <div className="sk-page">
          {bar('92%', 12)}
          {bar('84%', 12)}
          {bar('88%', 12)}
          {bar('52%', 12)}
        </div>
      )
    default:
      return <Rows count={5} />
  }
}

export default function Skeleton({ kind }: { kind: SkeletonKind }): React.JSX.Element {
  return (
    <div className="body skeleton" role="status" aria-busy="true" aria-label={tr('Loading')}>
      <div aria-hidden="true">
        <Body kind={kind} />
      </div>
    </div>
  )
}

/** A few placeholder rows inside a panel that is already on screen (a list that is still being fetched). */
export function SkeletonRows({ count = 3 }: { count?: number }): React.JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-label={tr('Loading')}>
      <div aria-hidden="true">
        <Rows count={count} />
      </div>
    </div>
  )
}

/** The skeleton that matches each tab's panel. */
export const TAB_SKELETON: Record<string, SkeletonKind> = {
  Launch: 'list',
  Clipboard: 'list',
  Today: 'list',
  Inbox: 'list',
  Notes: 'lines',
  Power: 'grid',
  Settings: 'settings',
  System: 'stats',
  Controls: 'tiles'
}
