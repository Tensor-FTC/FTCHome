import { describe, expect, it } from 'vitest'
import { partitionSeason } from './archive'
import { emptySeason } from './season'
import type { SeasonData } from './types'

const TODAY = '2026-03-01'

function season(patch: Partial<SeasonData> = {}): SeasonData {
  return { ...emptySeason(), ...patch }
}

/**
 * The archive is a filter, so the property that matters is conservation: every
 * record ends up on exactly one side, and nothing that is still live gets
 * hidden. A finished season the app quietly swallows is worse than a long list.
 */
describe('archive', () => {
  it('puts nothing in the archive for a fresh season', () => {
    expect(partitionSeason(season(), TODAY).count).toBe(0)
  })

  it('archives a past one-off but keeps a running series', () => {
    const s = season({
      events: [
        { id: 'old', updatedAt: '', title: 'Kickoff', date: '2025-09-06', time: '10:00', type: 'meet' },
        { id: 'soon', updatedAt: '', title: 'Qualifier', date: '2026-03-14', time: '08:00', type: 'comp' },
        {
          id: 'series',
          updatedAt: '',
          title: 'Build',
          date: '2025-09-09',
          time: '17:00',
          type: 'meet',
          recurrence: { freq: 'weekly', interval: 1 },
        },
      ],
    })
    const { current, archived } = partitionSeason(s, TODAY)
    expect(archived.events.map((e) => e.id)).toEqual(['old'])
    expect(current.events.map((e) => e.id)).toEqual(['soon', 'series'])
  })

  it('archives a series only once its own rule has run out', () => {
    const s = season({
      events: [
        {
          id: 'ended',
          updatedAt: '',
          title: 'Old build block',
          date: '2025-09-09',
          time: '17:00',
          type: 'meet',
          recurrence: { freq: 'weekly', interval: 1, until: '2025-12-01' },
        },
      ],
    })
    expect(partitionSeason(s, TODAY).archived.events).toHaveLength(1)
  })

  it('keeps an old unfinished task, because overdue is not history', () => {
    const s = season({
      tasks: [
        { id: 'open', updatedAt: '', name: 'Cut channel', due: '2025-10-01', status: 'todo' },
        { id: 'blocked', updatedAt: '', name: 'Wire it', due: '2025-10-01', status: 'blocked' },
        {
          id: 'closed',
          updatedAt: '',
          name: 'Order motors',
          due: '2025-10-01',
          status: 'done',
          doneAt: '2025-10-02T12:00:00.000Z',
        },
      ],
    })
    const { current, archived } = partitionSeason(s, TODAY)
    expect(current.tasks.map((t) => t.id).sort()).toEqual(['blocked', 'open'])
    expect(archived.tasks.map((t) => t.id)).toEqual(['closed'])
  })

  it('never archives a pending purchase request', () => {
    const s = season({
      approvals: [
        {
          id: 'waiting',
          updatedAt: '',
          title: 'Belts',
          amount: 40,
          requestedById: 'm1',
          requestedAt: '2025-09-01T00:00:00.000Z',
          state: 'pending',
        },
        {
          id: 'settled',
          updatedAt: '',
          title: 'Wheels',
          amount: 90,
          requestedById: 'm1',
          requestedAt: '2025-09-01T00:00:00.000Z',
          state: 'approved',
          decidedAt: '2025-09-02T00:00:00.000Z',
        },
      ],
    })
    const { current, archived } = partitionSeason(s, TODAY)
    expect(current.approvals.map((a) => a.id)).toEqual(['waiting'])
    expect(archived.approvals.map((a) => a.id)).toEqual(['settled'])
  })

  it('keeps scouting notes from the competition that is actually running', () => {
    const base = { updatedAt: '2025-11-01T00:00:00.000Z', teamName: 'Some team', note: 'fast' }
    const s = season({
      competition: { ...emptySeason().competition, code: 'USWABAM1', ongoing: true },
      scouting: [
        { ...base, id: 'live', teamNumber: '11138', eventCode: 'USWABAM1' },
        { ...base, id: 'past', teamNumber: '4014', eventCode: 'USWASEM2' },
      ],
    })
    const { current, archived } = partitionSeason(s, TODAY)
    expect(current.scouting.map((n) => n.id)).toEqual(['live'])
    expect(archived.scouting.map((n) => n.id)).toEqual(['past'])
  })

  it('archives nothing at all when the team turns the window off', () => {
    const base = emptySeason()
    const s = season({
      settings: { ...base.settings, policy: { ...base.settings.policy, archiveAfterDays: 0 } },
      events: [{ id: 'ancient', updatedAt: '', title: 'Kickoff', date: '2019-09-06', time: '10:00', type: 'meet' }],
    })
    expect(partitionSeason(s, TODAY).count).toBe(0)
  })

  it('conserves every record across the split', () => {
    const s = season({
      events: [
        { id: 'a', updatedAt: '', title: 'x', date: '2025-09-06', time: '10:00', type: 'meet' },
        { id: 'b', updatedAt: '', title: 'y', date: '2026-04-06', time: '10:00', type: 'meet' },
      ],
      tasks: [
        { id: 'c', updatedAt: '', name: 'x', due: '2025-09-06', status: 'done', doneAt: '2025-09-07T00:00:00.000Z' },
        { id: 'd', updatedAt: '', name: 'y', due: '2026-04-06', status: 'todo' },
      ],
    })
    const { current, archived } = partitionSeason(s, TODAY)
    expect(current.events.length + archived.events.length).toBe(2)
    expect(current.tasks.length + archived.tasks.length).toBe(2)
  })
})
