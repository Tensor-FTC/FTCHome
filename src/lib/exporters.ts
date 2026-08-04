import { EVENT_TYPE_LABEL, ROLE_LABEL, type SeasonData } from '@/domain/types'
import { tierById } from '@/domain/parts'
import { fromIso } from './date'
import { money } from './format'

/** Export and backup. A season that cannot leave the app is a season you can lose. */

export function download(filename: string, content: BlobPart, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = globalThis.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a tick to start the download before the URL goes away.
  setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000)
}

/** RFC 4180: quote everything containing a comma, quote or newline; double inner quotes. */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export function partsCsv(season: SeasonData): string {
  const tier = tierById(season.partsTier)
  const owned = season.partsOwned[tier.id] ?? {}
  const rows: (string | number)[][] = [
    ['Group', 'Part', 'Part number', 'Vendor', 'Qty', 'Unit', 'Line total', 'Owned'],
  ]
  for (const item of tier.items) {
    rows.push([
      item.group,
      item.name,
      item.partNumber,
      item.vendor,
      item.qty,
      item.unit,
      item.qty * item.unit,
      owned[item.id] ? 'yes' : 'no',
    ])
  }
  const stillNeeded = tier.items
    .filter((i) => !owned[i.id])
    .reduce((sum, i) => sum + i.qty * i.unit, 0)
  rows.push([])
  rows.push(['', '', '', '', '', '', stillNeeded, 'STILL NEEDED'])
  return toCsv(rows)
}

export function rosterCsv(season: SeasonData, includeContact: boolean): string {
  const head = ['Name', 'Role', 'Subteam', 'Username', 'Status']
  if (includeContact) head.push('Email', 'Phone', 'Guardian', 'Guardian phone')
  const rows: (string | number)[][] = [head]
  for (const m of season.members) {
    const row: (string | number)[] = [
      m.name,
      ROLE_LABEL[m.role],
      m.subteam ?? '',
      m.username,
      m.pending ? 'invite pending' : 'active',
    ]
    if (includeContact) {
      row.push(m.contact?.email ?? '', m.contact?.phone ?? '', m.medical?.guardian ?? '', m.medical?.guardianPhone ?? '')
    }
    rows.push(row)
  }
  return toCsv(rows)
}

export function budgetCsv(season: SeasonData): string {
  const rows: (string | number)[][] = [['Sponsor', 'Tier', 'Amount', 'State', 'Logged']]
  for (const s of season.sponsors) rows.push([s.name, s.tier, s.amount, s.state, s.loggedAt.slice(0, 10)])
  rows.push([])
  rows.push(['Allocation', 'Spent', 'Cap', 'Remaining'])
  for (const a of season.allocations) rows.push([a.name, a.spent, a.cap, a.cap - a.spent])
  rows.push([])
  rows.push(['Approval', 'Amount', 'State', 'Requested'])
  for (const a of season.approvals) rows.push([a.title, a.amount, a.state, a.requestedAt.slice(0, 10)])
  return toCsv(rows)
}

// ── iCalendar ───────────────────────────────────────────────

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** Lines over 75 octets must be folded, or Outlook silently drops the event. */
function fold(line: string): string {
  if (line.length <= 74) return line
  const parts: string[] = [line.slice(0, 74)]
  let rest = line.slice(74)
  while (rest.length > 73) {
    parts.push(' ' + rest.slice(0, 73))
    rest = rest.slice(73)
  }
  if (rest) parts.push(' ' + rest)
  return parts.join('\r\n')
}

function icsStamp(iso: string, time: string): string {
  const d = fromIso(iso)
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) {
    // All-day: DATE value, no time.
    return `;VALUE=DATE:${iso.replace(/-/g, '')}`
  }
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}

export function calendarIcs(season: SeasonData): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FTC Home//Season Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:FTC ${season.team.number} ${season.team.name}`),
  ]
  for (const e of season.events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.id}@ftc-home`)
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`)
    lines.push(`DTSTART${icsStamp(e.date, e.time)}`)
    if (e.endTime) lines.push(`DTEND${icsStamp(e.date, e.endTime)}`)
    lines.push(fold(`SUMMARY:${icsEscape(e.title)}`))
    if (e.location) lines.push(fold(`LOCATION:${icsEscape(e.location)}`))
    const description = [e.notes, `Type: ${EVENT_TYPE_LABEL[e.type]}`].filter(Boolean).join('\n')
    if (description) lines.push(fold(`DESCRIPTION:${icsEscape(description)}`))
    if (e.repeatWeeklyUntil) {
      lines.push(`RRULE:FREQ=WEEKLY;UNTIL=${e.repeatWeeklyUntil.replace(/-/g, '')}T235900Z`)
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

// ── full backup ─────────────────────────────────────────────

export interface SeasonBackup {
  format: 'ftc-home.season'
  version: 1
  exportedAt: string
  season: SeasonData
}

/**
 * Backups deliberately omit credential verifiers. A file a team emails around
 * should not carry the team code or anybody's password hash.
 */
export function backupJson(season: SeasonData): string {
  const scrubbed: SeasonData = {
    ...season,
    team: { ...season.team, code: null },
    members: season.members.map((m) => ({ ...m, password: null })),
  }
  const payload: SeasonBackup = {
    format: 'ftc-home.season',
    version: 1,
    exportedAt: new Date().toISOString(),
    season: scrubbed,
  }
  return JSON.stringify(payload, null, 2)
}

export function parseBackup(text: string): SeasonData {
  const parsed = JSON.parse(text) as Partial<SeasonBackup>
  if (parsed?.format !== 'ftc-home.season') {
    throw new Error('Not an FTC Home backup file.')
  }
  if (parsed.version !== 1) {
    throw new Error(`Backup version ${String(parsed.version)} is newer than this app understands.`)
  }
  if (!parsed.season?.team?.number) throw new Error('Backup is missing its team record.')
  return parsed.season
}

/** Weekly dashboard as plain markdown, for pasting into an email to parents. */
export function weeklyMarkdown(season: SeasonData, weekId: string): string {
  const w = season.weekly.find((r) => r.id === weekId)
  if (!w) return ''
  const lines = [
    `# ${season.team.number} ${season.team.name} — Week ${w.week}`,
    '',
    `${w.from} to ${w.to}`,
    '',
    w.summary,
    '',
  ]
  if (w.shoutouts.length) {
    lines.push('## Shoutouts', '')
    for (const s of w.shoutouts) lines.push(`- **${s.who}** ${s.text}`)
    lines.push('')
  }
  const raised = season.sponsors.reduce((sum, s) => sum + s.amount, 0)
  lines.push('## Season', '', `- Raised: ${money(raised)} of ${money(season.team.goal)}`)
  lines.push(`- Roster: ${season.members.length}`)
  lines.push(`- Open tasks: ${season.tasks.filter((t) => !t.done).length}`)
  return lines.join('\n')
}
