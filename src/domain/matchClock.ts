import type { Alliance, Match, SeasonData } from './types'

/**
 * The match countdown, derived from real data.
 *
 * The prototype had a demo clock that looped 138 → 0 forever, which meant a team
 * with no event scheduled would eventually be told "GO TO FIELD 1 NOW". A
 * countdown is only honest when there is a match to count down to, so this
 * returns null the rest of the time and the UI renders nothing.
 */

/** How far ahead a match has to be before a countdown stops being useful. */
const HORIZON_MS = 3 * 60 * 60 * 1000

/** How long after the scheduled start we keep showing it before giving up. */
const GRACE_MS = 20 * 60 * 1000

export interface MatchClock {
  match: Match
  /** Seconds until the scheduled start. Negative once it is overdue. */
  secondsUntil: number
  /** Which side of the field we are on for this match. */
  alliance: Alliance
  partner: string
  opponents: string[]
  /** Past its scheduled time but inside the grace window — queue now. */
  overdue: boolean
  /** Under a minute: the one place the app is allowed to be loud. */
  urgent: boolean
}

/**
 * Our next unplayed match at the loaded event, if it is close enough to matter.
 *
 * Returns null when: no event is loaded, we are not in the schedule, every match
 * has been played, the schedule carries no start times, the next match is more
 * than three hours out, or it is long overdue.
 */
export function matchClock(season: SeasonData, nowMs: number): MatchClock | null {
  const comp = season.competition
  if (comp.source !== 'ftc-scout' || comp.matches.length === 0) return null

  const us = season.team.number
  if (!us) return null

  const ours = comp.matches
    .filter((m) => !m.played && [...m.red, ...m.blue].includes(us) && m.startsAt)
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''))

  // Prefer the first match still ahead of us; otherwise the most recent one that
  // is only just overdue, since that is the one you are being called for.
  const upcoming = ours.find((m) => new Date(m.startsAt!).getTime() > nowMs)
  const justPassed = [...ours]
    .reverse()
    .find((m) => nowMs - new Date(m.startsAt!).getTime() <= GRACE_MS)
  const match = upcoming ?? justPassed
  if (!match?.startsAt) return null

  const deltaMs = new Date(match.startsAt).getTime() - nowMs
  if (deltaMs > HORIZON_MS) return null
  if (deltaMs < -GRACE_MS) return null

  const weAreRed = match.red.includes(us)
  const secondsUntil = Math.round(deltaMs / 1000)

  return {
    match,
    secondsUntil,
    alliance: weAreRed ? 'red' : 'blue',
    partner: (weAreRed ? match.red : match.blue).filter((t) => t !== us && t !== '—')[0] ?? '',
    opponents: (weAreRed ? match.blue : match.red).filter((t) => t !== '—'),
    overdue: secondsUntil <= 0,
    urgent: secondsUntil <= 60,
  }
}

/** Alliance to theme Competition Mode with: the real one if known, else the preference. */
export function effectiveAlliance(season: SeasonData, clock: MatchClock | null): Alliance {
  return clock?.alliance ?? season.settings.alliance
}
