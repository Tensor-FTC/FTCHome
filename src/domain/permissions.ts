import type { Role } from './types'

/**
 * What a role may do. This is the single source of truth — screens ask
 * `can(role, 'budget.edit')` rather than testing `role === 'mentor'` inline, so a
 * new role is one edit here instead of a hunt through nineteen screens.
 *
 * The gating is real: withheld values are never put into the DOM. A student who
 * opens devtools finds a locked chip, not a hidden div with $412.80 in it.
 */
export type Capability =
  | 'roster.manage'
  | 'roster.readMedical'
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
  | 'season.export'

const MATRIX: Record<Capability, Role[]> = {
  'roster.manage': ['coach', 'mentor'],
  'roster.readMedical': ['coach', 'mentor'],
  'roster.readContact': ['coach', 'mentor'],
  'calendar.edit': ['coach', 'mentor', 'captain'],
  'tasks.create': ['coach', 'mentor', 'captain', 'student'],
  'tasks.assignOthers': ['coach', 'mentor', 'captain'],
  // Parents see progress, never figures. Students see figures — they raise the money.
  'budget.viewAmounts': ['coach', 'mentor', 'captain', 'student'],
  'budget.edit': ['coach', 'mentor'],
  // A purchase amount is mentor-only even though the *request* is visible to all.
  'approvals.viewAmounts': ['coach', 'mentor'],
  'approvals.decide': ['coach', 'mentor'],
  'approvals.request': ['coach', 'mentor', 'captain', 'student'],
  'media.upload': ['coach', 'mentor', 'captain', 'student'],
  'media.delete': ['coach', 'mentor', 'captain'],
  'weekly.edit': ['coach', 'mentor', 'captain'],
  'weekly.publish': ['coach', 'mentor', 'captain'],
  'scouting.edit': ['coach', 'mentor', 'captain', 'student'],
  'settings.manage': ['coach', 'mentor'],
  'season.export': ['coach', 'mentor', 'captain'],
}

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[capability].includes(role)
}

/** Roles that count as staff for the "coach tools on" affordances. */
export function isStaff(role: Role): boolean {
  return role === 'coach' || role === 'mentor'
}

/** The masked stand-in for a withheld value, sized like the real thing. */
export function maskedAmount(): string {
  return '$•••.••'
}
