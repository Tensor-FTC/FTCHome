import { dueLabel, fromIso, isValidIso, timeToMinutes, today } from '@/lib/date'
import { expandEvent } from './recurrence'
import { isDone } from './tasks'
import type { SeasonData } from './types'

/**
 * What is about to come due.
 *
 * The counterpart to the match countdown, for the other half of a season. A
 * match alert is about the next twenty minutes; this is about the next two
 * days, which is the window in which a team can still do something about a
 * deadline it had forgotten.
 *
 * Two rules keep it from becoming noise:
 *
 *  - **Only things with a hard date.** Calendar entries typed as a deadline,
 *    and tasks that carry a due date. A build session is not a deadline; a
 *    task with no date cannot be late.
 *  - **Only things still open.** A finished task is not a warning, however
 *    close its date is.
 */

/** How far ahead is close enough to be worth interrupting somebody about. */
export const DEADLINE_WINDOW_MS = 48 * 60 * 60 * 1000

export interface DueSoon {
  /**
   * Stable across reloads and across the three days it stays inside the
   * window, so an alert fires once rather than every time the app is opened.
   */
  key: string
  title: string
  /** "today", "tomorrow", "2d late" — the same words the task lists use. */
  whenLabel: string
  date: string
}

/**
 * Everything due between now and the window's end, soonest first.
 *
 * Anything already past is deliberately left out. A deadline that has gone is
 * not news, and paging somebody about it is how they learn to ignore the app.
 */
export function dueSoon(season: SeasonData, nowMs: number, windowMs = DEADLINE_WINDOW_MS): DueSoon[] {
  const from = today()
  const out: DueSoon[] = []

  for (const event of season.events) {
    if (event.type !== 'dead' || event.deleted || event.archivedAt) continue
    // A repeating deadline is unusual but legal, and only the occurrence
    // inside the window is the one anybody can act on.
    const dates = event.recurrence
      ? expandEvent(event, from, isoAfter(from, windowMs)).map((o) => o.date)
      : [event.date]
    for (const date of dates) {
      const at = dueAt(date, event.time)
      if (at === null || at < nowMs || at > nowMs + windowMs) continue
      out.push({ key: `event:${event.id}:${date}`, title: event.title, whenLabel: dueLabel(date, from).text, date })
    }
  }

  for (const task of season.tasks) {
    if (isDone(task) || task.deleted || task.archivedAt) continue
    const at = dueAt(task.due, '')
    if (at === null || at < nowMs || at > nowMs + windowMs) continue
    out.push({ key: `task:${task.id}:${task.due}`, title: task.name, whenLabel: dueLabel(task.due, from).text, date: task.due })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

/**
 * When a dated thing is actually due, in milliseconds.
 *
 * A deadline with a time is due at that time; one without is due at the end of
 * its day, because "Nov 15" means you have until the end of Nov 15.
 */
function dueAt(iso: string, time: string): number | null {
  if (!iso || !isValidIso(iso)) return null
  const d = fromIso(iso)
  const minutes = timeToMinutes(time)
  if (minutes === Number.MAX_SAFE_INTEGER) d.setHours(23, 59, 59, 999)
  else d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return d.getTime()
}

function isoAfter(iso: string, ms: number): string {
  const d = fromIso(iso)
  d.setTime(d.getTime() + ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`
}
