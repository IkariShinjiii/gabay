import { FIL } from './fil'

// Gabay's own text, in English or Filipino. The English sentence is the key, so a missing translation simply shows
// the English text. {0}, {1} in a sentence are filled from the extra arguments.
export type Language = 'en' | 'fil'

let current: Language = 'en'

export function setLanguage(l: Language): void {
  current = l
  if (typeof document !== 'undefined') document.documentElement.lang = l === 'fil' ? 'fil' : 'en'
}

/** Locale for day and month names: Filipino when Gabay is in Filipino, else the PC's own. */
export function dateLocale(): string | undefined {
  return current === 'fil' ? 'fil-PH' : undefined
}

export function tr(text: string, ...args: (string | number)[]): string {
  let out = current === 'fil' ? (FIL[text] ?? text) : text
  for (let i = 0; i < args.length; i++) out = out.split(`{${i}}`).join(String(args[i]))
  return out
}
