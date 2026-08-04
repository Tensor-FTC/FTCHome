import { uid, now } from '@/lib/id'
import {
  CURRENT_SEASON,
  DEFAULT_REGION,
  regionForState,
  type QuickStats,
  type ScoutEvent,
  type ScoutTeam,
  type TeamParticipation,
} from '@/lib/ftcScout'
import type { CalendarEvent, CompetitionEvent, SeasonData, Settings, Team, TeamSeasonStats } from './types'

/**
 * Season construction.
 *
 * The rule this file exists to enforce: **nothing factual is authored here.**
 * Team identity, competition dates, venues, rankings and results all come from
 * FTCScout. What the app creates locally is only what no API can know — the
 * roster, tasks, budget, media and weekly write-ups a team enters itself, all of
 * which start genuinely empty rather than pre-filled with invented examples.
 */

export function emptySettings(): Settings {
  return {
    alliance: 'red',
    matchSeconds: 138,
    matchLabel: '',
    matchField: '1',
    partner: '',
    opponents: [],
    notificationsEnabled: false,
    notifyLeadSeconds: 300,
    season: CURRENT_SEASON,
    region: DEFAULT_REGION,
    eventCode: '',
    simulateOffline: false,
    lastSyncAt: null,
    lastScoutSyncAt: null,
  }
}

/** A team that has not been looked up yet. `syncedAt === null` means unconfigured. */
export function emptyTeam(): Team {
  return {
    id: 'team',
    updatedAt: now(),
    number: '',
    name: '',
    schoolName: '',
    city: '',
    state: '',
    country: '',
    rookieYear: 0,
    website: null,
    registeredSponsors: [],
    region: DEFAULT_REGION,
    seasonStats: null,
    syncedAt: null,
    code: null,
    goal: 0,
  }
}

export function emptyCompetition(): CompetitionEvent {
  return {
    id: 'competition',
    updatedAt: now(),
    code: '',
    name: '',
    venue: '',
    city: '',
    state: '',
    date: '',
    endDate: '',
    ongoing: false,
    finished: false,
    matches: [],
    rankings: [],
    source: 'none',
  }
}

/**
 * The starting state of the app: no team, no data, nothing invented. The launch
 * flow routes into team lookup, which is where real data enters.
 */
export function emptySeason(): SeasonData {
  return {
    team: emptyTeam(),
    members: [],
    events: [],
    rsvps: [],
    tasks: [],
    sponsors: [],
    allocations: [],
    approvals: [],
    media: [],
    weekly: [],
    scouting: [],
    competition: emptyCompetition(),
    parts: [],
    settings: emptySettings(),
  }
}

/**
 * Fills in fields added after a season was first saved, so an existing device
 * upgrades instead of crashing on a missing array.
 */
export function migrateSeason(stored: Partial<SeasonData> | undefined): SeasonData {
  const base = emptySeason()
  if (!stored) return base
  return {
    ...base,
    ...stored,
    team: { ...base.team, ...stored.team },
    settings: { ...base.settings, ...stored.settings },
    competition: { ...base.competition, ...stored.competition },
    members: stored.members ?? [],
    events: stored.events ?? [],
    rsvps: stored.rsvps ?? [],
    tasks: stored.tasks ?? [],
    sponsors: stored.sponsors ?? [],
    allocations: stored.allocations ?? [],
    approvals: stored.approvals ?? [],
    media: stored.media ?? [],
    weekly: stored.weekly ?? [],
    scouting: stored.scouting ?? [],
    parts: stored.parts ?? [],
  }
}

export function isConfigured(season: SeasonData): boolean {
  return Boolean(season.team.number && season.team.syncedAt)
}

/** Maps an FTCScout team record onto our Team, preserving local-only fields. */
export function teamFromScout(scout: ScoutTeam, previous: Team): Team {
  return {
    ...previous,
    updatedAt: now(),
    number: String(scout.number),
    name: scout.name,
    schoolName: scout.schoolName ?? '',
    city: scout.city ?? '',
    state: scout.state ?? '',
    country: scout.country ?? '',
    rookieYear: scout.rookieYear ?? 0,
    website: scout.website ?? null,
    registeredSponsors: scout.sponsors ?? [],
    region: regionForState(scout.country, scout.state),
    syncedAt: now(),
  }
}

export function statsFromQuickStats(qs: QuickStats | null): TeamSeasonStats | null {
  if (!qs) return null
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    totalOpr: round(qs.tot.value),
    totalRank: qs.tot.rank,
    autoOpr: round(qs.auto.value),
    autoRank: qs.auto.rank,
    teleopOpr: round(qs.dc.value),
    endgameOpr: round(qs.eg.value),
    teamCount: qs.count,
  }
}

/** A stable id per event code, so repeated pulls update rather than duplicate. */
function eventIdFor(code: string): string {
  return `scout-${code}`
}

/**
 * Turns the team's registered events into calendar entries.
 *
 * These are marked so a later refresh can replace them without touching the
 * build sessions and deadlines a team added by hand.
 */
export function calendarFromScout(events: ScoutEvent[], participations: TeamParticipation[]): CalendarEvent[] {
  const played = new Map(participations.map((p) => [p.eventCode, p.stats]))

  return events.map((event) => {
    const stats = played.get(event.code)
    const place = [event.venue, [event.city, event.state].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(' · ')
    const record = stats
      ? `Finished rank ${stats.rank} · ${stats.wins}-${stats.losses}-${stats.ties}`
      : undefined

    return {
      id: eventIdFor(event.code),
      updatedAt: now(),
      title: event.name,
      date: event.start,
      time: '—',
      type: 'comp' as const,
      location: place || undefined,
      notes: [record, `FTCScout event code ${event.code}`].filter(Boolean).join(' · '),
      source: 'ftc-scout' as const,
      eventCode: event.code,
    }
  })
}

/**
 * Merge freshly pulled competitions into the calendar, replacing previous
 * FTCScout entries and leaving locally-created ones alone.
 */
export function mergeScoutEvents(existing: CalendarEvent[], incoming: CalendarEvent[]): CalendarEvent[] {
  const local = existing.filter((e) => e.source !== 'ftc-scout')
  return [...local, ...incoming].sort((a, b) => a.date.localeCompare(b.date))
}

/** The team's next competition from the calendar, or the most recent if none ahead. */
export function nextCompetition(season: SeasonData, today: string): CalendarEvent | undefined {
  const comps = season.events.filter((e) => e.type === 'comp').sort((a, b) => a.date.localeCompare(b.date))
  return comps.find((e) => e.date >= today) ?? comps.at(-1)
}

/** Fresh local records a coach creates when registering. */
export function coachMember(name: string, teamNumber: string) {
  return {
    id: uid('mem-'),
    updatedAt: now(),
    name,
    role: 'coach' as const,
    username: `${name.toLowerCase().replace(/[^a-z]/g, '')}@${teamNumber}`,
    password: null,
    pending: false,
    joinedAt: now(),
  }
}
