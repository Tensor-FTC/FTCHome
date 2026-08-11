import type { Member, Role } from './types'

/**
 * Who runs a team that has no adult on it yet.
 *
 * Students start FTC teams. The app used to handle that by making whoever
 * signed up first a *coach*, which is a lie told to the permission system to
 * work around a real problem: somebody has to be able to accept the second
 * person, and there is nobody to grant that. The cost was a roster that said
 * "Anish Agrawal · COACH" about a student, and a role that stayed wrong all
 * season because nothing ever took it back.
 *
 * So the founder keeps their real role and *holds* admin instead. The hold is
 * derived, never stored: the moment a coach or mentor is active on the team,
 * `effectiveRole` stops returning coach and the founder is what they always
 * said they were. Nobody has to remember to hand anything over, and there is
 * no migration when they forget.
 *
 * This is a local convenience, not a security boundary. What anybody can
 * actually read or write is decided by row-level security on the server, which
 * knows nothing about founders.
 */

/** True when somebody other than `exceptId` is active staff on this team. */
export function hasActiveStaff(members: Member[], exceptId?: string): boolean {
  return members.some(
    (m) => m.id !== exceptId && m.status === 'active' && (m.role === 'coach' || m.role === 'mentor'),
  )
}

/**
 * True while this person is standing in for a coach the team does not have.
 *
 * Only ever true for the founder, and only while the team has no other active
 * coach or mentor. A founder who *is* a coach is not "holding" anything — they
 * simply are one — so this is false for them and the banner stays away.
 */
export function isHoldingAdmin(member: Member | null | undefined, members: Member[]): boolean {
  if (!member?.foundedTeam || member.status !== 'active') return false
  if (member.role === 'coach' || member.role === 'mentor') return false
  return !hasActiveStaff(members, member.id)
}

/**
 * The role to run permission checks against.
 *
 * Identical to `member.role` for everybody except a founder holding admin, who
 * is treated as a coach until real staff arrive.
 */
export function effectiveRole(member: Member | null | undefined, members: Member[]): Role {
  if (!member) return 'guest'
  return isHoldingAdmin(member, members) ? 'coach' : member.role
}
