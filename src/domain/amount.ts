/**
 * Parsing what somebody typed into a money or quantity box.
 *
 * The old shape was `Number(raw.replace(/[^0-9.]/g, ''))` followed by
 * `if (!amount) return`. Typing "two hundred" stripped to "" , became `NaN`,
 * and the form did nothing at all — no error, no entry, no clue. A button that
 * silently declines to work is worse than one that refuses out loud, because
 * the only thing left to try is pressing it again.
 *
 * So stripping and validating are separated. Formatting noise people really do
 * type — `$`, thousands commas, trailing spaces — is forgiven, because
 * rejecting "$1,200" would be pedantry. Anything that is not a number is
 * reported rather than swallowed.
 */

export interface ParsedAmount {
  ok: boolean
  /** Only meaningful when `ok`. */
  value: number
  /** Present when not `ok`. Written to be shown directly under the field. */
  error?: string
}

/** Currency symbols, thousands separators and whitespace are noise, not input. */
const NOISE = /[\s,$£€]/g

export interface AmountOptions {
  /** Reject fractions — "three and a half rolls of filament" is not a thing. */
  integer?: boolean
  /** Allow zero. Off by default: a £0 sponsor is a mistake, 0 in stock is not. */
  allowZero?: boolean
  /** What the field is called, so the message can name it. */
  label?: string
}

export function parseAmount(raw: string, options: AmountOptions = {}): ParsedAmount {
  const { integer = false, allowZero = false, label = 'amount' } = options
  const cleaned = raw.replace(NOISE, '')

  if (!cleaned) return { ok: false, value: 0, error: `Enter an ${label}` }

  // Deliberately stricter than Number(): that accepts "0x1f", "1e5" and
  // whitespace-only strings, none of which anybody means to type into a
  // money box.
  if (!/^-?\d*\.?\d*$/.test(cleaned)) {
    return { ok: false, value: 0, error: `Use numbers only — "${raw.trim()}" is not an ${label}` }
  }

  const value = Number(cleaned)
  if (!Number.isFinite(value)) return { ok: false, value: 0, error: `That is not an ${label}` }
  if (value < 0) return { ok: false, value: 0, error: `An ${label} cannot be negative` }
  if (!allowZero && value === 0) return { ok: false, value: 0, error: `Enter more than zero` }
  if (integer && !Number.isInteger(value)) return { ok: false, value: 0, error: 'Use a whole number' }

  return { ok: true, value }
}

/**
 * The common case: parse, and get either a number or a message.
 *
 * Exists so a form can stay a one-liner rather than unpacking the object every
 * time, which is what made the original code skip the check.
 */
export function amountError(raw: string, options?: AmountOptions): string | undefined {
  return parseAmount(raw, options).error
}
