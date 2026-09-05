import { dequeue, listOutbox, queueWrite } from './idb'
import { getSupabase, isSupabaseConfigured, readConfig } from './supabase'
import { ensureMembership } from './membership'
import { now, uid } from './id'
import type { OutboxEntry, SeasonData, SubteamDef, Syncable, SyncTable } from '@/domain/types'

/**
 * The outbox. Every mutation the app makes is written to IndexedDB first and
 * appended here; this module drains it when there is signal.
 *
 * Nothing in the UI blocks on the drain. The queue is deliberately visible on
 * the States screen — a team should be able to see that three RSVPs and a
 * 248 MB clip are waiting, rather than trusting a spinner.
 */

export interface SyncResult {
  pushed: number
  pulled: number
  failed: number
  skipped: boolean
  error?: string
  /** The database accepted this account as the team's first member. */
  claimed?: boolean
  /** The database has this account on the team, but not yet accepted. */
  awaitingApproval?: boolean
  /**
   * Rows the pull returned, for the caller to merge.
   *
   * Deliberately not merged here. A sync takes seconds, and somebody typing
   * during one used to lose the edit: this module was handed a copy of the
   * season before the round trip and handed it back after, overwriting
   * whatever had been committed meanwhile. Returning the rows lets the store
   * apply them to whatever the season is *now*.
   */
  rows: RemoteRow[]
}

/** Rough wire size, so the queue can show "248 MB" without holding the blob. */
function sizeOf(payload: unknown): number {
  try {
    return new Blob([JSON.stringify(payload)]).size
  } catch {
    return 0
  }
}

export async function enqueue(
  table: SyncTable,
  op: OutboxEntry['op'],
  record: Syncable,
  label: string,
  bytesOverride?: number,
): Promise<void> {
  const entry: OutboxEntry = {
    id: uid('ob-'),
    table,
    op,
    recordId: record.id,
    payload: record,
    label,
    bytes: bytesOverride ?? sizeOf(record),
    createdAt: now(),
    attempts: 0,
  }
  await queueWrite(entry)
}

export async function pendingWrites(): Promise<OutboxEntry[]> {
  return listOutbox()
}

/**
 * Push then pull. Safe to call on a timer, on reconnect, or from the Sync
 * button; concurrent calls collapse onto the one in flight.
 */
let inFlight: Promise<SyncResult> | null = null

/**
 * `displayName` is only ever used to label a join request, so a coach sees a
 * name rather than a uuid in the approval queue. It is not identity — the
 * database takes that from `auth.uid()`.
 */
export function sync(season: SeasonData, displayName = ''): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = runSync(season, displayName).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

/** One page of the pull. Bounded so a first sync cannot hold the tab. */
const PULL_PAGE = 1000
const PULL_MAX_PAGES = 20

async function runSync(season: SeasonData, displayName = ''): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, failed: 0, skipped: false, rows: [] }

  if (!isSupabaseConfigured()) {
    result.skipped = true
    result.error = 'Cloud sync is not configured. Everything is saved on this device.'
    return result
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    result.skipped = true
    result.error = 'Offline. Queued writes will go when there is signal.'
    return result
  }

  const sb = await getSupabase()
  if (!sb) {
    result.skipped = true
    result.error = 'Sync client could not be created.'
    return result
  }

  const teamNumber = season.team.number

  /*
   * Enrol before pushing. `my_teams()` is what the record policies consult, and
   * it reads `team_members` — a signed-in person with no row there is refused
   * every write with "new row violates row-level security policy", which is
   * true but unhelpful. Doing it here rather than at sign-in means it also
   * covers the case that actually happens: signing in with no signal, and the
   * team only becoming real on the first sync hours later.
   */
  const membership = await ensureMembership(teamNumber, displayName)
  if (!membership.ok) {
    result.skipped = true
    result.awaitingApproval = membership.status === 'requested' || membership.status === 'invited'
    result.error = membership.message ?? 'This account is not on the team yet.'
    return result
  }
  result.claimed = membership.claimed

  const queue = await listOutbox()

  for (const entry of queue) {
    try {
      const { error } = await sb.from('records').upsert(
        {
          id: entry.recordId,
          team_number: teamNumber,
          table_name: entry.table,
          data: entry.payload as Record<string, unknown>,
          deleted: entry.op === 'delete',
          updated_at: (entry.payload as Syncable)?.updatedAt ?? entry.createdAt,
        },
        { onConflict: 'team_number,table_name,id' },
      )
      if (error) throw new Error(error.message)
      await dequeue(entry.id)
      result.pushed++
    } catch (err) {
      result.failed++
      result.error = err instanceof Error ? err.message : String(err)
      // Leave it queued. A failed push is not a lost write.
      break
    }
  }

  /*
   * Pull everything written since the last row we actually received.
   *
   * The watermark is the server's own `updated_at`, never this device's clock.
   * A phone whose clock runs two minutes fast used to stamp the watermark into
   * the future and skip every row written in that window — permanently, since
   * the next pull started from the same bad mark. Paging on what came back
   * also makes a truncated page safe: the next page picks up exactly where
   * this one stopped.
   */
  try {
    let since = season.settings.pullWatermark ?? '1970-01-01T00:00:00.000Z'
    for (let page = 0; page < PULL_MAX_PAGES; page++) {
      const { data, error } = await sb
        .from('records')
        .select('id, table_name, data, deleted, updated_at')
        .eq('team_number', teamNumber)
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .limit(PULL_PAGE)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as RemoteRow[]
      if (!rows.length) break
      result.rows.push(...rows)
      result.pulled += rows.length
      since = rows[rows.length - 1].updated_at
      if (rows.length < PULL_PAGE) break
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
  }

  return result
}

export interface RemoteRow {
  id: string
  table_name: SyncTable
  data: Syncable
  deleted: boolean
  updated_at: string
}

const COLLECTION_FOR: Partial<Record<SyncTable, keyof SeasonData>> = {
  members: 'members',
  events: 'events',
  rsvps: 'rsvps',
  tasks: 'tasks',
  sponsors: 'sponsors',
  allocations: 'allocations',
  approvals: 'approvals',
  media: 'media',
  weekly_reports: 'weekly',
  scouting_notes: 'scouting',
  parts_state: 'parts',
  // Chat used to push and never pull: a message left this device, reached the
  // database, and was dropped on the way back in because these two lines were
  // missing. Team chat only ever worked for the person typing.
  channels: 'channels',
  messages: 'messages',
}

/** The subteam list rides one record, so a team's own names reach every device. */
interface SubteamsRecord extends Syncable {
  items?: SubteamDef[]
}

/**
 * Last-write-wins per record, compared on `updatedAt`.
 *
 * Chosen over CRDTs on purpose: the conflicting case here is two people editing
 * the same task on the same evening, where the later edit is the one you want,
 * and a merge algorithm nobody can explain is worse than a rule everybody can.
 * Mutates `season` in place; the caller persists it.
 */
export function applyRemote(season: SeasonData, rows: RemoteRow[]): void {
  for (const row of rows) {
    if (row.table_name === 'subteams') {
      mergeSubteams(season, row)
      continue
    }
    const key = COLLECTION_FOR[row.table_name]
    if (key) {
      const list = season[key] as unknown as Syncable[]
      const index = list.findIndex((r) => r.id === row.id)
      if (row.deleted) {
        if (index >= 0) list.splice(index, 1)
        continue
      }
      if (index < 0) list.push(row.data)
      else if (row.data.updatedAt > list[index].updatedAt) list[index] = row.data
      continue
    }
    if (row.table_name === 'teams' && row.data.updatedAt > season.team.updatedAt) {
      season.team = row.data as SeasonData['team']
    }
    if (row.table_name === 'competition_events' && row.data.updatedAt > season.competition.updatedAt) {
      season.competition = row.data as SeasonData['competition']
    }
  }

  const mark = highestWatermark(rows)
  // Only ever forwards. The query already asks for newer rows, but a watermark
  // that can move back would re-pull the same page for the rest of the season.
  if (mark && isNewer(mark, season.settings.pullWatermark)) season.settings.pullWatermark = mark
}

function isNewer(candidate: string, current: string | null | undefined): boolean {
  if (!current) return true
  const a = Date.parse(candidate)
  const b = Date.parse(current)
  if (Number.isNaN(a)) return false
  if (Number.isNaN(b)) return true
  return a > b
}

/**
 * Subteams merge by union rather than last-write-wins.
 *
 * They are one list on one record, so the newest write would otherwise erase a
 * subteam somebody else added the same evening — and nothing in the app deletes
 * one, so there is no removal for a union to lose.
 */
function mergeSubteams(season: SeasonData, row: RemoteRow): void {
  if (row.deleted) return
  const incoming = (row.data as SubteamsRecord).items ?? []
  const known = new Set(season.subteams.map((s) => s.id))
  for (const subteam of incoming) {
    if (subteam?.id && !known.has(subteam.id)) {
      season.subteams.push(subteam)
      known.add(subteam.id)
    }
  }
}

/** The newest server timestamp in a batch, so the next pull resumes from it. */
function highestWatermark(rows: RemoteRow[]): string | null {
  let best: string | null = null
  let bestMs = -Infinity
  for (const row of rows) {
    const ms = Date.parse(row.updated_at)
    if (Number.isNaN(ms) || ms <= bestMs) continue
    bestMs = ms
    best = row.updated_at
  }
  return best
}

/** True when the browser reports a connection *and* a project is set up. */
export function canSync(): boolean {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  return online && isSupabaseConfigured()
}

export function syncTarget(): string {
  const { url } = readConfig()
  if (!url) return 'This device only'
  try {
    return new globalThis.URL(url).host
  } catch {
    return url
  }
}
