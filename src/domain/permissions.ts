import type { Audience, Role, TeamPolicy } from './types'

/**
 * What a role may do.
 *
 * Two layers, on purpose:
 *
 *  1. **Structural** capabilities — who can edit the roster, decide a purchase,
 *     publish a week. These are fixed, because they are about authority rather
 *     than preference, and a student approving their own spending is not a
 *     setting anybody should be able to flip.
 *
 *  2. **Visibility** — who can *see* budget figures, purchase amounts and
 *     contact records. These default open and are configurable per team, since
 *     hiding the budget from the students raising the money is usually wrong,
 *     but some teams genuinely need it tighter.
 *
 * Withheld values are never sent to the DOM: a locked chip, not a hidden div.
 */

export type Capability =
  | 'roster.manage'
  | 'roster.readContact'
  | 'calendar.edit'
  | 'tasks.create'
  | 'tasks.assignOthers'
  | 'budget.viewAmounts'
  | 'budget.edit'
  | 'approvals.viewAmounts'
  | 'approvals.decide'
  | 'approvals.request'
  | 'media.upload'
  | 'media.delete'
  | 'weekly.edit'
  | 'weekly.publish'
  | 'scouting.edit'
  | 'settings.manage'
  | 'policy.manage'
  | 'season.export'

/** Fixed capabilities. Authority, not preference. */
const MATRIX: Record<Capability, Role[]> = {
  'roster.manage': ['coach', 'mentor'],
  'roster.readContact': ['coach', 'mentor'],
  'calendar.edit': ['coach', 'mentor', 'captain'],
  'tasks.create': ['coach', 'mentor', 'captain', 'student'],
  'tasks.assignOthers': ['coach', 'mentor', 'captain'],
  'budget.viewAmounts': ['coach', 'mentor', 'captain', 'student'],
  'budget.edit': ['coach', 'mentor'],
  'approvals.viewAmounts': ['coach', 'mentor'],
  'approvals.decide': ['coach', 'mentor'],
  'approvals.request': ['coach', 'mentor', 'captain', 'student'],
  'media.upload': ['coach', 'mentor', 'captain', 'student'],
  'media.delete': ['coach', 'mentor', 'captain'],
  'weekly.edit': ['coach', 'mentor', 'captain'],
  'weekly.publish': ['coach', 'mentor', 'captain'],
  // Everyone signed in scouts. A student in the stands with a phone is the
  // whole point of scouting notes.
  'scouting.edit': ['coach', 'mentor', 'captain', 'student'],
  'settings.manage': ['coach', 'mentor'],
  'policy.manage': ['coach', 'mentor'],
  'season.export': ['coach', 'mentor', 'captain'],
}

/** Capabilities whose audience the team can widen or narrow. */
const POLICY_DRIVEN: Partial<Record<Capability, keyof TeamPolicy>> = {
  'budget.viewAmounts': 'budgetFigures',
  'approvals.viewAmounts': 'purchaseAmounts',
  'roster.readContact': 'contactRecords',
  'roster.manage': 'rosterEditing',
  'calendar.edit': 'calendarEditing',
}

export const AUDIENCE_ROLES: Record<Audience, Role[]> = {
  everyone: ['coach', 'mentor', 'captain', 'student', 'parent', 'guest'],
  members: ['coach', 'mentor', 'captain', 'student'],
  staff: ['coach', 'mentor'],
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  everyone: 'Everyone, including parents',
  members: 'Signed-in team members',
  staff: 'Coaches and mentors only',
}

/**
 * Open by default. A team is a group of people building one robot; the person
 * who raised the sponsorship should be able to see the sponsorship.
 *
 * `contactRecords` is deliberately not open: it is minors' medical and guardian
 * data, and that is a safeguarding decision rather than a team preference.
 */
export const DEFAULT_POLICY: TeamPolicy = {
  budgetFigures: 'everyone',
  purchaseAmounts: 'members',
  contactRecords: 'staff',
  rosterEditing: 'staff',
  calendarEditing: 'members',
  archiveAfterDays: 30,
}

export function can(role: Role, capability: Capability, policy?: TeamPolicy): boolean {
  const key = POLICY_DRIVEN[capability]
  if (key && policy) {
    const audience = policy[key]
    // `archiveAfterDays` is a number and is never a capability key; the guard
    // keeps a malformed stored policy from silently granting everything.
    if (typeof audience === 'string') return AUDIENCE_ROLES[audience]?.includes(role) ?? false
  }
  return MATRIX[capability].includes(role)
}

/** Roles that count as staff for "coach tools on" affordances. */
export function isStaff(role: Role): boolean {
  return role === 'coach' || role === 'mentor'
}

/** The masked stand-in for a withheld value, sized like the real thing. */
export function maskedAmount(): string {
  return '$•••.••'
}
