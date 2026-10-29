# Code signing policy

Gabay's Windows installer is meant to be signed through the [SignPath Foundation](https://signpath.org) open-source
programme. Until that is approved, releases are unsigned and Windows SmartScreen warns on first install.

Once approved: free code signing provided by [SignPath.io](https://about.signpath.io), certificate by
[SignPath Foundation](https://signpath.org).

## What gets signed

- Only files built from this repository by GitHub Actions ([.github/workflows/release.yml](../.github/workflows/release.yml))
  from a version tag on `main`. Nothing built on a personal computer is signed.
- The signed file is the installer, `Gabay-Setup-<version>.exe`, published on
  [GitHub releases](https://github.com/IkariShinjiii/gabay/releases).
- Gabay's small native helper is compiled on each PC from the source in `electron/nativeSource.ts`, using the C#
  compiler that ships with Windows. It is not part of the signed installer.

## Team

- Committers and reviewers: [IkariShinjiii](https://github.com/IkariShinjiii)
- Approvers (who approve each signing request): [IkariShinjiii](https://github.com/IkariShinjiii)

Every change reaches `main` through a pull request. Accounts with access to the repository and to SignPath use
multi-factor authentication.

## Privacy

Gabay does not send information to other networked systems unless the person using it asks for it, or a feature they
turn on needs it. It has no accounts, ads, analytics or telemetry. Notifications, clipboard, notes, to-dos and
calendar data stay on the PC.

| When | Server | What is sent |
| --- | --- | --- |
| Checking for updates (on start, then every hour) | api.github.com, github.com | A request for the latest release. Updates download from GitHub releases and are checked against the published SHA-512 hash. |
| Weather, if a city is set | open-meteo.com | The city name you type (once, to find it), then its latitude and longitude. |
| Calendar, if you add a calendar link | The address you paste (for example Google or Outlook) | A request for that calendar file. Events are read on the PC and not sent anywhere else. |
| Lyrics, if turned on in Settings | lrclib.net | The title, artist and length of the song playing. |
| Report a bug, Rate Gabay (only when clicked) | github.com, in your browser | Opens a GitHub page. You see the report and choose whether to send it. User names and home folders are removed from it first. |

## Reporting a problem

Open an issue at https://github.com/IkariShinjiii/gabay/issues.
