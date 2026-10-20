// What each release brought, in plain words. Shown once as a toast after updating, and in Settings > What's new.
// Newest first; add an entry with every release.
export const WHATS_NEW: [version: string, items: string[]][] = [
  [
    '0.32.0',
    [
      'Quick notes in a new Notes tab',
      'Shortcuts and commands, listed in Settings',
      'Reset settings to defaults (to-dos, notes and clips stay)',
      'This note after each update'
    ]
  ],
  ['0.31.0', ['A welcome tour on first run']],
  [
    '0.30.0',
    [
      'Screenshot and screen recording',
      'Weather, download progress, and camera and mic dots',
      'Focus, a stopwatch and timers',
      'Volume per app, accent colours, clipboard images, seeking and lyrics',
      'Report a bug in Settings'
    ]
  ]
]

export const notesFor = (version: string): string[] => WHATS_NEW.find(([v]) => v === version)?.[1] ?? WHATS_NEW[0][1]
