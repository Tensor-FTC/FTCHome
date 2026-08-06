import { addDays, today as todayIso } from '@/lib/date'
import type {
  Approval,
  CalendarEvent,
  MediaItem,
  ScoutingNote,
  SeasonData,
  Task,
  TeamPolicy,
  WeeklyReport,
} from './types'

/**
 * The archive.
 *
 * A season accumulates faster than anyone expects — by March a team has a few
 * hundred build photos, finished tasks and past meetings, and every list is
 * mostly history. So the working screens show a recent window and everything
 * older moves to one place.
 *
 * Archiving is a *filter, not a mutation*. Nothing is edited, moved or deleted,
 * the cutoff is a team setting, and widening it brings everything straight back.
 * A season you cannot get back out is a season you have lost.
 */

/** Records older than this drop out of the working screens. */
export function archiveCutoff(policy: TeamPolicy, from: string = todayIso()): string {
  const days = Number.isFinite(policy.archiveAfterDays) ? policy.archiveAfterDays : 30
  // 0 disables archiving entirely, for a team that would rather scroll.
  if (days <= 0) return '0000-00-00'
  return addDays(from, -days)
}

// Each rule answers one question: is this record finished *and* old?

/** A repeating series stays live until the rule itself has run out. */
export function eventArchived(event: CalendarEvent, cutoff: string): boolean {
  if (event.recurrence) {
    // No end date means it is still running, however old the first date is.
    return Boolean(event.recurrence.until && event.recurrence.until < cutoff)
  }
  return event.date < cutoff
}

/** Only finished work archives. An overdue task from October is still overdue. */
export function taskArchived(task: Task, cutoff: string): boolean {
  if (task.status !== 'done') return false
  return (task.doneAt?.slice(0, 10) ?? task.due ?? '') < cutoff
}

export function mediaArchived(item: MediaItem, cutoff: string): boolean {
  return item.day < cutoff
}

export function weeklyArchived(report: WeeklyReport, cutoff: string): boolean {
  return report.to < cutoff
}

/** A pending request never archives, however long it has been sitting there. */
export function approvalArchived(approval: Approval, cutoff: string): boolean {
  if (approval.state === 'pending') return false
  return (approval.decidedAt ?? approval.requestedAt).slice(0, 10) < cutoff
}

/** Notes archive with the competition they were taken at. */
export function scoutingArchived(note: ScoutingNote, cutoff: string, ongoingEventCode: string): boolean {
  if (note.eventCode && note.eventCode === ongoingEventCode) return false
  return (note.takenAt ?? note.updatedAt).slice(0, 10) < cutoff
}

export interface SeasonSplit {
  events: CalendarEvent[]
  tasks: Task[]
  media: MediaItem[]
  weekly: WeeklyReport[]
  approvals: Approval[]
  scouting: ScoutingNote[]
}

export interface ArchiveResult {
  cutoff: string
  current: SeasonSplit
  archived: SeasonSplit
  /** How many records the archive is holding, for the badge on the nav. */
  count: number
}

function split<T>(items: T[], isOld: (item: T) => boolean): [current: T[], archived: T[]] {
  const current: T[] = []
  const archived: T[] = []
  for (const item of items) (isOld(item) ? archived : current).push(item)
  return [current, archived]
}

/** Splits a whole season into what is live and what is history. */
export function partitionSeason(season: SeasonData, from: string = todayIso()): ArchiveResult {
  const cutoff = archiveCutoff(season.settings.policy, from)
  const ongoing = season.competition.ongoing ? season.competition.code : ''

  const [events, oldEvents] = split(season.events, (e) => eventArchived(e, cutoff))
  const [tasks, oldTasks] = split(season.tasks, (t) => taskArchived(t, cutoff))
  const [media, oldMedia] = split(season.media, (m) => mediaArchived(m, cutoff))
  const [weekly, oldWeekly] = split(season.weekly, (w) => weeklyArchived(w, cutoff))
  const [approvals, oldApprovals] = split(season.approvals, (a) => approvalArchived(a, cutoff))
  const [scouting, oldScouting] = split(season.scouting, (n) => scoutingArchived(n, cutoff, ongoing))

  return {
    cutoff,
    current: { events, tasks, media, weekly, approvals, scouting },
    archived: {
      events: oldEvents,
      tasks: oldTasks,
      media: oldMedia,
      weekly: oldWeekly,
      approvals: oldApprovals,
      scouting: oldScouting,
    },
    count:
      oldEvents.length +
      oldTasks.length +
      oldMedia.length +
      oldWeekly.length +
      oldApprovals.length +
      oldScouting.length,
  }
}
