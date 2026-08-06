import { emptySeason, teamFromScout } from '@/domain/season'
import { uid, now } from '@/lib/id'
import { addDays, today } from '@/lib/date'
import type { ScoutTeam } from '@/lib/ftcScout'
import type { SeasonData } from '@/domain/types'

/**
 * Test fixtures.
 *
 * The team payload below is a verbatim capture of
 * `GET https://api.ftcscout.org/rest/v1/teams/11138`, so the shapes the tests
 * assert against are the shapes the API actually returns. Team-entered records
 * (members, tasks, sponsors) are synthetic on purpose — they are exactly the
 * data no API provides, and the app never invents them at runtime.
 */
export const SCOUT_TEAM_11138: ScoutTeam = {
  number: 11138,
  name: 'Robo Eclipse',
  schoolName: 'Family/Community',
  sponsors: ['Microsoft Corp', 'Boeing Company'],
  country: 'USA',
  state: 'WA',
  city: 'Bellevue',
  rookieYear: 2016,
  website: 'https://ftc11138.wixsite.com/robo-eclipse',
}

/** A season with a real team identity and enough local data to exercise the store. */
export function fixtureSeason(anchor = today()): SeasonData {
  const season = emptySeason()
  season.team = teamFromScout(SCOUT_TEAM_11138, season.team)
  season.team.goal = 9200

  const member = (name: string, role: SeasonData['members'][number]['role'], subteam?: SeasonData['members'][number]['subteam']) => ({
    id: uid('mem-'),
    updatedAt: now(),
    name,
    role,
    subteam,
    username: `${name.toLowerCase().replace(/[^a-z]/g, '')}@11138`,
    password: null,
    pending: false,
    joinedAt: now(),
    medical: { notes: '', allergies: '', guardian: '', guardianPhone: '' },
    contact: { email: '', phone: '' },
  })

  season.members = [
    member('A Coach', 'coach', 'logistics'),
    member('B Captain', 'captain', 'mechanical'),
    member('C Student', 'student', 'software'),
    member('D Mentor', 'mentor', 'drive'),
  ]

  season.events = [
    {
      id: uid('ev-'),
      updatedAt: now(),
      title: 'Build session',
      date: anchor,
      time: '10:00',
      endTime: '16:00',
      type: 'meet',
      source: 'local',
      attendance: true,
      recurrence: { freq: 'weekly', interval: 1, until: addDays(anchor, 84) },
    },
    {
      id: 'scout-USWABAM1',
      updatedAt: now(),
      title: 'Bardeen League Meet 1',
      date: addDays(anchor, 14),
      time: '—',
      type: 'comp',
      location: 'Cedarcrest High School · Duvall, WA',
      source: 'ftc-scout',
      eventCode: 'USWABAM1',
    },
  ]

  season.rsvps = [
    { id: uid('rsvp-'), updatedAt: now(), eventId: season.events[0].id, memberId: season.members[0].id, status: 'going' },
    { id: uid('rsvp-'), updatedAt: now(), eventId: season.events[0].id, memberId: season.members[1].id, status: 'cant' },
  ]

  season.tasks = [
    {
      id: uid('task-'),
      updatedAt: now(),
      name: 'Cut channel',
      subteam: 'mechanical',
      assigneeId: season.members[1].id,
      due: addDays(anchor, -2),
      status: 'todo',
    },
    {
      id: uid('task-'),
      updatedAt: now(),
      name: 'Upload auto clip',
      subteam: 'software',
      assigneeId: season.members[2].id,
      due: addDays(anchor, 3),
      status: 'done',
      doneAt: now(),
    },
  ]

  season.sponsors = [
    { id: uid('sp-'), updatedAt: now(), name: 'Received Co', tier: 'GOLD', amount: 3500, state: 'Received', loggedAt: now() },
    { id: uid('sp-'), updatedAt: now(), name: 'Pledged Co', tier: 'GRANT', amount: 1500, state: 'Pledged', loggedAt: now() },
  ]

  season.allocations = [
    { id: 'al-kit', updatedAt: now(), name: 'Kit & parts', spent: 3860, cap: 4200 },
    { id: 'al-travel', updatedAt: now(), name: 'Travel', spent: 420, cap: 1800 },
  ]

  season.approvals = [
    {
      id: uid('ap-'),
      updatedAt: now(),
      title: 'Drivetrain restock',
      amount: 412.8,
      requestedById: season.members[3].id,
      requestedAt: now(),
      state: 'pending',
      allocationId: 'al-kit',
    },
  ]

  return season
}
