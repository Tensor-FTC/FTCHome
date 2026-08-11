import { afterEach, describe, expect, it, vi } from 'vitest'
import { inferRegion } from './geo'

/**
 * The rule under test is "never assert a state we are not sure of". A
 * confidently wrong region is worse than an unset one: the person reads the
 * wrong registration deadlines and has no reason to double-check.
 */
function withZone(timeZone: string, language = 'en-US') {
  const real = Intl.DateTimeFormat
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
    (...args: ConstructorParameters<typeof Intl.DateTimeFormat>) => {
      const fmt = new real(...args)
      vi.spyOn(fmt, 'resolvedOptions').mockReturnValue({
        ...fmt.resolvedOptions(),
        timeZone,
      })
      return fmt
    },
  )
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language)
}

afterEach(() => vi.restoreAllMocks())

describe('inferRegion', () => {
  it('names the state when the timezone identifies exactly one', () => {
    withZone('America/Phoenix')
    expect(inferRegion()).toEqual({ region: 'USAZ', confidence: 'exact' })
  })

  it('handles a Canadian province', () => {
    withZone('America/Toronto', 'en-CA')
    expect(inferRegion()).toEqual({ region: 'CAON', confidence: 'exact' })
  })

  it('refuses to guess a state when the timezone covers many', () => {
    withZone('America/New_York')
    const guess = inferRegion()
    expect(guess.region).toBe('UnitedStates')
    expect(guess.confidence).toBe('country')
  })

  it('does the same for the other shared US zones', () => {
    for (const zone of ['America/Chicago', 'America/Denver', 'America/Los_Angeles']) {
      withZone(zone)
      expect(inferRegion().region).toBe('UnitedStates')
      vi.restoreAllMocks()
    }
  })

  it('uses the country when the zone is ambiguous but the locale is not', () => {
    withZone('Europe/Zurich', 'de-DE')
    expect(inferRegion()).toEqual({ region: 'DE', confidence: 'country' })
  })

  it('falls back to the plain default on an unknown zone', () => {
    withZone('Antarctica/Troll', 'xx')
    expect(inferRegion().confidence).toBe('none')
  })
})
