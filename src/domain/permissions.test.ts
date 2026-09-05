import { describe, expect, it } from 'vitest'
import { can, canPreviewAs, isStaff } from './permissions'
import type { Role } from './types'

/**
 * The permission matrix is the app's only real security boundary on-device, so
 * these tests assert the *withholding*, not just the granting. A regression that
 * exposes a purchase amount to a student is the failure that matters.
 */
describe('capabilities', () => {
  const students: Role[] = ['student', 'captain']

  it('keeps purchase amounts to mentors and coaches', () => {
    expect(can('mentor', 'approvals.viewAmounts')).toBe(true)
    expect(can('coach', 'approvals.viewAmounts')).toBe(true)
    for (const role of [...students, 'parent', 'guest'] as Role[]) {
      expect(can(role, 'approvals.viewAmounts')).toBe(false)
    }
  })

  it('keeps contact records to mentors and coaches', () => {
    for (const role of [...students, 'parent', 'guest'] as Role[]) {
      expect(can(role, 'roster.readContact')).toBe(false)
      expect(can(role, 'roster.readContact')).toBe(false)
    }
  })

  it('shows budget figures to the team but not to parents or guests', () => {
    for (const role of [...students, 'mentor', 'coach'] as Role[]) {
      expect(can(role, 'budget.viewAmounts')).toBe(true)
    }
    expect(can('parent', 'budget.viewAmounts')).toBe(false)
    expect(can('guest', 'budget.viewAmounts')).toBe(false)
  })

  it('lets students request spending but never decide it', () => {
    expect(can('student', 'approvals.request')).toBe(true)
    expect(can('student', 'approvals.decide')).toBe(false)
    expect(can('captain', 'approvals.decide')).toBe(false)
  })

  it('gives a guest no write capability at all', () => {
    const writes = [
      'roster.manage',
      'calendar.edit',
      'tasks.create',
      'budget.edit',
      'media.upload',
      'weekly.publish',
      'scouting.edit',
      'settings.manage',
    ] as const
    for (const capability of writes) expect(can('guest', capability)).toBe(false)
  })

  it('treats only coaches and mentors as staff', () => {
    expect(isStaff('coach')).toBe(true)
    expect(isStaff('mentor')).toBe(true)
    expect(isStaff('captain')).toBe(false)
    expect(isStaff('parent')).toBe(false)
  })
})

describe('canPreviewAs', () => {
  const ROLES: Role[] = ['coach', 'mentor', 'captain', 'student', 'parent', 'guest']

  it('lets a coach look at the app as anybody', () => {
    for (const r of ROLES) expect(canPreviewAs('coach', r)).toBe(true)
  })

  it('refuses to let a student preview upward', () => {
    // The failure this guards: "check what others see" is a role switcher
    // unless it can only ever narrow.
    expect(canPreviewAs('student', 'coach')).toBe(false)
    expect(canPreviewAs('student', 'mentor')).toBe(false)
    expect(canPreviewAs('student', 'captain')).toBe(false)
  })

  it('refuses sideways moves that would gain a capability', () => {
    // A parent may edit the calendar and a student may not, so neither can
    // stand in for the other — roles are not a ladder.
    expect(canPreviewAs('student', 'parent')).toBe(false)
    expect(canPreviewAs('parent', 'student')).toBe(false)
  })

  it('always allows previewing your own role and guest', () => {
    for (const r of ROLES) {
      expect(canPreviewAs(r, r)).toBe(true)
      expect(canPreviewAs(r, 'guest')).toBe(true)
    }
  })
})
