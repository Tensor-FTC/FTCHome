import { describe, expect, it } from 'vitest'
import { eventStaffing, isLastStaff, staffingIssues } from './staffing'
import { can, DEFAULT_POLICY } from './permissions'
import { emptySeason } from './season'
import type { Member, Role, SeasonData, TeamPolicy } from './types'

function member(id: string, role: Role, patch: Partial<Member> = {}): Member {
  return {
    id,
    updatedAt: '',
    name: id,
    role,
    username: `${id}@1`,
    password: null,
    pending: false,
    joinedAt: '',
    ...patch,
  }
}

function season(members: Member[], patch: Partial<SeasonData> = {}): SeasonData {
  return { ...emptySeason(), members, ...patch }
}

/**
 * FTC teams do not come in one shape: one coach, three coaches and no head, or
 * mentors carrying it with no coach at all. These assert that none of those is
 * treated as broken, and that the one genuinely broken case — nobody in charge
 * — is impossible to reach by tidying up the roster.
 */
describe('staffing', () => {
  it('accepts several coaches without needing a head', () => {
    const s = season([member('ann', 'coach'), member('bo', 'coach'), member('cy', 'student')])
    expect(staffingIssues(s)).toEqual([])
  })

  it('treats a mentor-only team as workable, with a note about registration', () => {
    const s = season([member('ann', 'mentor'), member('bo', 'mentor')])
    const issues = staffingIssues(s)
    expect(issues).toHaveLength(1)
    expect(issues[0].id).toBe('no-coach')
    expect(issues[0].severity).toBe('advisory')
  })

  it('flags a team with nobody in charge as blocking', () => {
    const s = season([member('cy', 'captain'), member('di', 'student')])
    expect(staffingIssues(s)[0]).toMatchObject({ id: 'no-staff', severity: 'blocking' })
  })

  it('names the single point of failure when one adult is carrying it', () => {
    const s = season([member('ann', 'coach'), member('cy', 'student')])
    expect(staffingIssues(s)[0].id).toBe('single-staff')
  })

  it('mentions an unclaimed invite only when no adult has signed in', () => {
    const claimed = season([member('ann', 'coach'), member('bo', 'mentor', { pending: true })])
    expect(claimed.members.length).toBe(2)
    expect(staffingIssues(claimed).some((i) => i.id === 'staff-unclaimed')).toBe(false)

    const none = season([member('ann', 'coach', { pending: true })])
    expect(staffingIssues(none).some((i) => i.id === 'staff-unclaimed')).toBe(true)
  })

  it('refuses to let the last adult be removed or demoted', () => {
    const one = [member('ann', 'coach'), member('cy', 'student')]
    expect(isLastStaff(one, 'ann')).toBe(true)
    expect(isLastStaff(one, 'cy')).toBe(false)

    // A mentor counts, so a coach can leave a team that still has one.
    const two = [member('ann', 'coach'), member('bo', 'mentor')]
    expect(isLastStaff(two, 'ann')).toBe(false)
    expect(isLastStaff(two, 'bo')).toBe(false)
  })

  it('reports an event where every adult said no', () => {
    const members = [member('ann', 'coach'), member('bo', 'mentor')]
    const s = season(members, {
      rsvps: [
        { id: 'r1', updatedAt: '', eventId: 'e1', memberId: 'ann', status: 'cant' },
        { id: 'r2', updatedAt: '', eventId: 'e1', memberId: 'bo', status: 'cant' },
      ],
    })
    expect(eventStaffing(s, 'e1')).toEqual({ total: 2, declined: 2, uncovered: true })

    // One of them coming is enough to cover it.
    s.rsvps[1].status = 'going'
    expect(eventStaffing(s, 'e1').uncovered).toBe(false)
  })
})

describe('policy ceilings', () => {
  const open = (patch: Partial<TeamPolicy>): TeamPolicy => ({ ...DEFAULT_POLICY, ...patch })

  it('lets a team show budget figures to everyone, parents included', () => {
    expect(can('parent', 'budget.viewAmounts', open({ budgetFigures: 'everyone' }))).toBe(true)
    expect(can('parent', 'budget.viewAmounts', open({ budgetFigures: 'members' }))).toBe(false)
  })

  it('never hands a write capability to a guest, whatever the policy says', () => {
    const wideOpen = open({ rosterEditing: 'everyone', calendarEditing: 'everyone' })
    expect(can('guest', 'roster.manage', wideOpen)).toBe(false)
    expect(can('guest', 'calendar.edit', wideOpen)).toBe(false)
    expect(can('parent', 'roster.manage', wideOpen)).toBe(false)
    // …but a student may be given them, which is the point of the setting.
    expect(can('student', 'calendar.edit', wideOpen)).toBe(true)
    expect(can('student', 'roster.manage', wideOpen)).toBe(true)
  })

  it('never exposes contact records outside the signed-in team', () => {
    const wideOpen = open({ contactRecords: 'everyone' })
    expect(can('guest', 'roster.readContact', wideOpen)).toBe(false)
    expect(can('parent', 'roster.readContact', wideOpen)).toBe(false)
    expect(can('student', 'roster.readContact', wideOpen)).toBe(true)
  })

  it('keeps deciding spending off the policy layer entirely', () => {
    const wideOpen = open({ budgetFigures: 'everyone', purchaseAmounts: 'everyone' })
    expect(can('student', 'approvals.decide', wideOpen)).toBe(false)
    expect(can('captain', 'approvals.decide', wideOpen)).toBe(false)
    expect(can('guest', 'settings.manage', wideOpen)).toBe(false)
  })
})
