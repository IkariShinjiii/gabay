; Gabay's uninstall clean-up (electron-builder includes build/installer.nsh automatically).
; Skipped during updates: an update silently uninstalls the old version first, and start-at-login must survive that.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Start at login (the entry Electron's setLoginItemSettings writes, and Task Manager's on/off record of it)
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Gabay"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "electron.app.Gabay"
    ; So installing again later turns start-at-login back on
    Delete "$APPDATA\gabay\login-default-applied"
    ; The helper Gabay compiled on this PC. Settings, notes and to-dos stay, as with most apps.
    RMDir /r "$APPDATA\gabay\bin"
  ${endIf}
!macroend
