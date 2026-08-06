import { EVENT_TYPE_LABEL, MEMBER_STATUS_LABEL, ROLE_LABEL, type PartItem, type SeasonData } from '@/domain/types'
import { isDone } from '@/domain/tasks'
import { toRRule } from '@/domain/recurrence'
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

export const PARTS_HEADER = ['Category', 'Part', 'Part number', 'Vendor', 'Qty', 'Unit', 'Line total', 'Owned'] as const

export function partsCsv(season: SeasonData): string {
  const rows: (string | number)[][] = [[...PARTS_HEADER]]
  for (const item of season.parts) {
    rows.push([
      item.category,
      item.name,
      item.partNumber,
      item.vendor,
      item.qty,
      item.unit,
      item.qty * item.unit,
      item.owned ? 'yes' : 'no',
    ])
  }
  const stillNeeded = season.parts.filter((i) => !i.owned).reduce((sum, i) => sum + i.qty * i.unit, 0)
  rows.push([])
  rows.push(['', '', '', '', '', '', stillNeeded, 'STILL NEEDED'])
  return toCsv(rows)
}

/** RFC 4180 reader: handles quoted cells containing commas, quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

/**
 * Reads a parts CSV back in. Column order follows the export, but the header is
 * matched by name so a sheet a team has rearranged still imports.
 */
export function parseParts(text: string): Omit<PartItem, 'id' | 'updatedAt'>[] {
  const rows = parseCsv(text)
  if (!rows.length) return []

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const looksLikeHeader = header.some((h) => h.includes('part') || h.includes('qty') || h.includes('name'))
  const body = looksLikeHeader ? rows.slice(1) : rows

  /**
   * With a header present, an unmatched column is *absent* — falling back to a
   * position would silently read whatever happens to sit there (a "Part" column
   * becoming the category, say). Positional defaults apply only to headerless files.
   */
  const at = (names: string[], fallback: number) => {
    if (!looksLikeHeader) return fallback
    return header.findIndex((h) => names.some((n) => h === n || h.includes(n)))
  }
  const iCategory = at(['category', 'group'], 0)
  const iName = at(['part', 'name', 'item'], 1)
  const iPn = at(['part number', 'sku', 'partnumber'], 2)
  const iVendor = at(['vendor', 'supplier'], 3)
  const iQty = at(['qty', 'quantity'], 4)
  const iUnit = at(['unit', 'price', 'cost'], 5)
  const iOwned = at(['owned', 'have'], 7)

  const cell = (row: string[], idx: number) => (idx < 0 ? '' : (row[idx] ?? '').trim())
  const num = (v: string) => {
    const parsed = Number(v.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }

  return body
    .map((r) => ({
      category: cell(r, iCategory) || 'Uncategorised',
      name: cell(r, iName),
      partNumber: cell(r, iPn),
      vendor: cell(r, iVendor),
      qty: Math.max(1, Math.round(num(cell(r, iQty)) || 1)),
      unit: num(cell(r, iUnit)),
      owned: /^(y|yes|true|1)$/i.test(cell(r, iOwned)),
    }))
    // A row with no name is a spacer or the STILL NEEDED footer, not a part.
    .filter((p) => p.name.length > 0)
}

export function rosterCsv(season: SeasonData, includeContact: boolean): string {
  const head = ['Name', 'Role', 'Subteam', 'Username', 'Status']
  if (includeContact) head.push('Email', 'Phone', 'Guardian', 'Guardian phone')
  const rows: (string | number)[][] = [head]
  for (const m of season.members) {
    const row: (string | number)[] = [
      m.name,
      ROLE_LABEL[m.role],
      (m.subteams ?? []).join(' / '),
      m.username,
      MEMBER_STATUS_LABEL[m.status],
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
    const rrule = toRRule(e.recurrence)
    if (rrule) lines.push(rrule)
    // Occurrences the team cancelled must be excluded, or the import re-creates them.
    for (const skipped of e.exceptions ?? []) lines.push(`EXDATE${icsStamp(skipped, e.time)}`)
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
 * should not carry anybody's password hash.
 */
export function backupJson(season: SeasonData): string {
  const scrubbed: SeasonData = {
    ...season,
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
  lines.push(`- Open tasks: ${season.tasks.filter((t) => !isDone(t)).length}`)
  return lines.join('\n')
}
