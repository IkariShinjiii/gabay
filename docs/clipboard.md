# Clipboard tab

Text clipboard history (polled every second by the main process), newest first with pinned items on top. Type in the
search field to filter, click a row to copy it back, star to pin, "Clear history" to forget everything unpinned.

- Cap: 50 unpinned + 50 pinned items, 10,000 characters each. The last 10 images are kept too (memory only); files are ignored.
- **Privacy:** unpinned history is memory-only and gone when Gabay quits. Only pinned items are written to disk
  (`clipboard-pinned.json` in `%APPDATA%\gabay`, plain text), so don't pin secrets.
- **Skips private copies:** text that a password manager or private window marks as "don't keep in clipboard history"
  is never recorded (checked by the native helper).
- The renderer only ever gets truncated one-line previews and opaque ids; the full text stays in the main process.
