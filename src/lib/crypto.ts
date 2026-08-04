import type { PasswordVerifier } from '@/domain/types'

/**
 * Password verifiers for the local-first account model.
 *
 * PBKDF2-SHA256 via WebCrypto, 210 000 iterations (OWASP 2023 guidance for
 * PBKDF2-HMAC-SHA256), random 16-byte salt per credential.
 *
 * Scope, stated plainly: this protects credentials *at rest on the device* and
 * in the synced row. Verification happens in the browser, so it is a lock on
 * the data, not a server-side authentication boundary — anyone with write
 * access to the local database could replace a verifier. That is the correct
 * trade for an app whose hard requirement is working with no signal, and it is
 * why Supabase row-level security keys on the team credential as well. See
 * README → "Security model".
 */
const ITERATIONS = 210_000
const KEY_LEN = 32

function subtle(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('WebCrypto unavailable — FTC Home needs a secure context (https or localhost).')
  }
  return crypto.subtle
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_LEN * 8,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<PasswordVerifier> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, ITERATIONS)
  return {
    algo: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: toBase64(salt),
    hash: toBase64(hash),
  }
}

export async function verifyPassword(
  password: string,
  verifier: PasswordVerifier | null | undefined,
): Promise<boolean> {
  if (!verifier) return false
  const derived = await derive(password, fromBase64(verifier.salt), verifier.iterations)
  return timingSafeEqual(derived, fromBase64(verifier.hash))
}

/** Constant-time compare, so a wrong password does not leak its prefix length. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Rough strength signal for the set-password field. Not a gate. */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  const len = password.length
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(password)).length
  if (len < 8) return { score: 0, label: 'Too short — 8 characters minimum' }
  if (len >= 12 && classes >= 3) return { score: 3, label: 'Strong' }
  if (len >= 10 && classes >= 2) return { score: 2, label: 'Good' }
  return { score: 1, label: 'Weak — add length or a number' }
}
