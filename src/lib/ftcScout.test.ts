import { describe, expect, it } from 'vitest'
import { CURRENT_SEASON, DEFAULT_REGION, regionForState, regionLabel, SEASON_NAMES, SEASONS } from './ftcScout'

describe('FTCScout constants', () => {
  it('defaults to the United States', () => {
    // The overwhelming majority of FTC teams are US-based, and the previous
    // default of an Ontario region was simply wrong for most users.
    expect(DEFAULT_REGION).toBe('UnitedStates')
  })

  it('only lists seasons the upstream API accepts', () => {
    // Verified against ftc-scout `ALL_SEASONS`; 2026 returns "Invalid season".
    expect(SEASONS).toContain(2025)
    expect(SEASONS).not.toContain(2026)
    expect(SEASONS).not.toContain(2018)
    expect(CURRENT_SEASON).toBe(2025)
  })

  it('names every season it offers', () => {
    for (const season of SEASONS) expect(SEASON_NAMES[season]).toBeTruthy()
  })
})

describe('regionForState', () => {
  it('maps a US state to its FTCScout region code', () => {
    expect(regionForState('USA', 'WA')).toBe('USWA')
    expect(regionForState('USA', 'FL')).toBe('USFL')
  })

  it('maps Canadian provinces', () => {
    expect(regionForState('Canada', 'ON')).toBe('CAON')
    expect(regionForState('Canada', 'BC')).toBe('CABC')
  })

  it('uses the umbrella option for states split into sub-regions upstream', () => {
    // CA, NY and TX each have several region codes; picking one would guess
    // which half of the state a city is in.
    expect(regionForState('USA', 'CA')).toBe('USCA')
    expect(regionForState('USA', 'NY')).toBe('USNY')
    expect(regionForState('USA', 'TX')).toBe('USTX')
  })

  it('is case and whitespace tolerant', () => {
    expect(regionForState('USA', ' wa ')).toBe('USWA')
  })

  it('falls back to the default rather than guessing', () => {
    expect(regionForState('USA', undefined)).toBe('UnitedStates')
    expect(regionForState('Nowhere', 'ZZ')).toBe('UnitedStates')
  })
})

describe('regionLabel', () => {
  it('spells out the group options and passes codes through', () => {
    expect(regionLabel('UnitedStates')).toBe('United States')
    expect(regionLabel('International')).toBe('International')
    expect(regionLabel('USWA')).toBe('USWA')
  })
})
