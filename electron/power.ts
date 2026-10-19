import { app } from 'electron'
import { execFile } from 'node:child_process'

export const POWER_ACTIONS = ['lock', 'sleep', 'restart', 'shutdown'] as const
export type PowerAction = (typeof POWER_ACTIONS)[number]

export const isPowerAction = (v: unknown): v is PowerAction => POWER_ACTIONS.includes(v as PowerAction)

// Each action is a fixed executable plus fixed arguments. Nothing from the renderer is ever put on a
// command line: the renderer sends an action NAME, validated against POWER_ACTIONS above.
const COMMANDS: Record<PowerAction, [string, string[]]> = {
  lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
  // Application.SetSuspendState(Suspend, ...) really sleeps. The common `rundll32 powrprof.dll,SetSuspendState`
  // hibernates instead whenever hibernation is enabled.
  sleep: [
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)'
    ]
  ],
  restart: ['shutdown.exe', ['/r', '/t', '0']],
  shutdown: ['shutdown.exe', ['/s', '/t', '0']]
}

/**
 * Runs a power action. In an unpackaged dev run, GABAY_DRY_RUN=1 logs the command instead of running it,
 * so the UI flow can be tested without locking, sleeping, or powering off the machine.
 */
export function runPower(action: PowerAction): Promise<boolean> {
  const [file, args] = COMMANDS[action]
  if (!app.isPackaged && process.env['GABAY_DRY_RUN'] === '1') {
    console.log(`[gabay] dry-run power action: ${action} -> ${file} ${args.join(' ')}`)
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (err) => resolve(!err))
  })
}
