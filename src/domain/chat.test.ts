import { describe, expect, it } from 'vitest'
import { canSee, groupRuns, missingDefaults, totalUnread, unreadCount, visibleChannels } from './chat'
import { emptySeason } from './season'
import type { Channel, ChatMessage, Member, Role, SeasonData, Session, Subteam } from './types'

function member(id: string, role: Role, subteam?: Subteam, status: Member['status'] = 'active'): Member {
  return { id, updatedAt: '', name: id, role, subteam, username: id, password: null, status, joinedAt: '' }
}

function channel(id: string, patch: Partial<Channel>): Channel {
  return { id, updatedAt: '', name: id, kind: 'group', createdAt: '', ...patch }
}

function message(id: string, channelId: string, authorId: string, sentAt: string): ChatMessage {
  return { id, updatedAt: '', channelId, authorId, authorName: authorId, body: id, sentAt }
}

function season(patch: Partial<SeasonData> = {}): SeasonData {
  return { ...emptySeason(), ...patch }
}

const session = (memberId: string, readAt?: Record<string, string>): Session => ({
  memberId,
  role: 'student',
  teamNumber: '11138',
  signedInAt: null,
  guest: false,
  readAt,
})

/**
 * Visibility is the part worth testing hardest. A channel that leaks is worse
 * than a channel that is missing, and subteam membership being *derived* means
 * a roster edit silently changes who can read what.
 */
describe('channel visibility', () => {
  const team = channel('team', { kind: 'team', name: 'Everyone' })
  const mech = channel('mech', { kind: 'subteam', subteam: 'mechanical', name: 'Mechanical' })
  const group = channel('drive', { kind: 'group', memberIds: ['a', 'b'] })
  const staffRoom = channel('staff', { kind: 'group', memberIds: ['a', 'z'], staffOnly: true })

  it('shows the team channel to everyone on the team, parents included', () => {
    expect(canSee(team, member('a', 'student'))).toBe(true)
    expect(canSee(team, member('p', 'parent'))).toBe(true)
  })

  it('derives subteam membership from the roster rather than a stored list', () => {
    expect(canSee(mech, member('a', 'student', 'mechanical'))).toBe(true)
    expect(canSee(mech, member('b', 'student', 'software'))).toBe(false)
    // Staff see every subteam channel; they are responsible for all of them.
    expect(canSee(mech, member('c', 'coach', 'software'))).toBe(true)
  })

  it('keeps a group to exactly the people in it', () => {
    expect(canSee(group, member('a', 'student'))).toBe(true)
    expect(canSee(group, member('c', 'student'))).toBe(false)
    // Not even a coach, unless they were added.
    expect(canSee(group, member('c', 'coach'))).toBe(false)
  })

  it('hides a staff-only channel from a student who was added to it anyway', () => {
    expect(canSee(staffRoom, member('z', 'student'))).toBe(false)
    expect(canSee(staffRoom, member('a', 'coach'))).toBe(true)
  })

  it('shows nothing at all to someone not yet approved', () => {
    expect(canSee(team, member('n', 'student', undefined, 'requested'))).toBe(false)
    expect(canSee(team, member('n', 'coach', undefined, 'declined'))).toBe(false)
    expect(canSee(team, null)).toBe(false)
  })

  it('leaves archived channels out of the list', () => {
    const s = season({ channels: [team, channel('old', { kind: 'team', archived: true })] })
    expect(visibleChannels(s, member('a', 'student')).map((c) => c.id)).toEqual(['team'])
  })
})

describe('default channels', () => {
  it('creates the team channel first, and only once', () => {
    expect(missingDefaults(season()).map((c) => c.kind)).toEqual(['team'])
    const s = season({ channels: [channel('t', { kind: 'team' })] })
    expect(missingDefaults(s)).toEqual([])
  })

  it('makes a subteam channel where there is a subteam, not for a lone person', () => {
    const s = season({
      channels: [channel('t', { kind: 'team' })],
      members: [
        member('a', 'student', 'mechanical'),
        member('b', 'student', 'mechanical'),
        member('c', 'student', 'notebook'),
      ],
    })
    expect(missingDefaults(s).map((c) => c.subteam)).toEqual(['mechanical'])
  })

  it('ignores people who are not on the team yet', () => {
    const s = season({
      channels: [channel('t', { kind: 'team' })],
      members: [
        member('a', 'student', 'software', 'requested'),
        member('b', 'student', 'software', 'requested'),
      ],
    })
    expect(missingDefaults(s)).toEqual([])
  })
})

describe('unread', () => {
  const s = season({
    channels: [channel('team', { kind: 'team' })],
    messages: [
      message('m1', 'team', 'b', '2026-03-01T10:00:00.000Z'),
      message('m2', 'team', 'a', '2026-03-01T11:00:00.000Z'),
      message('m3', 'team', 'b', '2026-03-01T12:00:00.000Z'),
    ],
  })

  it('never counts your own messages', () => {
    expect(unreadCount(s, session('a'), 'team')).toBe(2)
  })

  it('counts only what arrived after this device last looked', () => {
    expect(unreadCount(s, session('a', { team: '2026-03-01T11:30:00.000Z' }), 'team')).toBe(1)
    expect(unreadCount(s, session('a', { team: '2026-03-01T23:00:00.000Z' }), 'team')).toBe(0)
  })

  it('totals only channels the reader can actually see', () => {
    const hidden = season({
      channels: [...s.channels, channel('secret', { kind: 'group', memberIds: ['z'] })],
      messages: [...s.messages, message('m4', 'secret', 'z', '2026-03-01T13:00:00.000Z')],
    })
    expect(totalUnread(hidden, session('a'), member('a', 'student'))).toBe(2)
  })
})

describe('grouping', () => {
  it('runs consecutive messages from one author together', () => {
    const runs = groupRuns([
      message('1', 'c', 'a', '2026-03-01T10:00:00.000Z'),
      message('2', 'c', 'a', '2026-03-01T10:01:00.000Z'),
      message('3', 'c', 'b', '2026-03-01T10:02:00.000Z'),
    ])
    expect(runs.map((r) => r.length)).toEqual([2, 1])
  })

  it('breaks a run when the same person speaks again much later', () => {
    const runs = groupRuns([
      message('1', 'c', 'a', '2026-03-01T10:00:00.000Z'),
      message('2', 'c', 'a', '2026-03-01T10:30:00.000Z'),
    ])
    expect(runs.map((r) => r.length)).toEqual([1, 1])
  })
})
