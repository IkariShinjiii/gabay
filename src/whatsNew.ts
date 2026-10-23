// What each release brought, in plain words. Shown once as a toast after updating, and in Settings > What's new.
// Newest first; add an entry with every release.
export const WHATS_NEW: [version: string, items: string[]][] = [
  [
    '1.3.6',
    [
      'No notification sound over a full-screen game or video, and the summon hotkey no longer pulls you out of a match',
      'Gabay runs at a lower priority so it never competes with a game for the CPU'
    ]
  ],
  [
    '1.3.5',
    [
      'Fixed Gabay popping open while you play: it now ignores the mouse while a game has it locked'
    ]
  ],
  [
    '1.3.4',
    [
      'Gabay in Filipino: pick it in Settings › Language',
      'Point at a notification in the notch to open its app or dismiss it'
    ]
  ],
  ['1.3.3', ['Controls fits again with the dock and lyrics showing: nothing is cut off or squeezed']],
  [
    '1.3.2',
    [
      "Only Gabay pops up: turn on Windows' Do not disturb, and notifications still show in the notch",
      'A soft sound with each notification while Windows is on Do not disturb (Settings to turn it off)',
      'On PCs without Wi-Fi: no Mobile hotspot tile, and a cable icon when the network is down'
    ]
  ],
  [
    '1.3.1',
    [
      'Works on desktop PCs: battery, Wi-Fi and Bluetooth only show when the PC has them',
      'Shows a wired (LAN) connection, even when Wi-Fi is also connected',
      'Volume per app no longer scrolls sideways',
      'A tip in Settings for when notifications pop up twice'
    ]
  ],
  [
    '1.3.0',
    [
      'The dock groups windows by app, keeps your starred apps, and has a right-click menu',
      'The camera dot works again, and hovering the dot shows which app is using it',
      "After an update, this note waits until you're back at the PC",
      'A Preview update channel, to get new versions first'
    ]
  ],
  ['1.2.0', ['Updates install by themselves while you are away from the PC (Settings > Install updates automatically)']],
  [
    '1.1.0',
    [
      'Hide the Windows taskbar (Settings > Experiments): your open apps move into the notch',
      'A dot on the notch when an app wants your attention',
      'The mic dot now shows whenever an app is recording'
    ]
  ],
  [
    '1.0.0',
    [
      'Gabay 1.0: ready to share',
      'Settings shows when Windows blocks notifications, with a button to fix it',
      'Notifications use less CPU',
      'Uninstalling also turns off start-at-login'
    ]
  ],
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
