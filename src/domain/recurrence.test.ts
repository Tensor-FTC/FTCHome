import { describe, expect, it } from 'vitest'
import { describeRecurrence, expandEvent, occurrenceId, parseOccurrenceId, toRRule } from './recurrence'
import type { CalendarEvent } from './types'

function event(patch: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    title: 'Build session',
    // 2026-01-06 is a Tuesday.
    date: '2026-01-06',
    time: '17:00',
    type: 'meet',
    ...patch,
  }
}

const dates = (occ: { date: string }[]) => occ.map((o) => o.date)

describe('recurrence', () => {
  it('returns the single date for a one-off inside the window, nothing outside', () => {
    expect(dates(expandEvent(event(), '2026-01-01', '2026-01-31'))).toEqual(['2026-01-06'])
    expect(expandEvent(event(), '2026-02-01', '2026-02-28')).toEqual([])
  })

  it('repeats weekly on the day it starts when no days are given', () => {
    const e = event({ recurrence: { freq: 'weekly', interval: 1, count: 4 } })
    expect(dates(expandEvent(e, '2026-01-01', '2026-03-01'))).toEqual([
      '2026-01-06',
      '2026-01-13',
      '2026-01-20',
      '2026-01-27',
    ])
  })

  it('handles the two-days-a-week case the old model could not express', () => {
    // Tuesdays and Thursdays for three weeks.
    const e = event({ recurrence: { freq: 'weekly', interval: 1, days: [2, 4], count: 6 } })
    expect(dates(expandEvent(e, '2026-01-01', '2026-03-01'))).toEqual([
      '2026-01-06',
      '2026-01-08',
      '2026-01-13',
      '2026-01-15',
      '2026-01-20',
      '2026-01-22',
    ])
  })

  it('never emits before the series starts, even when an earlier weekday is selected', () => {
    // Monday is selected but the series starts on a Tuesday.
    const e = event({ recurrence: { freq: 'weekly', interval: 1, days: [1, 2], count: 3 } })
    const out = dates(expandEvent(e, '2025-12-01', '2026-02-01'))
    expect(out[0]).toBe('2026-01-06')
    expect(out.every((d) => d >= '2026-01-06')).toBe(true)
  })

  it('skips weeks for an every-other-week rule', () => {
    const e = event({ recurrence: { freq: 'weekly', interval: 2, count: 3 } })
    expect(dates(expandEvent(e, '2026-01-01', '2026-03-01'))).toEqual([
      '2026-01-06',
      '2026-01-20',
      '2026-02-03',
    ])
  })

  it('stops on the until date', () => {
    const e = event({ recurrence: { freq: 'weekly', interval: 1, until: '2026-01-20' } })
    expect(dates(expandEvent(e, '2026-01-01', '2026-06-01'))).toEqual([
      '2026-01-06',
      '2026-01-13',
      '2026-01-20',
    ])
  })

  it('leaves out cancelled dates without ending the series', () => {
    const e = event({
      recurrence: { freq: 'weekly', interval: 1, count: 4 },
      exceptions: ['2026-01-13'],
    })
    expect(dates(expandEvent(e, '2026-01-01', '2026-03-01'))).toEqual([
      '2026-01-06',
      '2026-01-20',
      '2026-01-27',
    ])
  })

  it('clamps a monthly rule so the 31st does not skip February', () => {
    const e = event({ date: '2026-01-31', recurrence: { freq: 'monthly', interval: 1, count: 3 } })
    expect(dates(expandEvent(e, '2026-01-01', '2026-06-01'))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ])
  })

  it('bounds the walk by the window, so one month never iterates a season', () => {
    const e = event({ recurrence: { freq: 'weekly', interval: 1 } })
    const out = expandEvent(e, '2026-02-01', '2026-02-28')
    expect(out.length).toBeLessThanOrEqual(5)
    expect(out.every((o) => o.date >= '2026-02-01' && o.date <= '2026-02-28')).toBe(true)
  })

  it('addresses one instance of a series and reads it back', () => {
    const repeating = event({ recurrence: { freq: 'weekly', interval: 1 } })
    const id = occurrenceId(repeating, '2026-01-20')
    expect(id).toBe('e1@2026-01-20')
    expect(parseOccurrenceId(id)).toEqual({ eventId: 'e1', date: '2026-01-20' })
    // A one-off is addressed by its plain id, so existing links keep working.
    expect(occurrenceId(event(), '2026-01-06')).toBe('e1')
    expect(parseOccurrenceId('e1')).toEqual({ eventId: 'e1' })
  })

  it('describes a rule the way a coach would say it', () => {
    expect(describeRecurrence(undefined)).toBe('Does not repeat')
    expect(describeRecurrence({ freq: 'weekly', interval: 1, days: [2, 4], count: 6 })).toBe(
      'Weekly on Tue, Thu, 6 times',
    )
    expect(describeRecurrence({ freq: 'weekly', interval: 2 })).toBe('Every 2 weeks')
  })

  it('writes an RRULE calendars can import', () => {
    expect(toRRule(undefined)).toBeNull()
    expect(toRRule({ freq: 'weekly', interval: 1, days: [2, 4], count: 6 })).toBe(
      'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6',
    )
    expect(toRRule({ freq: 'monthly', interval: 2, until: '2026-06-30' })).toBe(
      'RRULE:FREQ=MONTHLY;INTERVAL=2;UNTIL=20260630T235900Z',
    )
  })
})
