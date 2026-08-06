import { addDays, fromIso, toIso } from '@/lib/date'
import type { CalendarEvent, Recurrence } from './types'

/**
 * Recurring calendar entries.
 *
 * The old model was a single `repeatWeeklyUntil` date, which could not express
 * the thing teams actually do — "build sessions Tuesday and Thursday for the
 * next six weeks". This expands a rule into concrete dates instead.
 *
 * Occurrences are computed on read rather than written out as rows: a team that
 * meets twice a week for a season is ~50 rows of nothing, and editing the
 * series afterwards would mean finding and rewriting every one of them.
 */

/** Hard ceiling so a malformed rule cannot spin forever. */
const MAX_OCCURRENCES = 400

export interface Occurrence {
  event: CalendarEvent
  /** Concrete ISO date for this instance. */
  date: string
  /** 0 for the first instance in the series. */
  index: number
  /** False for one-off entries. */
  repeating: boolean
}

export function describeRecurrence(r: Recurrence | undefined): string {
  if (!r) return 'Does not repeat'
  const every =
    r.interval === 1
      ? r.freq === 'weekly'
        ? 'Weekly'
        : 'Monthly'
      : `Every ${r.interval} ${r.freq === 'weekly' ? 'weeks' : 'months'}`

  const days =
    r.freq === 'weekly' && r.days?.length
      ? ` on ${r.days
          .slice()
          .sort((a, b) => a - b)
          .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
          .join(', ')}`
      : ''

  const ends = r.count ? `, ${r.count} times` : r.until ? `, until ${r.until}` : ''
  return `${every}${days}${ends}`
}

/**
 * Dates this event falls on inside `[from, to]`.
 *
 * `to` bounds the walk, so asking for one month never iterates a whole season.
 */
export function expandEvent(event: CalendarEvent, from: string, to: string): Occurrence[] {
  const rule = event.recurrence
  if (!rule) {
    return event.date >= from && event.date <= to
      ? [{ event, date: event.date, index: 0, repeating: false }]
      : []
  }

  const out: Occurrence[] = []
  const exceptions = new Set(event.exceptions ?? [])
  const hardStop = rule.until && rule.until < to ? rule.until : to

  let index = 0
  let emitted = 0

  if (rule.freq === 'weekly') {
    const interval = Math.max(1, rule.interval || 1)
    const start = fromIso(event.date)
    // Default to the weekday the series starts on.
    const days = rule.days?.length ? [...new Set(rule.days)].sort((a, b) => a - b) : [start.getDay()]

    // Walk from the Sunday of the start week so day-of-week maths stays simple.
    let weekAnchor = addDays(event.date, -start.getDay())

    while (weekAnchor <= hardStop && emitted < MAX_OCCURRENCES) {
      for (const day of days) {
        const date = addDays(weekAnchor, day)
        // Never emit before the series starts, even if an earlier weekday is selected.
        if (date < event.date) continue
        if (rule.until && date > rule.until) break
        if (rule.count && index >= rule.count) break
        index++
        if (date > to) break
        if (date >= from && !exceptions.has(date)) {
          out.push({ event, date, index: index - 1, repeating: true })
          emitted++
        }
      }
      if (rule.count && index >= rule.count) break
      weekAnchor = addDays(weekAnchor, 7 * interval)
    }
    return out
  }

  // monthly: same day-of-month, every N months
  const interval = Math.max(1, rule.interval || 1)
  const start = fromIso(event.date)
  const dayOfMonth = start.getDate()

  for (let step = 0; emitted < MAX_OCCURRENCES; step++) {
    if (rule.count && step >= rule.count) break
    const d = new Date(start.getFullYear(), start.getMonth() + step * interval, 1)
    // Clamp to the month's length so the 31st does not skip February.
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(dayOfMonth, lastDay))
    const date = toIso(d)

    if (date > hardStop) break
    if (rule.until && date > rule.until) break
    if (date >= from && date >= event.date && !exceptions.has(date)) {
      out.push({ event, date, index: step, repeating: true })
      emitted++
    }
  }
  return out
}

/** Every occurrence of every event in a window, in date order. */
export function expandAll(events: CalendarEvent[], from: string, to: string): Occurrence[] {
  return events
    .flatMap((e) => expandEvent(e, from, to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.event.title.localeCompare(b.event.title))
}

/** A stable key for one instance, so React lists and RSVPs can address it. */
export function occurrenceId(event: CalendarEvent, date: string): string {
  return event.recurrence ? `${event.id}@${date}` : event.id
}

/** Splits an occurrence key back into its parts. */
export function parseOccurrenceId(id: string): { eventId: string; date?: string } {
  const at = id.indexOf('@')
  return at === -1 ? { eventId: id } : { eventId: id.slice(0, at), date: id.slice(at + 1) }
}

/**
 * RFC 5545 RRULE for calendar export. Written from the same rule the app expands
 * from, so what a team sees in Google Calendar is what they see here.
 */
export function toRRule(r: Recurrence | undefined): string | null {
  if (!r) return null
  const parts = [`FREQ=${r.freq === 'weekly' ? 'WEEKLY' : 'MONTHLY'}`]
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`)
  if (r.freq === 'weekly' && r.days?.length) {
    const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
    parts.push(`BYDAY=${r.days.map((d) => CODES[d]).join(',')}`)
  }
  if (r.count) parts.push(`COUNT=${r.count}`)
  else if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}T235900Z`)
  return `RRULE:${parts.join(';')}`
}
