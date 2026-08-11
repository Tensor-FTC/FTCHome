import { describe, expect, it } from 'vitest'
import { parseAmount } from './amount'

/**
 * The failure these lock in: a form that silently does nothing. Every case
 * below used to return `NaN` or `0` and be discarded by `if (!amount) return`,
 * so the assertions are as much about `error` being set as about the value.
 */
describe('parseAmount', () => {
  it('accepts plain numbers', () => {
    expect(parseAmount('250')).toMatchObject({ ok: true, value: 250 })
    expect(parseAmount('12.50')).toMatchObject({ ok: true, value: 12.5 })
  })

  it('forgives the formatting people actually type', () => {
    expect(parseAmount('$1,200')).toMatchObject({ ok: true, value: 1200 })
    expect(parseAmount('  750 ')).toMatchObject({ ok: true, value: 750 })
  })

  it('reports letters instead of swallowing them', () => {
    const r = parseAmount('two hundred')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/numbers only/i)
  })

  it('reports a partly-numeric string rather than silently taking the digits', () => {
    // "12abc" used to strip to 12 and be accepted, which is worse than an
    // error: it books a number nobody typed.
    expect(parseAmount('12abc').ok).toBe(false)
  })

  it('rejects the values Number() would wrongly accept', () => {
    expect(parseAmount('0x1f').ok).toBe(false)
    expect(parseAmount('1e5').ok).toBe(false)
  })

  it('requires something to be entered', () => {
    expect(parseAmount('').error).toMatch(/enter an/i)
    expect(parseAmount('   ').error).toMatch(/enter an/i)
  })

  it('rejects zero and negatives by default, and zero on request', () => {
    expect(parseAmount('0').ok).toBe(false)
    expect(parseAmount('-5').ok).toBe(false)
    expect(parseAmount('0', { allowZero: true })).toMatchObject({ ok: true, value: 0 })
  })

  it('enforces whole numbers when asked', () => {
    expect(parseAmount('2.5', { integer: true }).error).toMatch(/whole number/i)
    expect(parseAmount('3', { integer: true }).ok).toBe(true)
  })
})
