import type { Member, Rsvp, SeasonData } from './types'
import { isStaff } from './permissions'

/**
 * Who is actually responsible for this team.
 *
 * FTC teams do not come in one shape. Some have one coach, some have three and
 * no single "head", some run on mentors with a parent nominally listed, and
 * plenty lose their coach mid-season. The app therefore never assumes a *the*
 * coach — it asks how many people can carry the coach's responsibilities and
 * says so plainly when the answer is a problem.
 */

export function coaches(members: Member[]): Member[] {
  return members.filter((m) => m.role === 'coach')
}

/** Everyone who can approve spending, manage the roster and read contact records. */
export function staff(members: Member[]): Member[] {
  return members.filter((m) => isStaff(m.role))
}

/**
 * Whether removing or demoting this member would leave nobody in charge.
 *
 * Guards the roster, so a team cannot lock itself out of its own approvals by
 * tidying up. Mentors count: a team run by two mentors and no coach is a real
 * team, not a broken one.
 */
export function isLastStaff(members: Member[], memberId: string): boolean {
  const remaining = staff(members).filter((m) => m.id !== memberId)
  return remaining.length === 0
}

export type StaffingSeverity = 'blocking' | 'advisory'

export interface StaffingIssue {
  id: string
  severity: StaffingSeverity
  title: string
  detail: string
}

/**
 * What is wrong with how this team is staffed, worst first.
 *
 * Advisory issues are the ones worth knowing before a competition rather than
 * during one — a single point of failure is not an error, but nobody wants to
 * discover it at 7am in a car park.
 */
export function staffingIssues(season: SeasonData): StaffingIssue[] {
  const issues: StaffingIssue[] = []
  const allStaff = staff(season.members)
  const allCoaches = coaches(season.members)

  if (allStaff.length === 0) {
    issues.push({
      id: 'no-staff',
      severity: 'blocking',
      title: 'Nobody can approve spending or manage the roster',
      detail:
        'This team has no coach and no mentor. Give someone the coach or mentor role, or purchases and roster changes have nowhere to go.',
    })
  } else if (allCoaches.length === 0) {
    issues.push({
      id: 'no-coach',
      severity: 'advisory',
      title: 'No coach listed',
      detail: `${allStaff.map((m) => m.name).join(' and ')} ${allStaff.length === 1 ? 'is' : 'are'} carrying the coach's responsibilities as ${allStaff.length === 1 ? 'a mentor' : 'mentors'}. That works — FIRST just needs a coach of record on the team's registration.`,
    })
  } else if (allStaff.length === 1) {
    issues.push({
      id: 'single-staff',
      severity: 'advisory',
      title: `${allStaff[0].name} is the only adult on this team`,
      detail:
        'Nothing can be approved when they are unavailable. Adding a second coach or mentor removes the single point of failure.',
    })
  }

  const unclaimed = allStaff.filter((m) => m.status === 'invited')
  if (unclaimed.length && unclaimed.length === allStaff.length) {
    issues.push({
      id: 'staff-unclaimed',
      severity: 'advisory',
      title: 'No adult has signed in yet',
      detail: `${unclaimed.map((m) => m.name).join(', ')} still ${unclaimed.length === 1 ? 'has' : 'have'} an unclaimed invite. They set their own password the first time they sign in.`,
    })
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'blocking' ? -1 : 1))
}

/**
 * Whether an event is left without an adult.
 *
 * Answered from RSVPs rather than assumed: a team with three coaches where all
 * three said no is in the same position as a team with none.
 */
export function eventStaffing(
  season: SeasonData,
  rsvpKey: string,
): { total: number; declined: number; uncovered: boolean } {
  const allStaff = staff(season.members)
  const declined = allStaff.filter((m) =>
    season.rsvps.some((r: Rsvp) => r.eventId === rsvpKey && r.memberId === m.id && r.status === 'cant'),
  ).length
  return { total: allStaff.length, declined, uncovered: allStaff.length > 0 && declined === allStaff.length }
}
