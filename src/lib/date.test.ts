import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, dueLabel, fromIso, isValidIso, monthGrid, seasonWeek, toIso, weekStart } from './date'

describe('local-date handling', () => {
  it('parses ISO dates in local time, not UTC', () => {
    // `new Date('2026-03-01')` is midnight UTC, which is Feb 28 in the Americas.
    // A build session on Mar 1 has to stay on Mar 1.
    const d = fromIso('2026-03-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(1)
  })

  it('round-trips through toIso', () => {
    expect(toIso(fromIso('2026-11-15'))).toBe('2026-11-15')
  })

  it('validates shape', () => {
    expect(isValidIso('2026-11-15')).toBe(true)
    expect(isValidIso('2026-11-5')).toBe(false)
    expect(isValidIso('nov 15')).toBe(false)
  })

  it('crosses month and year boundaries when adding days', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts days across a DST boundary without drifting', () => {
    // North American DST begins 2026-03-08; a naive ms/86400000 gives 6.958.
    expect(daysBetween('2026-03-05', '2026-03-12')).toBe(7)
  })

  it('starts weeks on Monday', () => {
    expect(weekStart('2026-08-05')).toBe('2026-08-03') // Wednesday -> Monday
    expect(weekStart('2026-08-03')).toBe('2026-08-03')
    expect(weekStart('2026-08-09')).toBe('2026-08-03') // Sunday belongs to the week just ending
  })

  it('numbers build weeks from kickoff, starting at one', () => {
    expect(seasonWeek('2026-01-05', '2026-01-05')).toBe(1)
    expect(seasonWeek('2026-01-11', '2026-01-05')).toBe(1)
    expect(seasonWeek('2026-01-12', '2026-01-05')).toBe(2)
    // Never zero or negative, even if something is dated before kickoff.
    expect(seasonWeek('2025-12-01', '2026-01-05')).toBe(1)
  })

  it('always builds a 42-cell month grid so the layout cannot jump height', () => {
    for (const month of [0, 1, 5, 11]) {
      const grid = monthGrid(2026, month)
      expect(grid).toHaveLength(42)
      expect(grid.filter((c) => c.inMonth).length).toBeGreaterThan(27)
    }
  })

  it('labels due dates relative to today', () => {
    expect(dueLabel('2026-08-01', '2026-08-03')).toEqual({ text: '2d late', late: true })
    expect(dueLabel('2026-08-03', '2026-08-03')).toEqual({ text: 'today', late: false })
    expect(dueLabel('2026-08-04', '2026-08-03')).toEqual({ text: 'tomorrow', late: false })
    expect(dueLabel('', '2026-08-03')).toEqual({ text: 'no date', late: false })
  })
})
