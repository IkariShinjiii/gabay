// Self-check for src/todayTimeline.ts. Run: node scripts/check-today-timeline.mjs (Node >= 22.18 imports .ts directly).
import assert from 'node:assert/strict'
import { buildTimeline, inParts, minutesLeft, progress, underMinute } from '../src/todayTimeline.ts'

const M = 60000
const now = new Date(2026, 5, 10, 12, 0, 0).getTime()
const at = (h, m = 0, day = 0) => new Date(2026, 5, 10 + day, h, m).getTime()
const ev = (title, start, end, extra = {}) => ({ title, start, end, allDay: false, location: '', ...extra })
const titles = (a) => a.map((e) => e.title)

// ordering: past, live, upcoming
let t = buildTimeline([ev('c', at(14), at(15)), ev('a', at(9), at(10)), ev('b', at(11, 30), at(12, 30))], now, [])
assert.deepEqual(titles(t.past), ['a'])
assert.equal(t.now.title, 'b')
assert.deepEqual(titles(t.upcoming), ['c'])

// past capped at the latest 2
t = buildTimeline([ev('p1', at(6), at(7)), ev('p2', at(8), at(9)), ev('p3', at(10), at(11))], now, [])
assert.deepEqual(titles(t.past), ['p2', 'p3'])
assert.equal(t.now, null)

// overlap: soonest end is primary, the other is live in upcoming
t = buildTimeline([ev('long', at(11), at(14)), ev('short', at(11, 30), at(12, 30))], now, [])
assert.equal(t.now.title, 'short')
assert.deepEqual(t.upcoming.map((e) => [e.title, !!e.live]), [['long', true]])

// under a minute, minutesLeft rounds up
const ending = ev('x', at(11), now + 59 * 1000)
assert.equal(underMinute(ending, now), true)
assert.equal(minutesLeft(ending, now), 1)
assert.equal(underMinute(ev('y', at(11), now + M), now), false)
assert.equal(minutesLeft(ev('z', at(11), now - 5), now), 0)

// inParts
assert.deepEqual(inParts(ev('i', now + (3 * 60 + 49) * M, at(18)), now), { h: 3, m: 49 })
assert.deepEqual(inParts(ev('i', now + 12 * M, at(18)), now), { h: 0, m: 12 })
assert.deepEqual(inParts(ev('i', now + 30 * 1000, at(18)), now), { h: 0, m: 1 })

// progress clamps, bad length is 0
assert.equal(progress(ev('g', at(11), at(13)), now), 0.5)
assert.equal(progress(ev('g', at(13), at(14)), now), 0)
assert.equal(progress(ev('g', at(9), at(10)), now), 1)
assert.equal(progress(ev('g', at(11), at(11)), now), 0)

// tomorrow never Now or upcoming; all-day first; cap 3
t = buildTimeline(
  [ev('t1', at(9, 0, 1), at(10, 0, 1)), ev('t2', at(10, 0, 1), at(11, 0, 1)), ev('t3', at(11, 0, 1), at(12, 0, 1)),
   ev('tad', at(0, 0, 1), at(0, 0, 2), { allDay: true })],
  now, [])
assert.equal(t.now, null)
assert.equal(t.upcoming.length, 0)
assert.deepEqual(titles(t.tomorrowAllDay), ['tad'])
assert.deepEqual(titles(t.tomorrow), ['t1', 't2'])

// all-day split today / tomorrow, cap with hidden count
const ad = (n, d) => ev(n, at(0, 0, d), at(0, 0, d + 1), { allDay: true })
t = buildTimeline([ad('a1', 0), ad('a2', 0), ad('a3', 0), ad('a4', 0), ad('b1', 1)], now, [])
assert.equal(t.allDay.length, 3)
assert.equal(t.hiddenAllDay, 1)
assert.deepEqual(titles(t.tomorrowAllDay), ['b1'])

// point event and bad data: never Now, past once started
t = buildTimeline([ev('pt', at(11), at(11)), ev('bad', at(13), at(12)), ev('noend', at(9), 0)], now, [])
assert.equal(t.now, null)
assert.deepEqual(titles(t.past), ['noend', 'pt'])
assert.deepEqual(titles(t.upcoming), ['bad'])

// spans midnight counts as today and live
t = buildTimeline([ev('night', at(22, 0, -1), at(13))], now, [])
assert.equal(t.now.title, 'night')

// tasks: open first, then done; openCount; cap 6 with remainder
const todo = (id, done) => ({ id, text: id, done })
t = buildTimeline([], now, [todo('d1', true), todo('o1', false), todo('o2', false)])
assert.deepEqual(titles(t.tasks.map((x) => ({ title: x.id }))), ['o1', 'o2', 'd1'])
assert.equal(t.openCount, 2)
t = buildTimeline([], now, Array.from({ length: 9 }, (_, i) => todo('k' + i, false)))
assert.equal(t.tasks.length, 6)
assert.equal(t.hiddenTasks, 3)

// empty
t = buildTimeline([], now, [])
assert.deepEqual([t.allDay, t.past, t.upcoming, t.tomorrow, t.tasks], [[], [], [], [], []])
assert.equal(t.now, null)
assert.equal(t.openCount, 0)

console.log('ok')
