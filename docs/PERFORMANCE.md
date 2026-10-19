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
