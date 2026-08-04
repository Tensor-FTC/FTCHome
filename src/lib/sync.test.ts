import { describe, expect, it } from 'vitest'
import { applyRemote } from './sync'
import { fixtureSeason } from '@/test/fixtures'
import type { SeasonData, SyncTable } from '@/domain/types'

function row(table: SyncTable, id: string, data: object, updatedAt: string, deleted = false) {
  // `id` and `updatedAt` go last: callers pass spread copies of existing records,
  // whose own timestamps would otherwise win and make every fixture stale.
  return { id, table_name: table, data: { ...data, id, updatedAt }, deleted, updated_at: updatedAt } as never
}

/**
 * Merge is last-write-wins per record on `updatedAt`. These tests pin the two
 * cases that lose data if they are wrong: a stale remote row overwriting a newer
 * local edit, and a tombstone failing to delete.
 */
describe('applyRemote', () => {
  let season: SeasonData

  function fresh() {
    season = fixtureSeason('2026-01-10')
    return season
  }

  it('adds records it has never seen', () => {
    const s = fresh()
    const before = s.tasks.length
    applyRemote(s, [row('tasks', 'task-remote', { name: 'From another device', due: '', done: false }, '2030-01-01T00:00:00.000Z')])
    expect(s.tasks).toHaveLength(before + 1)
    expect(s.tasks.find((t) => t.id === 'task-remote')?.name).toBe('From another device')
  })

  it('takes the remote row when it is newer', () => {
    const s = fresh()
    const target = s.tasks[0]
    applyRemote(s, [row('tasks', target.id, { ...target, name: 'Renamed remotely' }, '2030-01-01T00:00:00.000Z')])
    expect(s.tasks.find((t) => t.id === target.id)?.name).toBe('Renamed remotely')
  })

  it('keeps the local row when the remote one is stale', () => {
    const s = fresh()
    const target = s.tasks[0]
    const localName = target.name
    applyRemote(s, [row('tasks', target.id, { ...target, name: 'Stale overwrite' }, '2000-01-01T00:00:00.000Z')])
    expect(s.tasks.find((t) => t.id === target.id)?.name).toBe(localName)
  })

  it('applies tombstones', () => {
    const s = fresh()
    const target = s.sponsors[0]
    applyRemote(s, [row('sponsors', target.id, target, '2030-01-01T00:00:00.000Z', true)])
    expect(s.sponsors.find((x) => x.id === target.id)).toBeUndefined()
  })

  it('ignores a tombstone for something already gone rather than throwing', () => {
    const s = fresh()
    expect(() => applyRemote(s, [row('tasks', 'never-existed', {}, '2030-01-01T00:00:00.000Z', true)])).not.toThrow()
  })

  it('merges singleton records (team, competition) on the same recency rule', () => {
    const s = fresh()
    applyRemote(s, [row('teams', s.team.id, { ...s.team, name: 'Renamed Team' }, '2030-01-01T00:00:00.000Z')])
    expect(s.team.name).toBe('Renamed Team')

    applyRemote(s, [row('teams', s.team.id, { ...s.team, name: 'Stale Name' }, '2000-01-01T00:00:00.000Z')])
    expect(s.team.name).toBe('Renamed Team')
  })

  it('stamps the sync watermark so the next pull is incremental', () => {
    const s = fresh()
    expect(s.settings.lastSyncAt).toBeNull()
    applyRemote(s, [])
    expect(s.settings.lastSyncAt).not.toBeNull()
  })
})
