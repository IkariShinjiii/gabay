# Today tab, focus timer and command bar

- **Today:** clock, date, a to-do list (add, check off, delete; saved in `todos.json` in userData), and a focus timer with
  Start/Pause/Reset and 15/25/50 minute presets.
- **Collapsed pill:** shows the clock; while a focus timer exists it shows a progress ring and countdown instead
  (display only; control it from the Today tab or the command bar). The timer keeps running while the panel is closed.
- **The bar** (bottom field, one input for everything): text that is a command runs it on Enter (a live hint shows what
  will happen); anything else searches apps, or filters the clipboard on the Clipboard tab. Ctrl+1 to Ctrl+9 switch tabs.
  Commands:
  `lock`, `sleep`, `restart`, `shutdown`, `focus [minutes]` / `timer` / `start`, `pause`, `reset`, `todo <text>`,
  `open <app>`, `clear clipboard`, `go <tab>`. `restart` and `shutdown` never run from the command bar: they open the Power
  tab's confirmation. Buttons and commands call the same actions.
- Focused inputs (search, command, to-do) keep the panel open.
