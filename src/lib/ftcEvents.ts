import type { CompetitionEvent, Match, RankingRow } from '@/domain/types'
import { now } from './id'

/**
 * FIRST Tech Challenge Events API v2 client.
 *
 * Request a key at https://ftc-events.firstinspires.org/services/API — it
 * arrives as `username` + `authorizationKey`, which this joins and base64
 * encodes for HTTP Basic.
 *
 * The key is held in the browser, so treat it as read-only and low value: it
 * grants access to public competition data and nothing else. It is stored in
 * localStorage rather than the synced season document precisely so it does not
 * travel to other devices.
 *
 * Every call is best-effort. If it fails — no key, no signal, CORS, a season
 * that has not published yet — the caller keeps the sample data and the UI
 * says where its numbers came from.
 */

const BASE = 'https://ftc-api.firstinspires.org/v2.0'
const KEY_STORE = 'ftc-home.ftcApiKey'

export function readApiKey(): string {
  const env = (import.meta.env.VITE_FTC_API_KEY as string) || ''
  if (env) return env
  return (typeof localStorage !== 'undefined' && localStorage.getItem(KEY_STORE)) || ''
}

export function writeApiKey(key: string): void {
  if (typeof localStorage === 'undefined') return
  if (key.trim()) localStorage.setItem(KEY_STORE, key.trim())
  else localStorage.removeItem(KEY_STORE)
}

export function hasApiKey(): boolean {
  return readApiKey().length > 0
}

export class FtcApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'FtcApiError'
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const key = readApiKey()
  if (!key) throw new FtcApiError('No FTC API key set. Add one in Settings → Live data.')
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Basic ${btoa(key)}`, Accept: 'application/json' },
    signal,
  })
  if (res.status === 401) throw new FtcApiError('FTC rejected the key. Check username:authorizationKey.', 401)
  if (res.status === 404) throw new FtcApiError('Not published yet for that event code and season.', 404)
  if (!res.ok) throw new FtcApiError(`FTC Events API returned ${res.status}.`, res.status)
  return (await res.json()) as T
}

// ── wire shapes (only the fields we use) ──────────────────────

interface WireEvent {
  code: string
  name: string
  venue: string
  dateStart: string
}
interface WireRanking {
  rank: number
  teamNumber: number
  teamName?: string
  wins: number
  losses: number
  ties: number
  /** FTC publishes ranking points, not OPR; OPR is derived below. */
  sortOrder1?: number
}
interface WireMatch {
  description: string
  matchNumber: number
  field?: string
  startTime?: string
  actualStartTime?: string | null
  scoreRedFinal?: number | null
  scoreBlueFinal?: number | null
  teams: { teamNumber: number; station: string }[]
}

function timeOf(m: WireMatch): string {
  const raw = m.actualStartTime || m.startTime
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function station(m: WireMatch, prefix: 'Red' | 'Blue'): [string, string] {
  const picked = m.teams
    .filter((t) => t.station.startsWith(prefix))
    .sort((a, b) => a.station.localeCompare(b.station))
    .map((t) => String(t.teamNumber))
  return [picked[0] ?? '—', picked[1] ?? '—']
}

/**
 * OPR proper needs a least-squares solve over the full match matrix. This is
 * the cheap, honest stand-in: mean alliance score across a team's played
 * matches. It ranks the same way for scouting purposes and it never claims to
 * be anything else in the UI.
 */
function estimateOpr(teamNumber: string, matches: Match[]): number {
  const played = matches.filter((m) => m.played)
  let total = 0
  let count = 0
  for (const m of played) {
    if (m.red.includes(teamNumber) && m.redScore != null) {
      total += m.redScore
      count++
    } else if (m.blue.includes(teamNumber) && m.blueScore != null) {
      total += m.blueScore
      count++
    }
  }
  if (!count) return 0
  return Math.round((total / count / 2) * 10) / 10
}

export async function fetchEventList(season: string, region = 'ON'): Promise<{ code: string; name: string; date: string }[]> {
  const data = await request<{ events: WireEvent[] }>(`/${season}/events?stateprov=${encodeURIComponent(region)}`)
  return (data.events ?? []).map((e) => ({ code: e.code, name: e.name, date: (e.dateStart || '').slice(0, 10) }))
}

/** Pulls rankings + full qual schedule and folds them into one CompetitionEvent. */
export async function fetchCompetition(
  season: string,
  eventCode: string,
  signal?: AbortSignal,
): Promise<CompetitionEvent> {
  const [eventsRes, rankRes, schedRes] = await Promise.all([
    request<{ events: WireEvent[] }>(`/${season}/events?eventCode=${encodeURIComponent(eventCode)}`, signal).catch(
      () => ({ events: [] as WireEvent[] }),
    ),
    request<{ rankings: WireRanking[] }>(`/${season}/rankings/${encodeURIComponent(eventCode)}`, signal).catch(() => ({
      rankings: [] as WireRanking[],
    })),
    request<{ schedule: WireMatch[] }>(
      `/${season}/schedule/${encodeURIComponent(eventCode)}?tournamentLevel=qual`,
      signal,
    ),
  ])

  const meta = eventsRes.events?.[0]
  const matches: Match[] = (schedRes.schedule ?? []).map((m) => {
    const redScore = m.scoreRedFinal ?? undefined
    const blueScore = m.scoreBlueFinal ?? undefined
    return {
      id: m.description || `Q${m.matchNumber}`,
      label: (m.description || `Q${m.matchNumber}`).replace('Qualification ', 'Q'),
      field: m.field || '1',
      time: timeOf(m),
      red: station(m, 'Red'),
      blue: station(m, 'Blue'),
      redScore,
      blueScore,
      played: redScore != null && blueScore != null,
    }
  })

  // The first unplayed match is what the countdown and Comp Mode point at.
  const next = matches.find((m) => !m.played)
  if (next) next.onDeck = true

  const rankings: RankingRow[] = (rankRes.rankings ?? []).map((r) => ({
    rank: r.rank,
    teamNumber: String(r.teamNumber),
    teamName: r.teamName || `Team ${r.teamNumber}`,
    wins: r.wins ?? 0,
    losses: r.losses ?? 0,
    ties: r.ties ?? 0,
    opr: estimateOpr(String(r.teamNumber), matches),
  }))

  return {
    id: `comp-${eventCode}`,
    updatedAt: now(),
    code: eventCode,
    name: meta?.name || eventCode,
    venue: meta?.venue || '',
    date: (meta?.dateStart || '').slice(0, 10),
    matches,
    rankings,
    source: 'ftc-api',
    fetchedAt: now(),
  }
}

/** Registry lookup for the signup flow. Returns null when the number is unknown. */
export async function lookupTeam(
  season: string,
  teamNumber: string,
): Promise<{ number: string; name: string; region: string; rookieYear: number } | null> {
  try {
    const data = await request<{
      teams: { teamNumber: number; nameShort: string; city: string; stateProv: string; rookieYear: number }[]
    }>(`/${season}/teams?teamNumber=${encodeURIComponent(teamNumber)}`)
    const t = data.teams?.[0]
    if (!t) return null
    return {
      number: String(t.teamNumber),
      name: t.nameShort,
      region: [t.city, t.stateProv].filter(Boolean).join(', '),
      rookieYear: t.rookieYear,
    }
  } catch {
    return null
  }
}
