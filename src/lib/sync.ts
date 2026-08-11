import { dequeue, listOutbox, queueWrite } from './idb'
import { getSupabase, isSupabaseConfigured, readConfig } from './supabase'
import { ensureMembership } from './membership'
import { now, uid } from './id'
import type { OutboxEntry, SeasonData, Syncable, SyncTable } from '@/domain/types'

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

async function runSync(season: SeasonData, displayName = ''): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, failed: 0, skipped: false }

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

  try {
    const since = season.settings.lastSyncAt ?? '1970-01-01T00:00:00.000Z'
    const { data, error } = await sb
      .from('records')
      .select('id, table_name, data, deleted, updated_at')
      .eq('team_number', teamNumber)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(2000)
    if (error) throw new Error(error.message)
    result.pulled = data?.length ?? 0
    if (data?.length) applyRemote(season, data as RemoteRow[])
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
  }

  return result
}

interface RemoteRow {
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
  season.settings.lastSyncAt = now()
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
