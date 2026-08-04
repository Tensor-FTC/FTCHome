import { describe, expect, it } from 'vitest'
import {
  calendarFromScout,
  emptySeason,
  isConfigured,
  mergeScoutEvents,
  migrateSeason,
  teamFromScout,
} from './season'
import { SCOUT_TEAM_11138 } from '@/test/fixtures'
import type { ScoutEvent, TeamParticipation } from '@/lib/ftcScout'
import type { CalendarEvent } from './types'

/**
 * These pin the rule the whole rewrite exists to enforce: factual data comes
 * from FTCScout, and the app never authors it.
 */
describe('season construction', () => {
  it('starts with nothing invented', () => {
    const season = emptySeason()
    expect(season.team.number).toBe('')
    expect(season.team.syncedAt).toBeNull()
    expect(isConfigured(season)).toBe(false)
    // Critically: no fabricated roster, sponsors, tasks or events.
    expect(season.members).toHaveLength(0)
    expect(season.events).toHaveLength(0)
    expect(season.sponsors).toHaveLength(0)
    expect(season.tasks).toHaveLength(0)
    expect(season.allocations).toHaveLength(0)
    expect(season.competition.source).toBe('none')
    // No bundled parts catalogue either — vendor prices go stale within a season.
    expect(season.parts).toHaveLength(0)
  })

  it('migrates a season saved before a field existed instead of resetting it', () => {
    const stored = {
      team: { number: '11138', name: 'Robo Eclipse', syncedAt: '2026-01-01T00:00:00.000Z' },
      members: [{ id: 'm1', updatedAt: '', name: 'Someone', role: 'coach' }],
    } as never

    const migrated = migrateSeason(stored)
    // The roster survives …
    expect(migrated.members).toHaveLength(1)
    expect(migrated.team.number).toBe('11138')
    // … and newly added collections are present rather than undefined.
    expect(migrated.parts).toEqual([])
    expect(migrated.scouting).toEqual([])
    expect(migrated.settings.season).toBeGreaterThan(2018)
  })

  it('migrates an absent season to a clean empty one', () => {
    expect(migrateSeason(undefined).members).toHaveLength(0)
  })

  it('takes team identity verbatim from FTCScout', () => {
    const team = teamFromScout(SCOUT_TEAM_11138, emptySeason().team)
    expect(team.number).toBe('11138')
    expect(team.name).toBe('Robo Eclipse')
    expect(team.city).toBe('Bellevue')
    expect(team.state).toBe('WA')
    expect(team.country).toBe('USA')
    expect(team.rookieYear).toBe(2016)
    expect(team.registeredSponsors).toEqual(['Microsoft Corp', 'Boeing Company'])
    expect(isConfigured({ ...emptySeason(), team })).toBe(true)
  })

  it('derives the region from the team’s home state, not a default', () => {
    expect(teamFromScout(SCOUT_TEAM_11138, emptySeason().team).region).toBe('USWA')
    const ontario = teamFromScout({ ...SCOUT_TEAM_11138, country: 'Canada', state: 'ON' }, emptySeason().team)
    expect(ontario.region).toBe('CAON')
  })

  it('falls back to the US default when a state is unknown or missing', () => {
    const team = teamFromScout({ ...SCOUT_TEAM_11138, state: '' }, emptySeason().team)
    expect(team.region).toBe('UnitedStates')
  })

  it('preserves local-only fields across a refresh', () => {
    const first = teamFromScout(SCOUT_TEAM_11138, emptySeason().team)
    first.goal = 9200
    first.code = { algo: 'PBKDF2-SHA256', iterations: 1, salt: 's', hash: 'h' }

    const refreshed = teamFromScout({ ...SCOUT_TEAM_11138, city: 'Redmond' }, first)
    expect(refreshed.city).toBe('Redmond')
    // The team's own decisions survive an identity refresh.
    expect(refreshed.goal).toBe(9200)
    expect(refreshed.code).not.toBeNull()
  })
})

const scoutEvent = (code: string, name: string, start: string): ScoutEvent => ({
  season: 2025,
  code,
  name,
  type: 'Qualifier',
  regionCode: 'USWA',
  venue: 'Cedarcrest High School',
  address: null,
  country: 'USA',
  state: 'WA',
  city: 'Duvall',
  website: null,
  timezone: 'America/Los_Angeles',
  start,
  end: start,
})

describe('calendar from FTCScout', () => {
  it('turns registered events into competition entries with real venues', () => {
    const events = calendarFromScout([scoutEvent('USWABAM1', 'Bardeen League Meet 1', '2025-11-02')], [])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      title: 'Bardeen League Meet 1',
      date: '2025-11-02',
      type: 'comp',
      source: 'ftc-scout',
      eventCode: 'USWABAM1',
    })
    expect(events[0].location).toContain('Cedarcrest High School')
    expect(events[0].location).toContain('Duvall, WA')
  })

  it('records a finished result when the team has stats for the event', () => {
    const participation: TeamParticipation = {
      season: 2025,
      eventCode: 'USWABAM1',
      teamNumber: 11138,
      stats: { rank: 2, rp: 1.6, wins: 5, losses: 1, ties: 0, qualMatchesPlayed: 6 },
    }
    const [event] = calendarFromScout([scoutEvent('USWABAM1', 'Bardeen', '2025-11-02')], [participation])
    expect(event.notes).toContain('rank 2')
    expect(event.notes).toContain('5-1-0')
  })

  it('gives an event a stable id, so refreshing updates rather than duplicates', () => {
    const a = calendarFromScout([scoutEvent('USWABAM1', 'Bardeen', '2025-11-02')], [])
    const b = calendarFromScout([scoutEvent('USWABAM1', 'Bardeen renamed', '2025-11-02')], [])
    expect(a[0].id).toBe(b[0].id)
  })
})

describe('mergeScoutEvents', () => {
  const local: CalendarEvent = {
    id: 'local-1',
    updatedAt: '2025-01-01T00:00:00.000Z',
    title: 'Build session',
    date: '2025-11-01',
    time: '10:00',
    type: 'meet',
    source: 'local',
  }

  it('never destroys a locally-created entry', () => {
    const incoming = calendarFromScout([scoutEvent('USWABAM1', 'Bardeen', '2025-11-02')], [])
    const merged = mergeScoutEvents([local], incoming)
    expect(merged.find((e) => e.id === 'local-1')).toBeDefined()
    expect(merged).toHaveLength(2)
  })

  it('replaces previous FTCScout entries instead of accumulating them', () => {
    const first = calendarFromScout([scoutEvent('A', 'Old name', '2025-11-02')], [])
    const second = calendarFromScout([scoutEvent('A', 'New name', '2025-11-02')], [])
    const merged = mergeScoutEvents(mergeScoutEvents([local], first), second)
    const comps = merged.filter((e) => e.source === 'ftc-scout')
    expect(comps).toHaveLength(1)
    expect(comps[0].title).toBe('New name')
  })

  it('returns the calendar in date order', () => {
    const incoming = calendarFromScout(
      [scoutEvent('B', 'Later', '2025-12-01'), scoutEvent('A', 'Earlier', '2025-10-01')],
      [],
    )
    const merged = mergeScoutEvents([local], incoming)
    const dates = merged.map((e) => e.date)
    expect(dates).toEqual([...dates].sort())
  })
})
