import { describe, expect, it } from 'vitest'
import { backupJson, calendarIcs, parseBackup, partsCsv, rosterCsv, toCsv } from './exporters'
import { fixtureSeason } from '@/test/fixtures'

const season = fixtureSeason('2026-01-10')

describe('CSV', () => {
  it('quotes cells containing commas, quotes and newlines', () => {
    const csv = toCsv([['plain', 'has,comma', 'has"quote', 'has\nnewline']])
    expect(csv).toBe('plain,"has,comma","has""quote","has\nnewline"')
  })

  it('uses CRLF row endings, which is what Excel expects', () => {
    expect(toCsv([['a'], ['b']])).toBe('a\r\nb')
  })

  it('keeps owned parts in the export so it stays a complete bill of materials', () => {
    const withOwned = { ...season, partsOwned: { ...season.partsOwned, rookie: { 'Control:REV-31-1595': true } } }
    const csv = partsCsv(withOwned)
    expect(csv).toContain('REV-31-1595')
    expect(csv).toContain('yes')
    expect(csv).toContain('STILL NEEDED')
  })

  it('omits contact columns entirely when the exporter is not allowed them', () => {
    const gated = rosterCsv(season, false)
    expect(gated).not.toContain('Guardian')
    expect(gated).not.toContain('@example.org')

    const full = rosterCsv(season, true)
    expect(full).toContain('Guardian')
  })
})

describe('iCalendar', () => {
  const ics = calendarIcs(season)

  it('produces a parseable calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    const begins = ics.match(/BEGIN:VEVENT/g)?.length ?? 0
    const ends = ics.match(/END:VEVENT/g)?.length ?? 0
    expect(begins).toBe(ends)
    expect(begins).toBe(season.events.length)
  })

  it('emits an all-day DATE value for events with no clock time', () => {
    // The "Motors ETA" deadline has time "—".
    expect(ics).toContain('DTSTART;VALUE=DATE:')
  })

  it('escapes commas and semicolons so a title cannot break the format', () => {
    const tricky = {
      ...season,
      events: [{ ...season.events[0], title: 'Build; session, shop', notes: 'a,b;c' }],
    }
    const out = calendarIcs(tricky)
    expect(out).toContain('SUMMARY:Build\\; session\\, shop')
  })

  it('folds lines over 75 octets rather than emitting them long', () => {
    const long = {
      ...season,
      events: [{ ...season.events[0], title: 'x'.repeat(200) }],
    }
    const lines = calendarIcs(long).split('\r\n')
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(75)
  })

  it('writes an RRULE for a weekly build session', () => {
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=')
  })
})

describe('backup', () => {
  it('round-trips a season', () => {
    const restored = parseBackup(backupJson(season))
    expect(restored.team.number).toBe(season.team.number)
    expect(restored.members).toHaveLength(season.members.length)
    expect(restored.events).toHaveLength(season.events.length)
  })

  it('strips credentials so a shared file leaks neither the team code nor a password', async () => {
    const { hashPassword } = await import('./crypto')
    const withSecrets = {
      ...season,
      team: { ...season.team, code: await hashPassword('team-code') },
      members: [{ ...season.members[0], password: await hashPassword('personal') }, ...season.members.slice(1)],
    }
    const json = backupJson(withSecrets)
    expect(json).not.toContain('PBKDF2')

    const restored = parseBackup(json)
    expect(restored.team.code).toBeNull()
    expect(restored.members.every((m) => m.password === null)).toBe(true)
  })

  it('keeps the team identity that came from FTCScout', () => {
    const restored = parseBackup(backupJson(season))
    expect(restored.team.number).toBe('11138')
    expect(restored.team.city).toBe('Bellevue')
    expect(restored.team.state).toBe('WA')
    expect(restored.team.region).toBe('USWA')
  })

  it('refuses a file that is not one of ours, with a reason', () => {
    expect(() => parseBackup('{"format":"something-else"}')).toThrow(/not an ftc home backup/i)
    expect(() => parseBackup(JSON.stringify({ format: 'ftc-home.season', version: 99 }))).toThrow(/newer/i)
  })
})
