import type { Channel, ChatMessage, Member, SeasonData, Session } from './types'

import { isStaff } from './permissions'
import { inSubteam, membersOf, subteamLabel } from './subteams'

/**
 * Who can see which channel, and what is unread.
 *
 * Visibility is computed rather than stored. A student moving from mechanical
 * to software should not need anybody to remember to move them between two
 * channels, and a member list that has to be maintained by hand is a member
 * list that is wrong by February.
 */

export function visibleChannels(season: SeasonData, me: Member | null | undefined): Channel[] {
  return season.channels.filter((c) => !c.archived && canSee(c, me))
}

export function canSee(channel: Channel, me: Member | null | undefined): boolean {
  if (!me || me.status !== 'active') return false
  if (channel.staffOnly && !isStaff(me.role)) return false
  if (channel.kind === 'team') return true
  if (channel.kind === 'subteam') return inSubteam(me, channel.subteam ?? '') || isStaff(me.role)
  return Boolean(channel.memberIds?.includes(me.id))
}

export function channelMessages(season: SeasonData, channelId: string): ChatMessage[] {
  return season.messages
    .filter((m) => m.channelId === channelId)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
}

export function lastMessage(season: SeasonData, channelId: string): ChatMessage | undefined {
  return channelMessages(season, channelId).at(-1)
}

/** Messages in this channel since the device last opened it, excluding your own. */
export function unreadCount(season: SeasonData, session: Session, channelId: string): number {
  const since = session.readAt?.[channelId]
  return season.messages.filter(
    (m) => m.channelId === channelId && m.authorId !== session.memberId && (!since || m.sentAt > since),
  ).length
}

export function totalUnread(season: SeasonData, session: Session, me: Member | null | undefined): number {
  return visibleChannels(season, me).reduce((sum, c) => sum + unreadCount(season, session, c.id), 0)
}

/**
 * The channels a team should have, given its roster.
 *
 * Created on first visit rather than at sign-up: a team of one does not need a
 * mechanical channel, and six empty rooms is a worse first impression than one
 * with people in it.
 */
export function missingDefaults(season: SeasonData): Omit<Channel, 'id' | 'updatedAt'>[] {
  const out: Omit<Channel, 'id' | 'updatedAt'>[] = []
  const now = new Date().toISOString()

  if (!season.channels.some((c) => c.kind === 'team')) {
    out.push({
      name: 'Everyone',
      kind: 'team',
      topic: 'The whole team. Announcements land here.',
      createdAt: now,
    })
  }

  const used = new Set(season.channels.filter((c) => c.kind === 'subteam').map((c) => c.subteam))
  const active = new Set(
    season.members.filter((m) => m.status === 'active').flatMap((m) => m.subteams ?? []),
  )
  for (const subteam of active) {
    // Two people is a pair, not a subteam; a channel for one person is noise.
    const size = membersOf(season, subteam).length
    if (size < 2 || used.has(subteam)) continue
    out.push({
      name: subteamLabel(season, subteam),
      kind: 'subteam',
      subteam,
      topic: `Everyone on ${subteamLabel(season, subteam).toLowerCase()}.`,
      createdAt: now,
    })
  }

  return out
}

/** Groups the same author's consecutive messages, the way every chat app does. */
export function groupRuns(messages: ChatMessage[]): ChatMessage[][] {
  const runs: ChatMessage[][] = []
  for (const message of messages) {
    const last = runs.at(-1)
    const sameAuthor = last?.[0]?.authorId === message.authorId
    // Five minutes: long enough that a reply reads as a reply, not a new thought.
    const closeInTime =
      last && new Date(message.sentAt).getTime() - new Date(last.at(-1)!.sentAt).getTime() < 5 * 60_000
    if (sameAuthor && closeInTime) last!.push(message)
    else runs.push([message])
  }
  return runs
}
