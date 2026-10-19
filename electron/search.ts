// Tiny fuzzy matcher so we don't need a dependency. Higher score = better; null = no match.
// Tiers (before bonuses): prefix 1000 > word-start 800 > substring 600 > in-order subsequence 100..400.

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function fuzzyScore(query: string, name: string): number | null {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const n = name.toLowerCase()

  if (n.startsWith(q)) return 1000 - Math.min(n.length - q.length, 100)

  // Match at the start of any word ("code" in "Visual Studio Code").
  const wordStart = n.search(new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(q)}`))
  if (wordStart >= 0) return 800 - Math.min(wordStart, 100)

  const sub = n.indexOf(q)
  if (sub >= 0) return 600 - Math.min(sub, 100)

  // Subsequence ("vsc" -> "Visual Studio Code"): reward matches at word starts and consecutive runs.
  let qi = 0
  let score = 0
  let prev = -2
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] !== q[qi]) continue
    const atWordStart = i === 0 || /[^a-z0-9]/.test(n[i - 1])
    score += atWordStart ? 30 : 10
    if (i === prev + 1) score += 15
    prev = i
    qi++
  }
  return qi === q.length ? Math.min(400, 100 + score) : null
}
