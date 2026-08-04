import { describe, expect, it } from 'vitest'
import { effectiveAlliance, matchClock } from './matchClock'
import { emptySeason } from './season'
import { fixtureSeason } from '@/test/fixtures'
import type { Match, SeasonData } from './types'

const NOW = Date.parse('2026-01-10T12:00:00.000Z')
const at = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000).toISOString()

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'Quals-0-42',
    label: 'Q42',
    field: '2',
    time: '12:05',
    startsAt: at(5),
    red: ['11138', '14672'],
    blue: ['9021', '7737'],
    played: false,
    ...overrides,
  }
}

function withMatches(matches: Match[]): SeasonData {
  const season = fixtureSeason('2026-01-10')
  season.competition = {
    ...season.competition,
    id: 'competition',
    updatedAt: '',
    code: 'USWABAM1',
    name: 'Test Event',
    source: 'ftc-scout',
    matches,
    rankings: [],
  }
  return season
}

/**
 * The bug this file exists to prevent: the prototype's demo clock looped 138 → 0
 * forever, so a team with no event was eventually told "GO TO FIELD 1 NOW".
 */
describe('matchClock', () => {
  it('returns nothing when no event is loaded', () => {
    expect(matchClock(emptySeason(), NOW)).toBeNull()
    expect(matchClock(fixtureSeason('2026-01-10'), NOW)).toBeNull()
  })

  it('returns nothing when every match has been played', () => {
    const season = withMatches([match({ played: true, startsAt: at(-120) })])
    expect(matchClock(season, NOW)).toBeNull()
  })

  it('returns nothing when we are not in the schedule', () => {
    const season = withMatches([match({ red: ['1', '2'], blue: ['3', '4'] })])
    expect(matchClock(season, NOW)).toBeNull()
  })

  it('returns nothing when the schedule carries no start times', () => {
    const season = withMatches([match({ startsAt: undefined })])
    expect(matchClock(season, NOW)).toBeNull()
  })

  it('returns nothing for a match further out than the horizon', () => {
    // Four hours away: real, but not something to stare at a countdown for.
    const season = withMatches([match({ startsAt: at(4 * 60) })])
    expect(matchClock(season, NOW)).toBeNull()
  })

  it('returns nothing once a match is long past', () => {
    const season = withMatches([match({ startsAt: at(-45) })])
    expect(matchClock(season, NOW)).toBeNull()
  })

  it('counts down to the next match inside the horizon', () => {
    const season = withMatches([match({ startsAt: at(5) })])
    const clock = matchClock(season, NOW)
    expect(clock?.secondsUntil).toBe(300)
    expect(clock?.urgent).toBe(false)
    expect(clock?.overdue).toBe(false)
    expect(clock?.match.label).toBe('Q42')
  })

  it('goes urgent only inside the final minute', () => {
    expect(matchClock(withMatches([match({ startsAt: at(2) })]), NOW)?.urgent).toBe(false)
    expect(matchClock(withMatches([match({ startsAt: at(0.5) })]), NOW)?.urgent).toBe(true)
  })

  it('stays visible briefly after the scheduled time, because that is when you are called', () => {
    const clock = matchClock(withMatches([match({ startsAt: at(-3) })]), NOW)
    expect(clock).not.toBeNull()
    expect(clock?.overdue).toBe(true)
    expect(clock?.urgent).toBe(true)
    expect(clock?.secondsUntil).toBeLessThan(0)
  })

  it('picks the soonest upcoming match, not the first in the array', () => {
    const season = withMatches([
      match({ id: 'later', label: 'Q80', startsAt: at(90) }),
      match({ id: 'sooner', label: 'Q50', startsAt: at(10) }),
    ])
    expect(matchClock(season, NOW)?.match.label).toBe('Q50')
  })

  it('skips played matches when choosing the next one', () => {
    const season = withMatches([
      match({ id: 'done', label: 'Q10', startsAt: at(-10), played: true }),
      match({ id: 'next', label: 'Q42', startsAt: at(20) }),
    ])
    expect(matchClock(season, NOW)?.match.label).toBe('Q42')
  })

  it('derives the alliance and line-up from the match, not from settings', () => {
    const red = matchClock(withMatches([match()]), NOW)
    expect(red).toMatchObject({ alliance: 'red', partner: '14672' })
    expect(red?.opponents).toEqual(['9021', '7737'])

    const blue = matchClock(
      withMatches([match({ red: ['9021', '7737'], blue: ['11138', '14672'] })]),
      NOW,
    )
    expect(blue).toMatchObject({ alliance: 'blue', partner: '14672' })
    expect(blue?.opponents).toEqual(['9021', '7737'])
  })

  it('drops placeholder team numbers from the line-up', () => {
    const clock = matchClock(withMatches([match({ red: ['11138', '—'], blue: ['9021', '—'] })]), NOW)
    expect(clock?.partner).toBe('')
    expect(clock?.opponents).toEqual(['9021'])
  })
})

describe('effectiveAlliance', () => {
  it('uses the real alliance when a match is scheduled', () => {
    const season = withMatches([match({ red: ['9021', '7737'], blue: ['11138', '14672'] })])
    season.settings.alliance = 'red'
    expect(effectiveAlliance(season, matchClock(season, NOW))).toBe('blue')
  })

  it('falls back to the stored preference when nothing is scheduled', () => {
    const season = emptySeason()
    season.settings.alliance = 'blue'
    expect(effectiveAlliance(season, null)).toBe('blue')
  })
})
