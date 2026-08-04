/**
 * Date helpers. Everything stored is an ISO `YYYY-MM-DD` string in the team's
 * local timezone — a build session on Nov 15 is Nov 15 regardless of where the
 * phone thinks it is, and that matters more here than instant precision.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parses `YYYY-MM-DD` as a *local* date, avoiding the UTC-shift trap of `new Date(str)`. */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function isValidIso(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(fromIso(iso).getTime())
}

export function today(): string {
  return toIso(new Date())
}

export function dayNum(iso: string): string {
  return String(fromIso(iso).getDate()).padStart(2, '0')
}

export function monShort(iso: string): string {
  return MONTHS[fromIso(iso).getMonth()]
}

export function monthLong(year: number, monthIndex: number): string {
  return `${MONTHS_LONG[monthIndex]} ${year}`
}

export function dayShort(iso: string): string {
  return DAYS[fromIso(iso).getDay()]
}

/** "SAT · NOV 15" */
export function longStamp(iso: string): string {
  const d = fromIso(iso)
  return `${DAYS[d.getDay()].toUpperCase()} · ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** "Sat Nov 29" */
export function prettyDate(iso: string): string {
  const d = fromIso(iso)
  return `${DAYS[d.getDay()]} ${MONTHS_LONG[d.getMonth()].slice(0, 3)} ${d.getDate()}`
}

/** "Nov 9 – Nov 15" */
export function range(fromIsoStr: string, toIsoStr: string): string {
  const a = fromIso(fromIsoStr)
  const b = fromIso(toIsoStr)
  const am = MONTHS_LONG[a.getMonth()].slice(0, 3)
  const bm = MONTHS_LONG[b.getMonth()].slice(0, 3)
  return `${am} ${a.getDate()} – ${bm} ${b.getDate()}`
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso)
  d.setDate(d.getDate() + days)
  return toIso(d)
}

export function daysBetween(fromIsoStr: string, toIsoStr: string): number {
  const ms = fromIso(toIsoStr).getTime() - fromIso(fromIsoStr).getTime()
  return Math.round(ms / 86_400_000)
}

/** Monday-based week start; FTC teams talk in build weeks, not calendar weeks. */
export function weekStart(iso: string): string {
  const d = fromIso(iso)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return toIso(d)
}

/** Season week number, counting from the season's kickoff date. */
export function seasonWeek(iso: string, kickoff: string): number {
  return Math.max(1, Math.floor(daysBetween(kickoff, iso) / 7) + 1)
}

/**
 * The 6×7 grid for a month view, padded out with the neighbouring months so the
 * grid never jumps height between months.
 */
export function monthGrid(year: number, monthIndex: number): { iso: string; inMonth: boolean }[] {
  const first = new Date(year, monthIndex, 1)
  const startOffset = first.getDay()
  const cells: { iso: string; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, monthIndex, 1 - startOffset + i)
    cells.push({ iso: toIso(d), inMonth: d.getMonth() === monthIndex })
  }
  return cells
}

/** "10:00" → minutes since midnight, for ordering a day's agenda. */
export function timeToMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return Number.MAX_SAFE_INTEGER
  return Number(m[1]) * 60 + Number(m[2])
}

export function isPast(iso: string, time = ''): boolean {
  if (!isValidIso(iso)) return false
  const d = fromIso(iso)
  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const [h, min] = time.split(':').map(Number)
    d.setHours(h, min)
  } else {
    d.setHours(23, 59, 59)
  }
  return d.getTime() < Date.now()
}

/** Relative due label used across tasks: "2d late", "Nov 26", "today". */
export function dueLabel(iso: string, from = today()): { text: string; late: boolean } {
  if (!iso || !isValidIso(iso)) return { text: 'no date', late: false }
  const delta = daysBetween(from, iso)
  if (delta < 0) return { text: `${Math.abs(delta)}d late`, late: true }
  if (delta === 0) return { text: 'today', late: false }
  if (delta === 1) return { text: 'tomorrow', late: false }
  return { text: `${monShort(iso).charAt(0)}${monShort(iso).slice(1, 3).toLowerCase()} ${fromIso(iso).getDate()}`, late: false }
}
