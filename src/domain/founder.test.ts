import { describe, expect, it } from 'vitest'
import { effectiveRole, hasActiveStaff, isHoldingAdmin } from './founder'
import type { Member, Role } from './types'

function member(over: Partial<Member> & { id: string }): Member {
  return {
    updatedAt: '2026-01-01T00:00:00.000Z',
    name: over.id,
    role: 'student' as Role,
    subteams: [],
    username: over.id,
    password: null,
    status: 'active',
    joinedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

/**
 * The behaviour this locks in: a student who starts a team can run it, keeps
 * their real role on the roster, and stops being an admin the moment a coach
 * actually shows up — without anybody performing a handover.
 */
describe('founder admin', () => {
  it('lets a student founder act as coach while the team has no staff', () => {
    const me = member({ id: 'a', role: 'student', foundedTeam: true })
    expect(isHoldingAdmin(me, [me])).toBe(true)
    expect(effectiveRole(me, [me])).toBe('coach')
  })

  it('keeps their real role on the roster, not coach', () => {
    const me = member({ id: 'a', role: 'student', foundedTeam: true })
    // The distinction that matters: what they may *do* changes, what they
    // *are* does not.
    expect(me.role).toBe('student')
  })

  it('hands admin back the moment a coach becomes active', () => {
    const me = member({ id: 'a', role: 'student', foundedTeam: true })
    const coach = member({ id: 'b', role: 'coach' })
    expect(isHoldingAdmin(me, [me, coach])).toBe(false)
    expect(effectiveRole(me, [me, coach])).toBe('student')
  })

  it('does not hand back to a coach who is still waiting for approval', () => {
    const me = member({ id: 'a', role: 'student', foundedTeam: true })
    const pending = member({ id: 'b', role: 'coach', status: 'requested' })
    expect(effectiveRole(me, [me, pending])).toBe('coach')
  })

  it('counts a mentor as staff too', () => {
    const me = member({ id: 'a', role: 'student', foundedTeam: true })
    const mentor = member({ id: 'b', role: 'mentor' })
    expect(effectiveRole(me, [me, mentor])).toBe('student')
  })

  it('is never true for somebody who did not found the team', () => {
    const other = member({ id: 'c', role: 'student' })
    expect(isHoldingAdmin(other, [other])).toBe(false)
  })

  it('is not "holding" anything when the founder is themselves a coach', () => {
    const me = member({ id: 'a', role: 'coach', foundedTeam: true })
    expect(isHoldingAdmin(me, [me])).toBe(false)
    expect(effectiveRole(me, [me])).toBe('coach')
  })

  it('ignores the person themselves when looking for staff', () => {
    const coach = member({ id: 'a', role: 'coach', foundedTeam: true })
    expect(hasActiveStaff([coach], 'a')).toBe(false)
    expect(hasActiveStaff([coach])).toBe(true)
  })
})
