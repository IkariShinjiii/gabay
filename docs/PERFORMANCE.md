# Performance

Measured on Windows 11 25H2 (build 26200.9711), Electron 44.9.0, 12 logical cores, 23.7 GB RAM.
Method: sum of the 4 `electron.exe` processes (main, GPU, utility/network, renderer) from `Get-Process`, sampled over
5-10 s with the pointer parked. "Private" is the fair number; working set double-counts pages shared between processes.
Production build (`npm run build` then `electron-vite preview`).

## Budget check (Milestone 9)

| Budget (from the plan) | Result | Verdict |
| --- | --- | --- |
| Collapsed: under 150 MB RAM | 125 MB private fresh, 137 MB after use | **Pass** (after the GPU change below) |
| Collapsed: under 1% CPU | 0.00% idle, 0.01% after use | Pass |
| Expanded: stats every 1-2 s, only while open | 1.5 s poll, only on the System tab; 0.57% CPU | Pass |
| Clipboard: slow poll, capped history | 1 s poll, 50 unpinned + 50 pinned, 10k chars each | Pass |
| No background work while collapsed except the clock | Clock re-renders once a minute; clipboard poll (1 s) and an optional running focus timer (0.5 s render tick) are the only other work | Pass, with those two noted |

## What changed

Before this milestone the collapsed app used about 213 MB private (255 MB after the first uses), over the 150 MB guess.
The GPU process was the cost: 105 MB fresh, 134 MB after use, for a 520x400 transparent overlay. Turning hardware
acceleration off (`app.disableHardwareAcceleration()`) cut it to 16 MB with the same transparency and the same animation
CPU (about 0.5 s of CPU per expand/collapse cycle either way: 5.28 s vs 4.97 s over 10 cycles).

| State (production build) | GPU on (before) | GPU off (now) |
| --- | --- | --- |
| Collapsed idle, fresh start | 213 MB private, 327 MB working set | 125 MB private, 276 MB working set |
| After 10 expand/collapse cycles | 255 MB | 142 MB |
| After 30 cycles | 253 MB | not measured |

Per process, GPU off, after use: main 66 MB, GPU 17 MB, utility 12 MB, renderer 42 MB private.

## Re-check at 0.14.1 (tray, settings, icons added)

Dev launch (`electron .` on the built output), 4 processes, pointer parked: collapsed 126 MB private / 281 MB working set,
0.03% CPU; with the Settings tab open 128 MB private, 0.00% CPU. Still under the 150 MB and 1% budgets.

## Full-screen watcher (0.21.0)

The only always-running addition: a 6 KB .NET Framework watcher that checks the foreground window every 400 ms. Measured
at 9 MB private / 14 MB working set and no measurable CPU, so the collapsed total is about 135 MB private, still under 150 MB.
The Quick tab's PowerShell helper runs only while that tab is used and exits 30 s after.

## The "memory rose after first expand" worry

Earlier baseline showed about +20 MB after the first expand and no return. Checked with 10 and 30 cycles: memory
rises once on first use (renderer and GPU allocate for the expanded layout) and then stays flat (255 MB after 10 cycles,
253 MB after 30). That is warm-up, not a leak.

## Trade-offs and caveats

- Software rendering is fine for the current UI. If a later feature needs heavy animation or video, set `GABAY_GPU=1`
  to compare and reconsider.
- The kill test (overlay above full-screen video and games) was run before this change. Window stacking does not depend
  on the GPU, but re-run kill-test items 2 and 3 once to be sure.
- Dev builds use more (about 217 MB private at Milestone 3); only production numbers are judged against the budget.
- One machine, one run per figure. Treat differences under ~10 MB as noise.

## Native helper and live features (0.28.0)

Same method, preview build, collapsed and idle 20 s after start, measured on 2026-10-20.

| | Private memory | CPU (10 s idle) |
| --- | --- | --- |
| Electron (4 processes) | about 130 MB | 0.01% |
| `gabay-native` helper (full screen, media, notifications) | 25 MB | under 0.01% |
| Total | 155 MB (159 MB before the trims below) | 0.01%; 0.1% with the music meter |

The helper replaced the 9 MB full-screen watcher. It costs about 16 MB more because it loads the Windows Runtime for
media and notifications. The total is now just over the old 150 MB budget. The hidden PowerShell helper (about 60 MB)
still runs only while the Controls tab is open, plus once for 30 s after start to warm the Controls snapshot.

Trims in this release:
- `spellcheck: false` on the overlay (no dictionaries loaded).
- `disable-features=CalculateNativeWinOcclusion,SpareRendererForSitePerProcess`: no occlusion polling of every desktop
  window, no idle spare renderer.
- The music level meter is stepped and synced (about 7 redraws a second, not every frame) and stops while the notch is
  hidden or a toast is showing. Drawing is in software, so continuous animation would cost CPU.
- Toasts don't run during full screen.
