import assert from 'node:assert/strict'
import { isLocked, loopbackUrl, parseReply, parseStatus, parseUsage } from '../electron/shinji.ts'

// The address must stay on this PC: plain http, loopback host, no credentials, path or query.
assert.equal(loopbackUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000')
assert.equal(loopbackUrl('http://localhost:4000/'), 'http://localhost:4000')
for (const bad of ['https://127.0.0.1:3000', 'http://example.com', 'http://127.0.0.1.evil.com', 'http://user:pw@127.0.0.1:3000', 'http://127.0.0.1:3000/x', 'http://127.0.0.1:3000/?a=1', 'javascript:alert(1)', 42, null, '']) {
  assert.equal(loopbackUrl(bad), null, String(bad))
}

// The console's status reply is untrusted: wrong shapes are rejected, odd values are clamped.
const ok = { v: 1, ok: true, phase: 'thinking', tier: 2, skill: 'daily-brief', repos: 11, uncommitted: 4, prs: 5, nodes: 83, links: 131 }
assert.deepEqual(parseStatus(ok), { phase: 'thinking', tier: 2, skill: 'daily-brief', repos: 11, uncommitted: 4, prs: 5, nodes: 83, links: 131 })
assert.equal(parseStatus({ ...ok, phase: 'exploding' }), null)
assert.equal(parseStatus({ ...ok, v: 2 }), null)
assert.equal(parseStatus('nope'), null)
assert.equal(parseStatus(null), null)
const odd = parseStatus({ ...ok, tier: 9, skill: '../../etc', repos: -1, prs: 'x' })
assert.deepEqual([odd?.tier, odd?.skill, odd?.repos, odd?.prs], [null, null, 0, 0])

assert.deepEqual(parseUsage({ days: [{ tokens: 5 }, { tokens: 'bad' }], total: 9 }), { days: [5, 0], total: 9 })
assert.equal(parseUsage({ total: 1 }), null)
assert.equal(parseUsage(null), null)

assert.deepEqual(parseReply({ reply: 'hi', tier: 1, heard: 'x' }), { reply: 'hi', tier: 1 })
assert.equal(parseReply({ tier: 1 }), null)
assert.equal(parseReply({ reply: 'x'.repeat(2000) })?.reply.length, 1000)

// A license-locked console says so in its status reply.
assert.equal(isLocked({ ...ok, locked: true }), true)
assert.equal(isLocked({ ...ok, locked: false }), false)
assert.equal(isLocked({ ...ok }), false)
assert.equal(isLocked(null), false)
assert.equal(isLocked({ locked: 'yes' }), false)

console.log('shinji checks passed')
