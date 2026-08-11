import type { Audience, Member, Role, TeamPolicy } from './types'

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
 * On top of both, a coach can grant a capability to *one person* by name. Real
 * teams do not divide neatly by role — a trusted captain runs the budget, a
 * parent is the treasurer — and inventing a role for each arrangement is worse
 * than letting a coach say who specifically may do what.
 *
 * Withheld values are never sent to the DOM: a locked chip, not a hidden div.
 */

export type Capability =
  | 'roster.manage'
  | 'roster.readContact'
  | 'calendar.edit'
  | 'events.rsvp'
  | 'volunteer.signUp'
  | 'tasks.create'
  | 'tasks.assignOthers'
  | 'budget.viewAmounts'
  | 'budget.edit'
  | 'approvals.viewAmounts'
  | 'approvals.decide'
  | 'approvals.request'
  | 'members.approve'
  | 'members.grant'
  | 'chat.post'
  | 'chat.manageChannels'
  | 'chat.moderate'
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
  'calendar.edit': ['coach', 'mentor', 'captain', 'parent'],
  'events.rsvp': ['coach', 'mentor', 'captain', 'student', 'parent'],
  'volunteer.signUp': ['coach', 'mentor', 'captain', 'student', 'parent'],
  'tasks.create': ['coach', 'mentor', 'captain', 'student'],
  'tasks.assignOthers': ['coach', 'mentor', 'captain', 'parent'],
  'budget.viewAmounts': ['coach', 'mentor', 'captain', 'student'],
  'budget.edit': ['coach', 'mentor'],
  'approvals.viewAmounts': ['coach', 'mentor'],
  'approvals.decide': ['coach', 'mentor'],
  'approvals.request': ['coach', 'mentor', 'captain', 'student'],
  'members.approve': ['coach', 'mentor'],
  'members.grant': ['coach'],
  'chat.post': ['coach', 'mentor', 'captain', 'student', 'parent'],
  'chat.manageChannels': ['coach', 'mentor', 'captain'],
  'chat.moderate': ['coach', 'mentor'],
  'media.upload': ['coach', 'mentor', 'captain', 'student'],
  'media.delete': ['coach', 'mentor', 'captain', 'parent'],
  'weekly.edit': ['coach', 'mentor', 'captain', 'parent'],
  'weekly.publish': ['coach', 'mentor', 'captain'],
  // Everyone signed in scouts. A student in the stands with a phone is the
  // whole point of scouting notes.
  'scouting.edit': ['coach', 'mentor', 'captain', 'student'],
  'settings.manage': ['coach', 'mentor'],
  'policy.manage': ['coach', 'mentor'],
  'season.export': ['coach', 'mentor', 'captain', 'parent'],
}

/** Capabilities whose audience the team can widen or narrow. */
const POLICY_DRIVEN: Partial<Record<Capability, keyof TeamPolicy>> = {
  'budget.viewAmounts': 'budgetFigures',
  'approvals.viewAmounts': 'purchaseAmounts',
  'roster.readContact': 'contactRecords',
  'roster.manage': 'rosterEditing',
  'calendar.edit': 'calendarEditing',
}

/**
 * Capabilities a coach may hand to one person.
 *
 * Not everything is on this list. Granting `members.grant` would let a coach
 * create another coach in all but name, and granting `policy.manage` would let
 * a granted user re-grant themselves anything — both are how a delegation
 * system quietly becomes a privilege-escalation bug.
 */
export const GRANTABLE: Capability[] = [
  'approvals.decide',
  'approvals.viewAmounts',
  'budget.edit',
  'budget.viewAmounts',
  'roster.manage',
  'calendar.edit',
  'tasks.assignOthers',
  'weekly.publish',
  'media.delete',
  'season.export',
  'members.approve',
  'chat.manageChannels',
  'chat.moderate',
]

export const CAPABILITY_LABEL: Partial<Record<Capability, string>> = {
  'approvals.decide': 'Approve or hold purchases',
  'approvals.viewAmounts': 'See what purchases cost',
  'budget.edit': 'Edit the budget and log sponsors',
  'budget.viewAmounts': 'See budget figures',
  'roster.manage': 'Add and edit members',
  'calendar.edit': 'Add to the calendar',
  'tasks.assignOthers': 'Assign tasks to other people',
  'weekly.publish': 'Publish the weekly page',
  'media.delete': 'Delete from the build log',
  'season.export': 'Export the season',
  'members.approve': 'Accept people who ask to join',
  'chat.manageChannels': 'Create and rename chat channels',
  'chat.moderate': 'Delete other people’s messages',
}

/**
 * How far a team may open a capability, whatever the policy says.
 *
 * Widening *visibility* to everyone is a team's call. Widening a write, or
 * minors' contact details, to a signed-out guest is not — so policy can move
 * these within the roles below and no further. Without this, one dropdown in
 * Settings would hand roster editing to anybody who opened the link.
 */
const POLICY_CEILING: Partial<Record<Capability, Role[]>> = {
  'roster.readContact': ['coach', 'mentor', 'captain', 'student'],
  'roster.manage': ['coach', 'mentor', 'captain', 'student', 'parent'],
  'calendar.edit': ['coach', 'mentor', 'captain', 'student', 'parent'],
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
 * `contactRecords` is deliberately not open: it is minors' phone numbers and guardian
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

/**
 * Whether a role may do something. Grants are applied by `canMember` — this is
 * the role-and-policy layer, and the tests assert it in isolation.
 */
export function can(role: Role, capability: Capability, policy?: TeamPolicy): boolean {
  const key = POLICY_DRIVEN[capability]
  if (key && policy) {
    const audience = policy[key]
    // `archiveAfterDays` is a number and is never a capability key; the guard
    // keeps a malformed stored policy from silently granting everything.
    if (typeof audience === 'string') {
      const granted = AUDIENCE_ROLES[audience]?.includes(role) ?? false
      const ceiling = POLICY_CEILING[capability]
      return granted && (!ceiling || ceiling.includes(role))
    }
  }
  return MATRIX[capability].includes(role)
}

/**
 * The real check: role, policy, then anything granted to this person by name.
 *
 * A grant only ever adds. There is no negative grant, because "everyone except
 * Sam" is a policy decision dressed up as a personal one, and the roster is
 * where that argument belongs.
 */
/** Every capability the matrix knows about. */
export const ALL_CAPABILITIES = Object.keys(MATRIX) as Capability[]

/**
 * Whether somebody with `real` authority may look at the app as `target`.
 *
 * "Check what others see" exists so a coach can confirm what a student sees
 * before a parent night. It changes `session.role`, which is what every
 * `allow()` in the UI reads — so without a guard it is not a preview at all,
 * it is a role switcher, and a student who reached it could simply choose
 * coach and read the budget.
 *
 * The check is exact rather than a ranking. Roles are not a ladder: a parent
 * and a captain can each do things the other cannot, so "is target lower than
 * real" has no honest answer. Asking instead whether `target` can do anything
 * `real` cannot is precise, and it stays correct when the matrix changes or a
 * team's policy widens a capability.
 *
 * This is defence in depth, not the boundary. What a person may actually read
 * from the server is decided by row-level security, which never sees this.
 */
export function canPreviewAs(real: Role, target: Role, policy?: TeamPolicy): boolean {
  return ALL_CAPABILITIES.every((c) => !can(target, c, policy) || can(real, c, policy))
}

export function canMember(
  member: Pick<Member, 'role' | 'grants' | 'status'> | null | undefined,
  capability: Capability,
  policy?: TeamPolicy,
): boolean {
  if (!member) return can('guest', capability, policy)
  // Somebody waiting to be approved, or removed from the team, has a role but
  // no standing to use it.
  if (member.status !== 'active') return can('guest', capability, policy)
  if (can(member.role, capability, policy)) return true
  return Boolean(member.grants?.includes(capability) && GRANTABLE.includes(capability))
}

/** Roles that count as staff for "coach tools on" affordances. */
export function isStaff(role: Role): boolean {
  return role === 'coach' || role === 'mentor'
}

/** The masked stand-in for a withheld value, sized like the real thing. */
export function maskedAmount(): string {
  return '$•••.••'
}
