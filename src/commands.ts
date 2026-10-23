import type { PowerAction } from './global'
import { tr } from './i18n'

/** Everything a command can do. App wires each one to the same function the matching button calls. */
export interface CommandActions {
  startTimer: (minutes?: number) => void
  pauseTimer: () => void
  resetTimer: () => void
  addTodo: (text: string) => Promise<void>
  openApp: (name: string) => Promise<boolean>
  /** lock/sleep run now; restart/shutdown open the Power tab's confirmation instead of running. */
  power: (action: PowerAction) => void
  clearClips: () => Promise<void>
  goTab: (tab: string) => boolean
}

export interface ParsedCommand {
  hint: string
  run: () => Promise<unknown> | void
}

const POWER_WORDS: Record<string, PowerAction> = {
  lock: 'lock',
  sleep: 'sleep',
  restart: 'restart',
  reboot: 'restart',
  shutdown: 'shutdown',
  'shut down': 'shutdown'
}

const POWER_HINT: Record<PowerAction, string> = {
  lock: 'Lock the PC',
  sleep: 'Put the PC to sleep',
  restart: 'Restart (asks to confirm)',
  shutdown: 'Shut down (asks to confirm)'
}

/** Pure parser: text in, a hint plus an action out (or null if it isn't a command). No side effects until run(). */
export function parseCommand(input: string, a: CommandActions): ParsedCommand | null {
  const text = input.trim()
  if (!text) return null
  const lower = text.toLowerCase()

  const power = POWER_WORDS[lower]
  if (power) return { hint: tr(POWER_HINT[power]), run: () => a.power(power) }

  const timerMatch = /^(?:focus|timer|start)(?:\s+(\d{1,3}))?$/.exec(lower)
  if (timerMatch) {
    const mins = timerMatch[1] ? Number(timerMatch[1]) : undefined
    return { hint: mins ? tr('Start a {0} min focus timer', mins) : tr('Start or resume the focus timer'), run: () => a.startTimer(mins) }
  }
  if (lower === 'pause' || lower === 'stop') return { hint: tr('Pause the focus timer'), run: a.pauseTimer }
  if (lower === 'reset') return { hint: tr('Reset the focus timer'), run: a.resetTimer }

  const todo = /^(?:todo|add)\s+(.+)$/i.exec(text)
  if (todo) return { hint: tr('Add to-do: {0}', todo[1]), run: () => a.addTodo(todo[1]) }

  const open = /^(?:open|launch|run)\s+(.+)$/i.exec(text)
  if (open) return { hint: tr('Open {0}', open[1]), run: () => a.openApp(open[1]) }

  if (lower === 'clear clipboard' || lower === 'clear clips') {
    return { hint: tr('Clear clipboard history (keeps pinned)'), run: a.clearClips }
  }

  const go = /^(?:go|tab)\s+(\w+)$/.exec(lower)
  if (go) return { hint: tr('Go to the {0} tab', go[1]), run: () => void a.goTab(go[1]) }

  return null
}
