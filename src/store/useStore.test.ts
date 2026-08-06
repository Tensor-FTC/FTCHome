import { beforeEach, describe, expect, it } from 'vitest'
import { budgetTotals, partsTotals, useStore } from './useStore'
import { fixtureSeason } from '@/test/fixtures'

/**
 * Store behaviour that screens depend on. These run against the real IndexedDB
 * shim, so they also prove the persistence path does not throw.
 */
describe('season store', () => {
  beforeEach(async () => {
    await useStore.getState().replaceSeason(fixtureSeason('2026-01-10'))
  })

  it('adds a member as a pending invite with a derived username', () => {
    const member = useStore.getState().addMember('Q. Tester', 'student', 'software')
    expect(member.status).toBe('invited')
    expect(member.password).toBeNull()
    expect(member.username).toBe('qtester@11138')
    expect(useStore.getState().season.members.find((m) => m.id === member.id)).toBeDefined()
  })

  it('unassigns a removed member’s tasks instead of deleting their work', () => {
    const { season, removeMember } = useStore.getState()
    const owner = season.members.find((m) => season.tasks.some((t) => t.assigneeId === m.id))!
    const theirTasks = season.tasks.filter((t) => t.assigneeId === owner.id).map((t) => t.id)
    expect(theirTasks.length).toBeGreaterThan(0)

    removeMember(owner.id)

    const after = useStore.getState().season
    expect(after.members.find((m) => m.id === owner.id)).toBeUndefined()
    for (const id of theirTasks) {
      const task = after.tasks.find((t) => t.id === id)
      expect(task).toBeDefined()
      expect(task?.assigneeId).toBeUndefined()
    }
  })

  it('removes a member’s RSVPs, which are meaningless without them', () => {
    const { season, removeMember } = useStore.getState()
    const owner = season.members.find((m) => season.rsvps.some((r) => r.memberId === m.id))!
    removeMember(owner.id)
    expect(useStore.getState().season.rsvps.some((r) => r.memberId === owner.id)).toBe(false)
  })

  it('replaces rather than duplicates an RSVP when someone changes their mind', () => {
    const { season, setRsvp } = useStore.getState()
    const event = season.events[0]
    const member = season.members[0]

    setRsvp(event.id, member.id, 'going')
    setRsvp(event.id, member.id, 'cant')

    const matching = useStore.getState().season.rsvps.filter(
      (r) => r.eventId === event.id && r.memberId === member.id,
    )
    expect(matching).toHaveLength(1)
    expect(matching[0].status).toBe('cant')
  })

  it('deletes an event’s RSVPs along with the event', () => {
    const { season, removeEvent } = useStore.getState()
    const event = season.events.find((e) => season.rsvps.some((r) => r.eventId === e.id))!
    removeEvent(event.id)
    expect(useStore.getState().season.rsvps.some((r) => r.eventId === event.id)).toBe(false)
  })

  it('moves money out of an allocation when a purchase is approved', () => {
    const { season, decideApproval } = useStore.getState()
    const approval = season.approvals.find((a) => a.state === 'pending' && a.allocationId)!
    const before = season.allocations.find((a) => a.id === approval.allocationId)!.spent

    decideApproval(approval.id, 'approved', season.members[0].id)

    const after = useStore.getState().season.allocations.find((a) => a.id === approval.allocationId)!
    expect(after.spent).toBeCloseTo(before + approval.amount, 2)
  })

  it('does not move money when a purchase is held', () => {
    const { season, decideApproval } = useStore.getState()
    const approval = season.approvals.find((a) => a.state === 'pending' && a.allocationId)!
    const before = season.allocations.find((a) => a.id === approval.allocationId)!.spent

    decideApproval(approval.id, 'held', season.members[0].id)

    const after = useStore.getState().season.allocations.find((a) => a.id === approval.allocationId)!
    expect(after.spent).toBe(before)
  })

  it('starts with no parts — there is no bundled catalogue', () => {
    expect(useStore.getState().season.parts).toHaveLength(0)
    expect(partsTotals(useStore.getState().season)).toMatchObject({ need: 0, all: 0, allCount: 0 })
  })

  it('subtracts owned parts from the still-needed subtotal', () => {
    const { addPart, togglePart } = useStore.getState()
    const part = addPart({ name: 'Motor', partNumber: 'M-1', vendor: 'v', category: 'Drivetrain', qty: 4, unit: 44, owned: false })

    const before = partsTotals(useStore.getState().season)
    expect(before.need).toBe(176)

    togglePart(part.id)

    const after = partsTotals(useStore.getState().season)
    expect(after.need).toBe(0)
    expect(after.haveCount).toBe(1)
    // The total is a bill of materials and must not shrink.
    expect(after.all).toBe(before.all)
  })

  it('imports parts in bulk', () => {
    const added = useStore.getState().importParts([
      { name: 'A', partNumber: '', vendor: '', category: 'Kit', qty: 2, unit: 10, owned: false },
      { name: 'B', partNumber: '', vendor: '', category: 'Kit', qty: 1, unit: 5, owned: true },
    ])
    expect(added).toBe(2)
    const totals = partsTotals(useStore.getState().season)
    expect(totals.allCount).toBe(2)
    expect(totals.all).toBe(25)
    expect(totals.need).toBe(20)
  })

  it('removes a part', () => {
    const part = useStore.getState().addPart({ name: 'Temp', partNumber: '', vendor: '', category: '', qty: 1, unit: 1, owned: false })
    useStore.getState().removePart(part.id)
    expect(useStore.getState().season.parts.find((p) => p.id === part.id)).toBeUndefined()
  })

  it('counts pledged and received separately, because a pledge cannot buy motors', () => {
    const totals = budgetTotals(useStore.getState().season)
    expect(totals.received).toBeGreaterThan(0)
    expect(totals.pledged).toBeGreaterThan(0)
    expect(totals.raised).toBe(totals.received + totals.pledged)
    expect(totals.gap).toBe(Math.max(0, totals.goal - totals.raised))
  })

  it('never reports a negative gap once the goal is beaten', () => {
    const { addSponsor } = useStore.getState()
    addSponsor({ name: 'Very Large Grant', tier: 'GRANT', amount: 999_999, state: 'Received', loggedAt: new Date().toISOString() })
    expect(budgetTotals(useStore.getState().season).gap).toBe(0)
  })

  it('sets a password on first sign-in and rejects a wrong one afterwards', async () => {
    const { season, signIn } = useStore.getState()
    const member = season.members[1]
    expect(member.password).toBeNull()

    await expect(signIn(member.id, 'firstpassword')).resolves.toBe(true)
    expect(useStore.getState().session.memberId).toBe(member.id)
    expect(useStore.getState().season.members.find((m) => m.id === member.id)?.password).not.toBeNull()

    useStore.getState().signOut()
    await expect(signIn(member.id, 'wrongpassword')).resolves.toBe(false)
    expect(useStore.getState().session.memberId).toBeNull()
    await expect(signIn(member.id, 'firstpassword')).resolves.toBe(true)
  })

  it('refuses a first account on a team that already has members', async () => {
    // Otherwise "I am the first person here" would mint a coach on any team.
    await expect(
      useStore.getState().createFirstAccount({ name: 'Intruder', password: 'longenough' }),
    ).rejects.toThrow(/already has members/)
  })

  it('signs a session down to guest on sign-out', () => {
    useStore.getState().signInAs(useStore.getState().season.members[0].id)
    expect(useStore.getState().session.guest).toBe(false)
    useStore.getState().signOut()
    expect(useStore.getState().session).toMatchObject({ memberId: null, role: 'guest', guest: true })
  })

  it('keeps an alliance preference for Competition Mode', () => {
    useStore.getState().updateSettings({ alliance: 'blue' })
    expect(useStore.getState().season.settings.alliance).toBe('blue')
  })
})
