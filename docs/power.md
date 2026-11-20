# Power tab

Lock, Sleep, Restart, Shut down. Restart and Shut down ask for confirmation in the panel (Cancel is focused, Esc cancels,
and the panel stays open while the prompt is up). The renderer sends only an action name; the main process maps it to a fixed
command (`rundll32`, `shutdown /r|/s /t 0`, PowerShell `SetSuspendState`). Sleep uses `SetSuspendState(Suspend)` because the
common `rundll32 powrprof.dll` form hibernates when hibernation is enabled.

Dev-only: `GABAY_DRY_RUN=1 npm run dev` logs the command instead of running it (ignored in packaged builds).
