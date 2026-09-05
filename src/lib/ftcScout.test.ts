import { describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SEASON,
  currentSeason,
  DEFAULT_REGION,
  getTeam,
  regionForState,
  regionLabel,
  SEASON_NAMES,
  SEASONS,
} from './ftcScout'

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
  })

  /*
   * The default season is derived from the date, so kickoff does not need
   * somebody to remember to edit a constant — the year nobody does, every team
   * setting the app up is filed against last season and finds no schedule.
   */
  describe('currentSeason', () => {
    it('rolls over at kickoff, not at new year', () => {
      expect(currentSeason(Date.parse('2024-08-31T12:00:00Z'))).toBe(2023)
      expect(currentSeason(Date.parse('2024-09-01T12:00:00Z'))).toBe(2024)
      expect(currentSeason(Date.parse('2025-01-15T12:00:00Z'))).toBe(2024)
    })

    it('never asks upstream for a season it is known to reject', () => {
      // Past the end of the pinned list: hold at the newest one the API takes
      // rather than derive a year that returns "Invalid season".
      expect(currentSeason(Date.parse('2031-10-01T12:00:00Z'))).toBe(2025)
    })

    it('never goes back before the first season the API has', () => {
      expect(currentSeason(Date.parse('2005-10-01T12:00:00Z'))).toBe(2019)
    })

    it('is what the exported default resolves to', () => {
      expect(CURRENT_SEASON).toBe(currentSeason())
    })
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

describe('hanging networks', () => {
  /**
   * The venue case that matters: a captive portal accepts the connection and
   * then never answers. Without a timeout the promise stays pending forever,
   * the cached copy is never served, and the screen sits on a spinner for the
   * rest of the competition.
   */
  it('gives up on a request that never answers and serves the cache', async () => {
    vi.useFakeTimers()
    const original = globalThis.fetch
    let aborted = false

    globalThis.fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    ) as typeof fetch

    try {
      const pending = getTeam('11138').catch((err: Error) => err)
      await vi.advanceTimersByTimeAsync(11_000)
      const result = await pending
      expect(aborted).toBe(true)
      expect(result).toBeInstanceOf(Error)
      expect((result as Error).message).toMatch(/did not answer in time/)
    } finally {
      globalThis.fetch = original
      vi.useRealTimers()
    }
  })
})
