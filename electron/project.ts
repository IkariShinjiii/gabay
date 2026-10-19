import { screen } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'

/** The four Win+P modes. */
export type ProjectMode = 'internal' | 'clone' | 'extend' | 'external'

const MODES: readonly ProjectMode[] = ['internal', 'clone', 'extend', 'external']
export const isProjectMode = (m: unknown): m is ProjectMode => typeof m === 'string' && (MODES as readonly string[]).includes(m)

/**
 * Best guess at the current mode from what Electron sees: two or more displays at the same position are duplicated,
 * otherwise extended; a single display is "PC screen only" if it is the built-in panel and "second screen only" if not.
 */
export function currentProjectMode(): ProjectMode {
  const ds = screen.getAllDisplays()
  if (ds.length >= 2) {
    const [a, b] = ds
    return a.bounds.x === b.bounds.x && a.bounds.y === b.bounds.y ? 'clone' : 'extend'
  }
  return ds[0]?.internal === false ? 'external' : 'internal'
}

/** Switch with Windows' own DisplaySwitch.exe (what Win+P uses). Fixed path, argument from a fixed list, no shell. */
export function setProjectMode(mode: ProjectMode): Promise<boolean> {
  const exe = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'DisplaySwitch.exe')
  return new Promise((resolve) => execFile(exe, [`/${mode}`], { windowsHide: true, timeout: 10_000 }, (err) => resolve(!err)))
}
