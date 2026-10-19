// Single source for the product name so a rename touches one line (plus index.html's static <title>).
export const APP_NAME = 'Gabay'

// Notch geometry. The window is fixed at 560x440 (electron/main.ts); the notch animates inside it.
export const NOTCH = {
  // Proportions follow an iPhone XS Max notch: wide and short, flush with the top edge, rounder at the bottom.
  collapsed: { width: 210, height: 32 },
  collapsedBottomRadius: 18,
  expanded: { width: 520, height: 400 }
} as const

// Auto-hide: how long the pointer must rest on the top edge to reveal the notch, and how long after it leaves
// before the notch slides away again. Resting (not passing through) keeps ordinary tab clicks from triggering it.
export const REVEAL_DWELL_MS = 350
export const HIDE_DELAY_MS = 900

// How long the pointer must stay outside the notch before it collapses. The saved setting wins.
export const COLLAPSE_DELAY_MS = 400
export const COLLAPSE_STEP_MS = 100

// Stats refresh interval; polling runs only while the panel is open on the System tab.
export const STATS_POLL_MS = 1500
