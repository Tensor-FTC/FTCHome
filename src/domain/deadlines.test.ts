import { beforeEach, describe, expect, it } from 'vitest'
import { dueSoon } from './deadlines'
import { announceDeadlines, resetDeadlineAlerts } from '@/lib/notifications'
import { fixtureSeason } from '@/test/fixtures'
import { addDays, fromIso, today } from '@/lib/date'
import type { SeasonData } from './types'

/**
 * The window is the point. A deadline two weeks out is not news, one that has
 * already gone is not actionable, and a finished task is neither — so the only
 * thing worth interrupting somebody about is an open, dated thing inside the
 * next couple of days.
 */
describe('dueSoon', () => {
  const anchor = today()
  const noonToday = (() => {
    const d = fromIso(anchor)
    d.setHours(12, 0, 0, 0)
    return d.getTime()
  })()

  function season(): SeasonData {
    const s = fixtureSeason(anchor)
    // The fixture's own tasks carry dates around the anchor; start from a
    // clean slate so each case says exactly what it is testing.
    s.tasks = []
    s.events = []
    return s
  }

  function deadline(s: SeasonData, title: string, date: string, time = '') {
    s.events.push({ id: `ev-${title}`, updatedAt: '2026-01-01T00:00:00.000Z', title, date, time, type: 'dead', source: 'local' })
  }

  it('names a deadline due tomorrow', () => {
    const s = season()
    deadline(s, 'Notebook submission', addDays(anchor, 1))
    expect(dueSoon(s, noonToday).map((d) => d.title)).toEqual(['Notebook submission'])
  })

  it('leaves out one that is still a week away', () => {
    const s = season()
    deadline(s, 'Far off', addDays(anchor, 7))
    expect(dueSoon(s, noonToday)).toHaveLength(0)
  })

  it('leaves out one that has already gone', () => {
    const s = season()
    deadline(s, 'Missed it', addDays(anchor, -1))
    expect(dueSoon(s, noonToday)).toHaveLength(0)
  })

  it('ignores build sessions and competitions, which are not deadlines', () => {
    const s = season()
    s.events.push({ id: 'ev-build', updatedAt: '2026-01-01T00:00:00.000Z', title: 'Build session', date: addDays(anchor, 1), time: '18:00', type: 'meet', source: 'local' })
    expect(dueSoon(s, noonToday)).toHaveLength(0)
  })

  it('includes an open task due tomorrow', () => {
    const s = season()
    s.tasks.push({ id: 'task-1', updatedAt: '2026-01-01T00:00:00.000Z', name: 'Order motors', due: addDays(anchor, 1), status: 'todo' })
    expect(dueSoon(s, noonToday).map((d) => d.title)).toEqual(['Order motors'])
  })

  it('says nothing about a task that is already done', () => {
    const s = season()
    s.tasks.push({ id: 'task-1', updatedAt: '2026-01-01T00:00:00.000Z', name: 'Order motors', due: addDays(anchor, 1), status: 'done' })
    expect(dueSoon(s, noonToday)).toHaveLength(0)
  })

  it('says nothing about an archived deadline', () => {
    const s = season()
    deadline(s, 'Filed away', addDays(anchor, 1))
    s.events[0].archivedAt = '2026-01-01T00:00:00.000Z'
    expect(dueSoon(s, noonToday)).toHaveLength(0)
  })

  it('gives a deadline with no time the whole of its own day', () => {
    const s = season()
    deadline(s, 'End of today', anchor)
    // Noon, with the deadline dated today: still due, because "today" means
    // the end of today rather than the moment the app was opened.
    expect(dueSoon(s, noonToday).map((d) => d.title)).toEqual(['End of today'])
  })

  it('drops one whose time has passed, even though the date has not', () => {
    const s = season()
    deadline(s, 'Nine in the morning', anchor, '09:00')
    expect(dueSoon(s, noonToday)).toHaveLength(0)
  })

  it('orders by date, soonest first', () => {
    const s = season()
    deadline(s, 'Second', addDays(anchor, 1))
    deadline(s, 'First', anchor)
    expect(dueSoon(s, noonToday).map((d) => d.title)).toEqual(['First', 'Second'])
  })

  it('stops at the end of the window rather than counting whole days', () => {
    // Two days out, end of day, is past 48 hours from noon — and a window that
    // rounded up to "three sleeps away" would be paging people about nothing.
    const s = season()
    deadline(s, 'Just outside', addDays(anchor, 2))
    expect(dueSoon(s, noonToday)).toHaveLength(0)
  })
})

/**
 * A deadline sits inside its window for two days and the app is opened a dozen
 * times in that period. An alert that fires on every open is one people learn
 * to swipe away, which is the failure the whole alert design exists to avoid.
 */
describe('announceDeadlines', () => {
  beforeEach(() => resetDeadlineAlerts())

  const item = { key: 'task:1:2026-03-02', title: 'Order motors', whenLabel: 'tomorrow' }

  it('announces something it has not seen', () => {
    expect(announceDeadlines([item])).toEqual([item.key])
  })

  it('stays quiet the second time, including after a reload', () => {
    announceDeadlines([item])
    expect(announceDeadlines([item])).toEqual([])
  })

  it('still announces a different deadline', () => {
    announceDeadlines([item])
    const other = { key: 'task:2:2026-03-02', title: 'Cut channel', whenLabel: 'today' }
    expect(announceDeadlines([other])).toEqual([other.key])
  })

  it('forgets a deadline old enough that it cannot be due again', () => {
    const long_ago = Date.parse('2026-01-01T00:00:00.000Z')
    announceDeadlines([item], long_ago)
    // Three weeks later the record is pruned, so the same key is new again.
    expect(announceDeadlines([item], long_ago + 21 * 24 * 60 * 60 * 1000)).toEqual([item.key])
  })
})
