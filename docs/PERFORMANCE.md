# Performance baseline

Measured 2026-10-19 on Windows 11 25H2 (build 26200.9711), Electron 44.9.0, 12 logical cores, 23.7 GB RAM.
Method: sum of all `electron.exe` processes (4: main, GPU, network, renderer) via `Get-Process`, sampled over 10 s
with the mouse parked, after pointer-driven expand and click on the System tab. Working set double-counts pages
shared between processes, so "private" is the fairer number.

| State | Working set | Private | CPU (of total) |
| --- | --- | --- | --- |
| Production build, collapsed, idle | 319 MB | 181 MB | 0.00% |
| Production build, expanded, System tab polling every 1.5 s | 335 MB | 198 MB | 0.98% |
| Production build, collapsed again after closing | 338 MB | 204 MB | 0.01% |
| Dev build, collapsed idle | 357 MB | 217 MB | 0.00% |
| Dev build, expanded, System tab polling | 359 MB | 217 MB | 1.38% |

## Against the plan's budget

- **CPU:** collapsed is under 1% (0.00%). Expanded polling is about 1% of total CPU. Within budget.
- **RAM: over budget.** The plan guessed under 150 MB collapsed; the measured private total is 181 MB (319 MB working set).
  A bare multi-process Electron app has a high floor, so the 150 MB figure was a guess and likely needs revising
  rather than chasing. Re-check at Milestone 9.
- Memory rose about 20 MB after the first expand and did not return to the starting level after collapsing
  (204 MB private vs 181 MB). Worth watching for a leak in later milestones.
- Polling runs only while the notch is expanded on the System tab; nothing polls while collapsed.
