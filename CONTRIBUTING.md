# Contributing to Gabay

Thanks for helping! Gabay is a small Windows app made mostly by one person, so a few clear rules keep it fast to review.

## Get it running

You need Windows 10 (1809+) or 11 and Node 24.

```powershell
git clone https://github.com/IkariShinjiii/gabay
cd gabay
npm install
npm run dev
```

If `npm run dev` fails, the README's Setup section covers the two common causes (the Electron binary not downloaded,
and `ELECTRON_RUN_AS_NODE` being set). Before you open a pull request run:

```powershell
npm run typecheck
npm run build
```

CI runs the same two commands.

## Finding something to work on

- Issues labelled [good first issue](https://github.com/IkariShinjiii/gabay/labels/good%20first%20issue) are small and self-contained.
- Comment on an issue before you start so two people don't build the same thing.
- Have a bigger idea? Open a [discussion](https://github.com/IkariShinjiii/gabay/discussions) first.

## Rules that protect users

Gabay reads notifications, the clipboard and window titles, so these are not optional:

- **Keep the security model.** `contextIsolation` and `sandbox` stay on. The renderer talks to the main process only through
  the typed preload, and every IPC handler checks the sender (`fromUi`). The renderer never sends commands, paths or URIs:
  it sends a key or a validated value, and the main process maps it to a fixed action.
- **Private data stays private.** Don't log or store notification text, clipboard contents, window titles or file paths.
- **No Win-key shortcuts**, and no new dependency without discussing it in the issue first.
- Keep changes small and focused: one fix or feature per pull request.

## Pull requests

1. Fork, then branch from `main`.
2. Make the change and run `npm run typecheck` and `npm run build`.
3. Open a pull request that says what changed and why, and link the issue (`Fixes #123`).
4. If it changes what users see, add a line to `CHANGELOG.md` under the next version.

Pull requests are squash-merged.

## Reporting bugs and vulnerabilities

Use the issue forms for bugs and ideas. For a security problem, don't open a public issue: follow [SECURITY.md](SECURITY.md).

By contributing you agree your work is released under the project's [GPL-3.0](LICENSE) license.
