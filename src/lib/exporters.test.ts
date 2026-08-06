import { describe, expect, it } from 'vitest'
import { backupJson, calendarIcs, parseBackup, parseParts, partsCsv, rosterCsv, toCsv } from './exporters'
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
    const withParts = {
      ...season,
      parts: [
        { id: 'p1', updatedAt: '', name: 'Control Hub', partNumber: 'REV-31-1595', vendor: 'REV', category: 'Control', qty: 1, unit: 299, owned: true },
        { id: 'p2', updatedAt: '', name: 'Servo', partNumber: 'S-1', vendor: 'goBILDA', category: 'Manipulator', qty: 4, unit: 24, owned: false },
      ],
    }
    const csv = partsCsv(withParts)
    expect(csv).toContain('REV-31-1595')
    expect(csv).toContain('yes')
    expect(csv).toContain('STILL NEEDED')
    // 4 x 24, with the owned hub excluded.
    expect(csv).toContain('96')
  })

  it('round-trips parts through export and import', () => {
    const parts = [
      { id: 'p1', updatedAt: '', name: 'Yellow Jacket, 312 RPM', partNumber: '5203-2402-0019', vendor: 'goBILDA', category: 'Drivetrain', qty: 4, unit: 44, owned: false },
      { id: 'p2', updatedAt: '', name: 'Control Hub', partNumber: 'REV-31-1595', vendor: 'REV', category: 'Control', qty: 1, unit: 299, owned: true },
    ]
    const reimported = parseParts(partsCsv({ ...season, parts }))
    expect(reimported).toHaveLength(2)
    // The comma inside the part name must survive the quoting round trip.
    expect(reimported[0]).toMatchObject({ name: 'Yellow Jacket, 312 RPM', qty: 4, unit: 44, owned: false })
    expect(reimported[1]).toMatchObject({ name: 'Control Hub', owned: true })
  })

  it('imports a vendor CSV whose columns are in a different order', () => {
    const csv = ['Part,Qty,Unit,Vendor', 'Servo,6,24,goBILDA'].join('\r\n')
    expect(parseParts(csv)).toEqual([
      { category: 'Uncategorised', name: 'Servo', partNumber: '', vendor: 'goBILDA', qty: 6, unit: 24, owned: false },
    ])
  })

  it('tolerates currency symbols and blank quantities', () => {
    const csv = ['Category,Part,Part number,Vendor,Qty,Unit', 'Kit,Widget,W-1,Acme,,"$1,299.50"'].join('\r\n')
    const [part] = parseParts(csv)
    expect(part.unit).toBe(1299.5)
    expect(part.qty).toBe(1)
  })

  it('drops the STILL NEEDED footer and spacer rows on import', () => {
    const parts = [{ id: 'p1', updatedAt: '', name: 'Only part', partNumber: '', vendor: '', category: 'Kit', qty: 1, unit: 10, owned: false }]
    expect(parseParts(partsCsv({ ...season, parts }))).toHaveLength(1)
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

  it('strips password verifiers, so a file a team emails around leaks nobody', async () => {
    const { hashPassword } = await import('./crypto')
    const withSecrets = {
      ...season,
      members: [{ ...season.members[0], password: await hashPassword('personal') }, ...season.members.slice(1)],
    }
    const json = backupJson(withSecrets)
    expect(json).not.toContain('PBKDF2')

    const restored = parseBackup(json)
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
