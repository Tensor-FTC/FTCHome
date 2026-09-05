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

  /*
   * Chat pushed and never pulled. Every message reached the database and was
   * dropped on the way back in, so the only person who ever saw a message was
   * the one who typed it.
   */
  it('takes channels and messages from other devices', () => {
    const s = fresh()
    applyRemote(s, [
      row('channels', 'ch-1', { name: 'Everyone', kind: 'team', createdAt: '2026-01-01T00:00:00.000Z' }, '2030-01-01T00:00:00.000Z'),
      row('messages', 'msg-1', { channelId: 'ch-1', authorId: 'mem-x', authorName: 'Sam', body: 'Bring the notebook', sentAt: '2026-01-02T09:00:00.000Z' }, '2030-01-01T00:00:00.000Z'),
    ])
    expect(s.channels.find((c) => c.id === 'ch-1')?.name).toBe('Everyone')
    expect(s.messages.find((m) => m.id === 'msg-1')?.body).toBe('Bring the notebook')
  })

  it('deletes a message the team removed elsewhere', () => {
    const s = fresh()
    applyRemote(s, [row('messages', 'msg-1', { channelId: 'ch-1', body: 'oops' }, '2030-01-01T00:00:00.000Z')])
    applyRemote(s, [row('messages', 'msg-1', { channelId: 'ch-1', body: 'oops' }, '2030-01-02T00:00:00.000Z', true)])
    expect(s.messages.find((m) => m.id === 'msg-1')).toBeUndefined()
  })

  /*
   * Subteams are one list on one record, so last-write-wins would erase a
   * subteam somebody else added the same evening. Nothing deletes one, so a
   * union loses nothing.
   */
  describe('subteams', () => {
    it('adds a subteam another device invented', () => {
      const s = fresh()
      applyRemote(s, [
        row('subteams', 'subteams', { items: [{ id: 'pit-crew', label: 'Pit crew' }] }, '2030-01-01T00:00:00.000Z'),
      ])
      expect(s.subteams.find((x) => x.id === 'pit-crew')?.label).toBe('Pit crew')
    })

    it('keeps the built-ins rather than replacing the list', () => {
      const s = fresh()
      const before = s.subteams.length
      applyRemote(s, [
        row('subteams', 'subteams', { items: [{ id: 'fundraising', label: 'Fundraising' }] }, '2030-01-01T00:00:00.000Z'),
      ])
      expect(s.subteams).toHaveLength(before + 1)
      expect(s.subteams.find((x) => x.id === 'mechanical')).toBeTruthy()
    })

    it('does not duplicate one it already has', () => {
      const s = fresh()
      const before = s.subteams.length
      applyRemote(s, [
        row('subteams', 'subteams', { items: [{ id: 'mechanical', label: 'Mechanical' }] }, '2030-01-01T00:00:00.000Z'),
      ])
      expect(s.subteams).toHaveLength(before)
    })
  })

  /*
   * The watermark is the server's clock, never this device's. Stamping it with
   * `now()` meant a phone running fast skipped every row written inside the
   * skew — permanently, because the next pull started from the same bad mark.
   */
  describe('the pull watermark', () => {
    it('advances to the newest row actually received', () => {
      const s = fresh()
      applyRemote(s, [
        row('tasks', 'task-a', { name: 'a', due: '' }, '2026-03-01T10:00:00.000Z'),
        row('tasks', 'task-b', { name: 'b', due: '' }, '2026-03-01T12:00:00.000Z'),
        row('tasks', 'task-c', { name: 'c', due: '' }, '2026-03-01T11:00:00.000Z'),
      ])
      expect(s.settings.pullWatermark).toBe('2026-03-01T12:00:00.000Z')
    })

    it('leaves it alone when nothing came back, rather than skipping ahead', () => {
      const s = fresh()
      s.settings.pullWatermark = '2026-03-01T12:00:00.000Z'
      applyRemote(s, [])
      expect(s.settings.pullWatermark).toBe('2026-03-01T12:00:00.000Z')
    })

    it('never moves backwards, so a page can never be re-pulled forever', () => {
      const s = fresh()
      s.settings.pullWatermark = '2026-03-01T12:00:00.000Z'
      applyRemote(s, [row('tasks', 'task-a', { name: 'a', due: '' }, '2026-02-01T09:00:00.000Z')])
      expect(s.settings.pullWatermark).toBe('2026-03-01T12:00:00.000Z')
    })
  })
})
