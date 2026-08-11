import type { Accent, ThemeMode } from '@/domain/types'

/**
 * Theme and accent, stored per device.
 *
 * Deliberately *not* part of the season. The season syncs, and a coach picking
 * light on their laptop would otherwise flip every student's phone to light at
 * the next pull. The same person wants dark on a pit laptop at 9pm and light on
 * a phone in a bright room, and that is one person, not a disagreement.
 *
 * Written to localStorage rather than IndexedDB because it has to be applied
 * before the first paint. An async read means a dark frame on a light theme,
 * which is the flash every themed app is judged on.
 */

const THEME_KEY = 'ftc-home.theme'
const ACCENT_KEY = 'ftc-home.accent'

const THEMES: ThemeMode[] = ['system', 'dark', 'light']
const ACCENTS: Accent[] = ['lime', 'cyan', 'blue', 'violet', 'amber', 'rose']

export function readTheme(): ThemeMode {
  const raw = safeRead(THEME_KEY)
  return THEMES.includes(raw as ThemeMode) ? (raw as ThemeMode) : 'system'
}

export function readAccent(): Accent {
  const raw = safeRead(ACCENT_KEY)
  return ACCENTS.includes(raw as Accent) ? (raw as Accent) : 'lime'
}

export function writeTheme(mode: ThemeMode): void {
  safeWrite(THEME_KEY, mode)
  apply()
}

export function writeAccent(accent: Accent): void {
  safeWrite(ACCENT_KEY, accent)
  apply()
}

/** What `system` currently resolves to. */
export function resolvedTheme(mode: ThemeMode = readTheme()): 'dark' | 'light' {
  if (mode !== 'system') return mode
  if (typeof globalThis.matchMedia !== 'function') return 'dark'
  return globalThis.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Push the current choice onto <html>.
 *
 * `color-scheme` is set alongside the attribute so the browser themes what CSS
 * cannot reach — scrollbars, form controls, the address bar on mobile. Without
 * it a light theme keeps dark scrollbars and looks broken in exactly the way
 * nobody can point at.
 */
export function apply(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const theme = resolvedTheme()
  root.dataset.theme = theme
  root.dataset.accent = readAccent()
  root.style.colorScheme = theme
}

/**
 * Follow the device while the choice is `system`.
 *
 * Returns an unsubscribe. Kept as a subscription rather than a one-off read
 * because phones switch at sunset with the app open.
 */
export function watchSystemTheme(): () => void {
  if (typeof globalThis.matchMedia !== 'function') return () => {}
  const query = globalThis.matchMedia('(prefers-color-scheme: light)')
  const onChange = () => {
    if (readTheme() === 'system') apply()
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // Private mode, or storage disabled. The default is a fine answer.
    return null
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Preference not persisting is not worth breaking a click over. */
  }
}
