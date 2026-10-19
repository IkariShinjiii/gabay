// Single source for the product name so a rename touches one line (plus index.html's static <title>).
export const APP_NAME = 'Gabay'

// Notch geometry. The window is fixed at 560x440 (electron/main.ts); the notch animates inside it.
export const NOTCH = {
  collapsed: { width: 200, height: 38 },
  expanded: { width: 520, height: 400 }
} as const

// Default for how long the pointer must stay outside the notch before it collapses. The saved setting wins.
export const COLLAPSE_DELAY_MS = 400
export const COLLAPSE_RANGE = { min: 200, max: 1500, step: 100 } as const

// Stats refresh interval; polling runs only while the panel is open on the System tab.
export const STATS_POLL_MS = 1500
