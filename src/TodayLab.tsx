import { TodaySky } from './TodaySky'

// Temporary dev harness for the Today redesign (GABAY_PREVIEW=TodayLab). F5 deletes it.
const CASES: { name: string; rise?: number; set?: number; minute: number; polar?: 'day' | 'night' }[] = [
  { name: 'pre-dawn 05:10', rise: 342, set: 1051, minute: 310 },
  { name: 'morning 09:41', rise: 342, set: 1051, minute: 581 },
  { name: 'noon 12:00', rise: 342, set: 1051, minute: 720 },
  { name: 'sunset 17:20', rise: 342, set: 1051, minute: 1040 },
  { name: 'night 22:30', rise: 342, set: 1051, minute: 1350 },
  { name: 'polar day 12:00', rise: 0, set: 0, minute: 720, polar: 'day' },
  { name: 'polar night 12:00', rise: 0, set: 0, minute: 720, polar: 'night' },
  { name: 'no forecast 10:00', minute: 600 }
]

export default function TodayLab(): React.JSX.Element {
  const q = new URLSearchParams(location.hash.slice(1))
  const lang = q.get('lang') ?? undefined
  return (
    <div className="body" style={{ width: 480, overflowY: 'auto' }}>
      {CASES.slice(Number(q.get('from') ?? 0)).map((c) => (
        <div key={c.name} style={{ marginBottom: 6 }}>
          <div style={{ font: '10px var(--font)', color: 'var(--muted)', padding: '2px 0' }}>{c.name}</div>
          <TodaySky rise={c.rise} set={c.set} minute={c.minute} polar={c.polar} locale={lang === 'fil' ? 'fil-PH' : undefined} />
        </div>
      ))}
    </div>
  )
}
