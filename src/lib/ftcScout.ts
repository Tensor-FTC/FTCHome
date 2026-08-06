import { cacheGet, cachePut } from './idb'

/**
 * FTCScout API client — https://ftcscout.org
 *
 * Every factual number in this app comes from here: team identity, event
 * schedules, match results, rankings and OPR. Nothing about a real team or a
 * real event is authored locally.
 *
 * No API key, and the service sends permissive CORS headers, so this works from
 * the browser with zero setup. Responses are cached in IndexedDB and served
 * stale when there is no signal, which is what makes the gym case hold.
 *
 * Routes verified against ftc-scout/ftc-scout `packages/server/src/rest/v1`.
 */

const REST = 'https://api.ftcscout.org/rest/v1'
const GRAPHQL = 'https://api.ftcscout.org/graphql'

/** Seasons the upstream API accepts. `Season` is the game's start year. */
export const SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025] as const
export type Season = (typeof SEASONS)[number]
export const CURRENT_SEASON: Season = 2025

export const SEASON_NAMES: Record<Season, string> = {
  2019: 'Skystone',
  2020: 'Ultimate Goal',
  2021: 'Freight Frenzy',
  2022: 'Power Play',
  2023: 'Center Stage',
  2024: 'Into The Deep',
  2025: 'Decode',
}

/**
 * Region options accepted by the API. US regions first and `UnitedStates` as the
 * default, which is where the overwhelming majority of FTC teams are.
 */
export const US_REGIONS = [
  'USAK', 'USAL', 'USAR', 'USARL', 'USAZ', 'USCALA', 'USCALS', 'USCANO', 'USCASD', 'USCHS',
  'USCO', 'USCT', 'USDE', 'USFL', 'USGA', 'USHI', 'USIA', 'USID', 'USIL', 'USIN', 'USKY',
  'USLA', 'USMA', 'USMD', 'USMI', 'USMN', 'USMOKS', 'USMS', 'USMT', 'USNC', 'USND', 'USNE',
  'USNH', 'USNJ', 'USNM', 'USNV', 'USNYEX', 'USNYLI', 'USNYNY', 'USOH', 'USOK', 'USOR',
  'USPA', 'USRI', 'USSC', 'USTN', 'USTXCE', 'USTXHO', 'USTXNO', 'USTXSO', 'USTXWP', 'USUT',
  'USVA', 'USVT', 'USWA', 'USWI', 'USWV', 'USWY',
] as const

export const INTERNATIONAL_REGIONS = [
  'AU', 'BR', 'CAAB', 'CABC', 'CAON', 'CAQC', 'CN', 'CY', 'DE', 'EG', 'ES', 'FR', 'GB',
  'IL', 'IN', 'JM', 'KR', 'KZ', 'LY', 'MX', 'NG', 'NL', 'NZ', 'QA', 'RO', 'RU', 'SA',
  'TH', 'TW', 'ZA',
] as const

export const REGION_GROUPS = ['UnitedStates', 'International', 'All'] as const

export type Region = (typeof US_REGIONS)[number] | (typeof INTERNATIONAL_REGIONS)[number] | (typeof REGION_GROUPS)[number]

export const DEFAULT_REGION: Region = 'UnitedStates'

/** US state / Canadian province → the API's region code, for the states that map 1:1. */
const STATE_TO_REGION: Record<string, Region> = {
  AK: 'USAK', AL: 'USAL', AR: 'USAR', AZ: 'USAZ', CO: 'USCO', CT: 'USCT', DE: 'USDE',
  FL: 'USFL', GA: 'USGA', HI: 'USHI', IA: 'USIA', ID: 'USID', IL: 'USIL', IN: 'USIN',
  KY: 'USKY', LA: 'USLA', MA: 'USMA', MD: 'USMD', MI: 'USMI', MN: 'USMN', MS: 'USMS',
  MT: 'USMT', NC: 'USNC', ND: 'USND', NE: 'USNE', NH: 'USNH', NJ: 'USNJ', NM: 'USNM',
  NV: 'USNV', OH: 'USOH', OK: 'USOK', OR: 'USOR', PA: 'USPA', RI: 'USRI', SC: 'USSC',
  TN: 'USTN', UT: 'USUT', VA: 'USVA', VT: 'USVT', WA: 'USWA', WI: 'USWI', WV: 'USWV',
  WY: 'USWY',
  AB: 'CAAB', BC: 'CABC', ON: 'CAON', QC: 'CAQC',
}

/**
 * Best-effort region for a team's home state. California, New York and Texas are
 * split into sub-regions upstream, so those fall back to the umbrella option
 * rather than guessing which half of the state a city is in.
 */
export function regionForState(country: string | undefined, state: string | undefined): Region {
  if (!state) return DEFAULT_REGION
  const key = state.trim().toUpperCase()
  if (key === 'CA' && country === 'USA') return 'USCA' as Region
  if (key === 'NY' && country === 'USA') return 'USNY' as Region
  if (key === 'TX' && country === 'USA') return 'USTX' as Region
  return STATE_TO_REGION[key] ?? DEFAULT_REGION
}

export function regionLabel(region: Region): string {
  if (region === 'UnitedStates') return 'United States'
  if (region === 'International') return 'International'
  if (region === 'All') return 'All regions'
  return region
}

export class FtcScoutError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly servedFromCache = false,
  ) {
    super(message)
    this.name = 'FtcScoutError'
  }
}

// ── transport ───────────────────────────────────────────────

/**
 * How long to wait before giving up and using the cache.
 *
 * A dead network *rejects*, which the catch below already handles. A venue's
 * captive portal does something worse: it accepts the connection and then never
 * answers, so the promise stays pending forever, the cached copy is never
 * served, and the screen sits on a spinner for the rest of the competition.
 * Ten seconds is longer than a slow gym needs and shorter than anybody's
 * patience.
 */
const REQUEST_TIMEOUT_MS = 10_000

function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

/**
 * Fetch with an IndexedDB cache. On a network failure the cached copy is served
 * and flagged, so screens can say "as of 41 minutes ago" instead of going blank.
 */
async function cached<T>(key: string, url: string, ttlMs = 5 * 60_000): Promise<{ data: T; stale: boolean; at: string }> {
  const hit = await cacheGet<T>(key)
  const fresh = hit && Date.now() - new Date(hit.at).getTime() < ttlMs

  if (fresh) return { data: hit.data, stale: false, at: hit.at }

  try {
    const res = await timedFetch(url, { headers: { accept: 'application/json' } })
    if (res.status === 404) throw new FtcScoutError('Not found in the FTCScout index.', 404)
    if (!res.ok) throw new FtcScoutError(`FTCScout returned ${res.status}.`, res.status)
    const data = (await res.json()) as T
    const at = new Date().toISOString()
    await cachePut(key, data, at)
    return { data, stale: false, at }
  } catch (err) {
    if (hit) return { data: hit.data, stale: true, at: hit.at }
    if (err instanceof FtcScoutError) throw err
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    throw new FtcScoutError(
      timedOut
        ? 'FTCScout did not answer in time, and nothing is cached yet. Venue wifi often does this.'
        : 'Could not reach FTCScout, and nothing is cached yet.',
    )
  }
}

async function graphql<T>(query: string, key: string, ttlMs = 5 * 60_000): Promise<{ data: T; stale: boolean; at: string }> {
  const hit = await cacheGet<T>(key)
  if (hit && Date.now() - new Date(hit.at).getTime() < ttlMs) return { data: hit.data, stale: false, at: hit.at }

  try {
    const res = await timedFetch(GRAPHQL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ query }),
    })
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] }
    if (body.errors?.length) throw new FtcScoutError(body.errors[0].message, res.status)
    if (!body.data) throw new FtcScoutError('FTCScout returned no data.')
    const at = new Date().toISOString()
    await cachePut(key, body.data, at)
    return { data: body.data, stale: false, at }
  } catch (err) {
    if (hit) return { data: hit.data, stale: true, at: hit.at }
    if (err instanceof FtcScoutError) throw err
    const timedOut = err instanceof DOMException && err.name === 'AbortError'
    throw new FtcScoutError(
      timedOut
        ? 'FTCScout did not answer in time, and nothing is cached yet. Venue wifi often does this.'
        : 'Could not reach FTCScout, and nothing is cached yet.',
    )
  }
}

// ── teams ───────────────────────────────────────────────────

export interface ScoutTeam {
  number: number
  name: string
  schoolName: string
  sponsors: string[]
  country: string
  state: string
  city: string
  rookieYear: number
  website: string | null
}

export async function getTeam(number: string | number): Promise<{ team: ScoutTeam; stale: boolean; at: string }> {
  const n = String(number).replace(/\D/g, '')
  const { data, stale, at } = await cached<ScoutTeam>(`team:${n}`, `${REST}/teams/${n}`, 24 * 60 * 60_000)
  return { team: data, stale, at }
}

export async function searchTeams(searchText: string, region: Region = DEFAULT_REGION, limit = 20): Promise<ScoutTeam[]> {
  const params = new URLSearchParams({ region, limit: String(limit) })
  if (searchText.trim()) params.set('searchText', searchText.trim())
  const { data } = await cached<ScoutTeam[]>(
    `teamsearch:${region}:${searchText}:${limit}`,
    `${REST}/teams/search?${params}`,
  )
  return data
}

/** Season-wide percentile stats: total, auto, driver-controlled, endgame. */
export interface QuickStats {
  season: number
  number: number
  tot: { value: number; rank: number }
  auto: { value: number; rank: number }
  dc: { value: number; rank: number }
  eg: { value: number; rank: number }
  count: number
}

export async function getQuickStats(number: string | number, season: Season): Promise<QuickStats | null> {
  const n = String(number).replace(/\D/g, '')
  try {
    const { data } = await cached<QuickStats>(`qs:${n}:${season}`, `${REST}/teams/${n}/quick-stats?season=${season}`, 60 * 60_000)
    return data
  } catch {
    // 404 here just means the team has not played this season yet.
    return null
  }
}

export interface ScoutAward {
  season: number
  eventCode: string
  teamNumber: number
  type: string
  placement: number
  personName: string | null
}

export async function getTeamAwards(number: string | number, season: Season): Promise<ScoutAward[]> {
  const n = String(number).replace(/\D/g, '')
  try {
    const { data } = await cached<ScoutAward[]>(`awards:${n}:${season}`, `${REST}/teams/${n}/awards?season=${season}`, 60 * 60_000)
    return data
  } catch {
    return []
  }
}

/** One event a team is registered for, with its stats at that event if played. */
export interface TeamEventStats {
  rank: number
  rp: number
  wins: number
  losses: number
  ties: number
  qualMatchesPlayed: number
  opr?: { totalPointsNp?: number }
}

export interface TeamParticipation {
  season: number
  eventCode: string
  teamNumber: number
  stats: TeamEventStats | null
}

export async function getTeamSeason(number: string | number, season: Season): Promise<TeamParticipation[]> {
  const n = String(number).replace(/\D/g, '')
  try {
    const { data } = await cached<TeamParticipation[]>(`teamseason:${n}:${season}`, `${REST}/teams/${n}/events/${season}`, 15 * 60_000)
    return data
  } catch {
    return []
  }
}

// ── events ──────────────────────────────────────────────────

export interface ScoutEvent {
  season: number
  code: string
  name: string
  type: string
  regionCode: string | null
  venue: string | null
  address: string | null
  country: string
  state: string
  city: string
  website: string | null
  timezone: string
  start: string
  end: string
  started?: boolean
  ongoing?: boolean
  finished?: boolean
  hasMatches?: boolean
}

export async function getEvent(season: Season, code: string): Promise<ScoutEvent> {
  const { data } = await cached<ScoutEvent>(`event:${season}:${code}`, `${REST}/events/${season}/${encodeURIComponent(code)}`, 60 * 60_000)
  return data
}

export async function searchEvents(
  season: Season,
  region: Region = DEFAULT_REGION,
  opts: { limit?: number; searchText?: string; hasMatches?: boolean } = {},
): Promise<ScoutEvent[]> {
  const params = new URLSearchParams({ region, limit: String(opts.limit ?? 40) })
  if (opts.searchText?.trim()) params.set('searchText', opts.searchText.trim())
  if (opts.hasMatches !== undefined) params.set('hasMatches', String(opts.hasMatches))
  const { data } = await cached<ScoutEvent[]>(
    `eventsearch:${season}:${region}:${opts.searchText ?? ''}:${opts.limit ?? 40}`,
    `${REST}/events/search/${season}?${params}`,
    30 * 60_000,
  )
  return data
}

// ── one event, fully loaded ─────────────────────────────────

export interface ScoutRanking {
  rank: number
  teamNumber: string
  teamName: string
  wins: number
  losses: number
  ties: number
  opr: number
}

export interface ScoutMatch {
  id: string
  label: string
  level: string
  field: string
  time: string
  /** ISO scheduled (or actual) start, for the countdown. */
  startsAt?: string
  red: string[]
  blue: string[]
  redScore?: number
  blueScore?: number
  played: boolean
}

export interface EventSnapshot {
  code: string
  name: string
  venue: string
  city: string
  state: string
  start: string
  end: string
  ongoing: boolean
  finished: boolean
  rankings: ScoutRanking[]
  matches: ScoutMatch[]
  stale: boolean
  fetchedAt: string
}

/**
 * `stats` is a union with one member per season, so the fragment has to name the
 * season's concrete type. 2020 and 2021 additionally split traditional/remote.
 */
function statsFragment(season: Season): string {
  const shape = 'rank wins losses ties opr { totalPointsNp }'
  if (season === 2020 || season === 2021) {
    return `... on TeamEventStats${season}Trad { ${shape} } ... on TeamEventStats${season}Remote { rank opr { totalPointsNp } }`
  }
  return `... on TeamEventStats${season} { ${shape} }`
}

interface GqlEvent {
  eventByCode: {
    name: string
    start: string
    end: string
    ongoing: boolean
    finished: boolean
    location: { venue: string | null; city: string | null; state: string | null }
    teams: {
      teamNumber: number
      team: { name: string } | null
      stats: { rank?: number; wins?: number; losses?: number; ties?: number; opr?: { totalPointsNp?: number } } | null
    }[]
    matches: {
      id: number
      hasBeenPlayed: boolean
      tournamentLevel: string
      series: number
      scheduledStartTime: string | null
      actualStartTime: string | null
      teams: { teamNumber: number; alliance: string; station: string; onField: boolean }[]
      scores: { red: { totalPoints: number }; blue: { totalPoints: number } } | null
    }[]
  } | null
}

const LEVEL_PREFIX: Record<string, string> = {
  Quals: 'Q',
  Semis: 'SF',
  Finals: 'F',
  DoubleElim: 'M',
}

/** Quals first, then the elimination bracket in the order it is played. */
const LEVEL_ORDER: Record<string, number> = { Quals: 0, DoubleElim: 1, Semis: 2, Finals: 3 }

/**
 * Qualification matches carry their real match number. Elimination ids are
 * internal composites (22001, 25001 …) that mean nothing to a drive team, so
 * those get a running number within the bracket instead.
 */
function labelFor(level: string, id: number, series: number, elimIndex: number): string {
  const prefix = LEVEL_PREFIX[level] ?? level.slice(0, 1).toUpperCase()
  if (level === 'Quals') return `${prefix}${id}`
  if (level === 'Finals') return series > 0 ? `F${series}` : `F${elimIndex}`
  return `${prefix}${elimIndex}`
}

function clockOf(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Everything an event screen needs in one round trip: name, venue, rankings with
 * team names, and the full match schedule with scores.
 */
export async function getEventSnapshot(season: Season, code: string): Promise<EventSnapshot> {
  const query = `{
    eventByCode(season: ${season}, code: ${JSON.stringify(code)}) {
      name start end ongoing finished
      location { venue city state }
      teams {
        teamNumber
        team { name }
        stats { ${statsFragment(season)} }
      }
      matches {
        id hasBeenPlayed tournamentLevel series scheduledStartTime actualStartTime
        teams { teamNumber alliance station onField }
        scores { ... on MatchScores${season} { red { totalPoints } blue { totalPoints } } }
      }
    }
  }`

  const { data, stale, at } = await graphql<GqlEvent>(query, `snapshot:${season}:${code}`, 60_000)
  const event = data.eventByCode
  if (!event) throw new FtcScoutError(`No event ${code} in the ${season} season.`, 404)

  const rankings: ScoutRanking[] = event.teams
    .filter((t) => t.stats?.rank != null)
    .map((t) => ({
      rank: t.stats?.rank ?? 0,
      teamNumber: String(t.teamNumber),
      teamName: t.team?.name ?? `Team ${t.teamNumber}`,
      wins: t.stats?.wins ?? 0,
      losses: t.stats?.losses ?? 0,
      ties: t.stats?.ties ?? 0,
      opr: Math.round((t.stats?.opr?.totalPointsNp ?? 0) * 10) / 10,
    }))
    .sort((a, b) => a.rank - b.rank)

  const ordered = [...event.matches].sort(
    (a, b) =>
      (LEVEL_ORDER[a.tournamentLevel] ?? 9) - (LEVEL_ORDER[b.tournamentLevel] ?? 9) ||
      a.series - b.series ||
      a.id - b.id,
  )

  let elimIndex = 0
  const matches: ScoutMatch[] = ordered.map((m) => {
    if (m.tournamentLevel !== 'Quals') elimIndex++
    const side = (alliance: string) =>
      m.teams
        .filter((t) => t.alliance === alliance && t.onField)
        .sort((a, b) => a.station.localeCompare(b.station))
        .map((t) => String(t.teamNumber))
    return {
      id: `${m.tournamentLevel}-${m.series}-${m.id}`,
      label: labelFor(m.tournamentLevel, m.id, m.series, elimIndex),
      level: m.tournamentLevel,
      field: '1',
      time: clockOf(m.actualStartTime ?? m.scheduledStartTime),
      startsAt: m.actualStartTime ?? m.scheduledStartTime ?? undefined,
      red: side('Red'),
      blue: side('Blue'),
      redScore: m.scores?.red.totalPoints,
      blueScore: m.scores?.blue.totalPoints,
      played: m.hasBeenPlayed,
    }
  })

  return {
    code,
    name: event.name,
    venue: event.location?.venue ?? '',
    city: event.location?.city ?? '',
    state: event.location?.state ?? '',
    start: event.start,
    end: event.end,
    ongoing: event.ongoing,
    finished: event.finished,
    rankings,
    matches,
    stale,
    fetchedAt: at,
  }
}
