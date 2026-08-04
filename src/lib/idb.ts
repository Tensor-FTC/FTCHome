import { openDB, type IDBPDatabase } from 'idb'
import type { OutboxEntry, SeasonData, Session } from '@/domain/types'

/**
 * Local storage layer. This is the source of truth the UI reads from — Supabase
 * is a peer that this syncs *to*, never something a screen waits on. A qualifier
 * gym has no signal; every screen still has to render.
 *
 * Layout:
 *   doc      one row per document ('season', 'session') — the season is small
 *            enough (low hundreds of records) that a single versioned document
 *            beats per-entity stores and makes atomic restore trivial.
 *   blobs    media files, kept out of the document so a 40 MB clip never has to
 *            be serialised alongside the roster.
 *   outbox   pending writes, user-visible on the States screen.
 */
const DB_NAME = 'ftc-home'
const DB_VERSION = 1

export const DOC_SEASON = 'season'
export const DOC_SESSION = 'session'

let dbPromise: Promise<IDBPDatabase> | null = null

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('doc')) database.createObjectStore('doc')
        if (!database.objectStoreNames.contains('blobs')) database.createObjectStore('blobs')
        if (!database.objectStoreNames.contains('outbox')) {
          database.createObjectStore('outbox', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

/** Reset the cached handle. Tests and "erase local data" need this. */
export function resetDbHandle(): void {
  dbPromise = null
}

// ── documents ───────────────────────────────────────────────

export async function loadSeason(): Promise<SeasonData | undefined> {
  return (await db()).get('doc', DOC_SEASON)
}

export async function saveSeason(data: SeasonData): Promise<void> {
  await (await db()).put('doc', data, DOC_SEASON)
}

export async function loadSession(): Promise<Session | undefined> {
  return (await db()).get('doc', DOC_SESSION)
}

export async function saveSession(session: Session): Promise<void> {
  await (await db()).put('doc', session, DOC_SESSION)
}

export async function clearAll(): Promise<void> {
  const database = await db()
  await Promise.all([database.clear('doc'), database.clear('blobs'), database.clear('outbox')])
}

// ── blobs ───────────────────────────────────────────────────

export async function putBlob(key: string, blob: Blob): Promise<void> {
  await (await db()).put('blobs', blob, key)
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return (await db()).get('blobs', key)
}

export async function deleteBlob(key: string): Promise<void> {
  await (await db()).delete('blobs', key)
}

/** Actual bytes on device, for the storage meter. Not an estimate from record sizes. */
export async function blobBytes(): Promise<number> {
  const database = await db()
  let total = 0
  let cursor = await database.transaction('blobs').store.openCursor()
  while (cursor) {
    const value = cursor.value as Blob
    total += value?.size ?? 0
    cursor = await cursor.continue()
  }
  return total
}

// ── outbox ──────────────────────────────────────────────────

export async function queueWrite(entry: OutboxEntry): Promise<void> {
  await (await db()).put('outbox', entry)
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const rows: OutboxEntry[] = await (await db()).getAll('outbox')
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function dequeue(id: string): Promise<void> {
  await (await db()).delete('outbox', id)
}

export async function clearOutbox(): Promise<void> {
  await (await db()).clear('outbox')
}
