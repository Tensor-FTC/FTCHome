import { describe, expect, it } from 'vitest'
import { hashPassword, passwordStrength, verifyPassword } from './crypto'

describe('password verifiers', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const verifier = await hashPassword('buildseason2026')
    await expect(verifyPassword('buildseason2026', verifier)).resolves.toBe(true)
    await expect(verifyPassword('buildseason2025', verifier)).resolves.toBe(false)
    await expect(verifyPassword('', verifier)).resolves.toBe(false)
  })

  it('salts every credential, so identical passwords do not share a hash', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
    // …and each still verifies against its own salt.
    await expect(verifyPassword('same-password', a)).resolves.toBe(true)
    await expect(verifyPassword('same-password', b)).resolves.toBe(true)
  })

  it('never stores the password itself', async () => {
    const verifier = await hashPassword('plaintext-leak-check')
    expect(JSON.stringify(verifier)).not.toContain('plaintext-leak-check')
    expect(verifier.algo).toBe('PBKDF2-SHA256')
    expect(verifier.iterations).toBeGreaterThanOrEqual(210_000)
  })

  it('treats a missing verifier as a failed check rather than a pass', async () => {
    await expect(verifyPassword('anything', null)).resolves.toBe(false)
    await expect(verifyPassword('anything', undefined)).resolves.toBe(false)
  })

  it('rates password strength without blocking short-but-deliberate choices', () => {
    expect(passwordStrength('abc').score).toBe(0)
    expect(passwordStrength('buildteam1').score).toBeGreaterThanOrEqual(1)
    expect(passwordStrength('Robot-Eclipse-2026!').score).toBe(3)
  })
})
