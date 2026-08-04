import { addDays, today, toIso, weekStart } from '@/lib/date'
import { initialsOf, uid } from '@/lib/id'
import type {
  Allocation,
  Approval,
  CalendarEvent,
  CompetitionEvent,
  Match,
  Member,
  RankingRow,
  Rsvp,
  ScoutingNote,
  SeasonData,
  Settings,
  Sponsor,
  Task,
  Team,
  WeeklyReport,
} from './types'

/**
 * The demo season: team 11138 Robo Eclipse, mid-build, two weeks out from a
 * qualifier.
 *
 * Dates are generated *relative to today* rather than pinned to the design's
 * November 2025, so the app reads correctly whenever it is opened — a seeded
 * season whose next competition is eight months in the past teaches a new team
 * nothing. `anchor` is the "today" everything hangs off.
 */

const MEMBERS: [name: string, role: Member['role'], subteam: Member['subteam']][] = [
  ['D. Moreau', 'coach', 'logistics'],
  ['J. Duval', 'captain', 'mechanical'],
  ['A. Chen', 'student', 'mechanical'],
  ['R. Kaur', 'student', 'software'],
  ['P. Nair', 'student', 'electrical'],
  ['T. Alvi', 'student', 'notebook'],
  ['S. Boateng', 'student', 'outreach'],
  ['M. Okonkwo', 'mentor', 'drive'],
  ['L. Fernandes', 'student', 'drive'],
  ['H. Park', 'student', 'software'],
  ['B. Osei', 'student', 'mechanical'],
  ['N. Silva', 'parent', undefined],
]

function usernameFor(name: string, teamNumber: string): string {
  return `${name.toLowerCase().replace(/[^a-z]/g, '')}@${teamNumber}`
}

function stamp(iso: string): string {
  return new Date(`${iso}T12:00:00`).toISOString()
}

export function buildSeed(anchor = today()): SeasonData {
  const t = stamp(anchor)
  const teamNumber = '11138'
  // Kickoff is nine weeks back, which puts the demo in build week 9 like the design.
  const kickoff = addDays(anchor, -7 * 8)
  const qualifier = addDays(anchor, 14)

  const team: Team = {
    id: 'team-11138',
    updatedAt: t,
    number: teamNumber,
    name: 'Robo Eclipse',
    region: 'Mississauga, ON',
    rookieYear: 2021,
    code: null,
    season: String(new Date(anchor).getFullYear()),
    goal: 9200,
    storageQuotaGb: 50,
  }

  const members: Member[] = MEMBERS.map(([name, role, subteam], i) => ({
    id: `mem-${initialsOf(name).toLowerCase()}-${i}`,
    updatedAt: t,
    name,
    role,
    subteam,
    username: usernameFor(name, teamNumber),
    password: null,
    pending: false,
    joinedAt: stamp(kickoff),
    medical: {
      notes: i % 3 === 0 ? 'No known conditions' : 'On file with the school',
      allergies: i === 2 ? 'Peanut — carries an EpiPen' : 'None declared',
      guardian: role === 'student' || role === 'captain' ? `Guardian of ${name}` : '—',
      guardianPhone: '905-555-01' + String(10 + i),
    },
    contact: {
      email: `${name.toLowerCase().replace(/[^a-z]/g, '')}@example.org`,
      phone: '905-555-02' + String(10 + i),
    },
  }))

  const byName = (n: string) => members.find((m) => m.name === n)!

  const events: CalendarEvent[] = [
    {
      // Anchors build-week numbering. Without a kickoff on the calendar every
      // season reads as week 1 forever.
      id: 'ev-kickoff',
      updatedAt: t,
      title: 'Season kickoff',
      date: kickoff,
      time: '09:00',
      endTime: '15:00',
      type: 'meet',
      location: 'Sheridan College',
      notes: 'Game reveal, strategy session, subteam sign-up.',
    },
    {
      id: 'ev-build-today',
      updatedAt: t,
      title: 'Build session · shop',
      date: anchor,
      time: '10:00',
      endTime: '16:00',
      type: 'meet',
      location: 'School shop, room 114',
      notes: 'Intake V3 install and first drive test.',
      repeatWeeklyUntil: addDays(anchor, 120),
    },
    {
      id: 'ev-motors',
      updatedAt: t,
      title: 'Motors ETA',
      date: addDays(anchor, 4),
      time: '—',
      type: 'dead',
      notes: 'Unblocks intake + arm.',
    },
    {
      id: 'ev-library',
      updatedAt: t,
      title: 'Library demo',
      date: addDays(anchor, 7),
      time: '13:00',
      endTime: '15:00',
      type: 'out',
      location: 'Mississauga Central Library',
    },
    {
      id: 'ev-qualifier',
      updatedAt: t,
      title: 'Ontario Qualifier — Milton',
      date: qualifier,
      time: '07:15',
      endTime: '19:00',
      type: 'comp',
      location: 'Milton Sports Centre',
      notes: 'Load-in 07:15 · doors 08:00 · first match 09:14.',
      attachments: [
        { id: 'at-1', name: 'Event agenda', ext: 'PDF', size: 240 * 1024 },
        { id: 'at-2', name: 'Pit packing list', ext: 'PDF', size: 88 * 1024 },
        { id: 'at-3', name: 'Venue map + load-in', ext: 'PNG', size: Math.round(1.2 * 1024 * 1024) },
      ],
    },
    {
      id: 'ev-provincial',
      updatedAt: t,
      title: 'Provincial championship',
      date: addDays(anchor, 91),
      time: '08:00',
      type: 'comp',
      location: 'Waterloo · if qualified',
    },
    {
      id: 'ev-deans',
      updatedAt: t,
      title: "Dean's List submission",
      date: addDays(anchor, 106),
      time: '23:59',
      type: 'dead',
      notes: 'Deadline 23:59 ET.',
    },
    {
      id: 'ev-grant',
      updatedAt: t,
      title: 'Grant window opens',
      date: addDays(anchor, 210),
      time: '09:00',
      type: 'dead',
      notes: 'FIRST Canada rookie + veteran grants.',
    },
  ]

  // A believable RSVP spread for the qualifier: 10 going, 2 maybe, 3 can't, rest silent.
  const rsvpPlan: [string, Rsvp['status']][] = [
    ['J. Duval', 'going'],
    ['A. Chen', 'going'],
    ['P. Nair', 'going'],
    ['S. Boateng', 'going'],
    ['M. Okonkwo', 'going'],
    ['L. Fernandes', 'going'],
    ['H. Park', 'going'],
    ['B. Osei', 'going'],
    ['N. Silva', 'going'],
    ['R. Kaur', 'cant'],
    ['D. Moreau', 'cant'],
    ['T. Alvi', 'cant'],
  ]
  const rsvps: Rsvp[] = rsvpPlan.map(([name, status], i) => ({
    id: `rsvp-q-${i}`,
    updatedAt: t,
    eventId: 'ev-qualifier',
    memberId: byName(name).id,
    status,
  }))
  rsvps.push(
    ...['J. Duval', 'A. Chen', 'R. Kaur', 'P. Nair', 'T. Alvi', 'H. Park', 'B. Osei', 'L. Fernandes', 'M. Okonkwo', 'S. Boateng', 'D. Moreau'].map(
      (name, i): Rsvp => ({
        id: `rsvp-b-${i}`,
        updatedAt: t,
        eventId: 'ev-build-today',
        memberId: byName(name).id,
        status: i < 8 ? 'going' : 'cant',
      }),
    ),
  )

  const tasks: Task[] = [
    {
      id: 'task-1',
      updatedAt: t,
      name: 'Cut 336mm channel ×4',
      subteam: 'mechanical',
      assigneeId: byName('A. Chen').id,
      due: addDays(anchor, -2),
      done: false,
    },
    {
      id: 'task-2',
      updatedAt: t,
      name: 'Upload auto path clip',
      subteam: 'software',
      assigneeId: byName('R. Kaur').id,
      due: addDays(anchor, 1),
      done: true,
      doneAt: t,
    },
    {
      id: 'task-3',
      updatedAt: t,
      name: 'Engineering notebook, week 9',
      subteam: 'notebook',
      assigneeId: byName('T. Alvi').id,
      due: addDays(anchor, -1),
      done: false,
    },
    {
      id: 'task-4',
      updatedAt: t,
      name: 'Pack pit checklist',
      subteam: 'logistics',
      assigneeId: byName('J. Duval').id,
      due: addDays(anchor, 11),
      done: false,
    },
    {
      id: 'task-5',
      updatedAt: t,
      name: 'Intake V3 — mount and wire',
      subteam: 'mechanical',
      assigneeId: byName('B. Osei').id,
      due: addDays(anchor, 3),
      done: false,
      blockedBy: 'Waiting on 5203 motors',
    },
    {
      id: 'task-6',
      updatedAt: t,
      name: 'Arm rev C tuning',
      subteam: 'mechanical',
      assigneeId: byName('J. Duval').id,
      due: addDays(anchor, 5),
      done: false,
      blockedBy: 'Waiting on 5203 motors',
    },
    {
      id: 'task-7',
      updatedAt: t,
      name: 'Rewire control hub loom',
      subteam: 'electrical',
      assigneeId: byName('P. Nair').id,
      due: addDays(anchor, 2),
      done: true,
      doneAt: t,
    },
    {
      id: 'task-8',
      updatedAt: t,
      name: 'Book library demo AV',
      subteam: 'outreach',
      assigneeId: byName('S. Boateng').id,
      due: addDays(anchor, 6),
      done: true,
      doneAt: t,
    },
    {
      id: 'task-9',
      updatedAt: t,
      name: 'Odometry calibration pass',
      subteam: 'software',
      assigneeId: byName('H. Park').id,
      due: addDays(anchor, 4),
      done: false,
    },
  ]

  const sponsors: Sponsor[] = [
    { id: 'sp-1', updatedAt: t, name: 'Linamar', tier: 'GOLD · TOOLING', amount: 3500, state: 'Received', loggedAt: stamp(addDays(anchor, -40)) },
    { id: 'sp-2', updatedAt: t, name: 'Milton Machine Works', tier: 'SILVER · MACHINING', amount: 2000, state: 'Received', loggedAt: stamp(addDays(anchor, -30)) },
    { id: 'sp-3', updatedAt: t, name: 'Kaur Family', tier: 'FAMILY', amount: 600, state: 'Received', loggedAt: stamp(addDays(anchor, -21)) },
    { id: 'sp-4', updatedAt: t, name: 'Sheridan Alumni Fund', tier: 'GRANT', amount: 1500, state: 'Pledged', loggedAt: stamp(addDays(anchor, -14)) },
    { id: 'sp-5', updatedAt: t, name: 'Nair Orthodontics', tier: 'BRONZE', amount: 750, state: 'Pledged', loggedAt: stamp(addDays(anchor, -6)) },
  ]

  const allocations: Allocation[] = [
    { id: 'al-1', updatedAt: t, name: 'Kit & parts', spent: 3860, cap: 4200 },
    { id: 'al-2', updatedAt: t, name: 'Registration', spent: 1150, cap: 1400 },
    { id: 'al-3', updatedAt: t, name: 'Travel', spent: 420, cap: 1800 },
    { id: 'al-4', updatedAt: t, name: 'Outreach', spent: 180, cap: 600 },
    { id: 'al-5', updatedAt: t, name: 'Spares', spent: 260, cap: 1200 },
  ]

  const approvals: Approval[] = [
    {
      id: 'ap-1',
      updatedAt: t,
      title: 'GoBILDA restock — drivetrain',
      amount: 412.8,
      requestedById: byName('M. Okonkwo').id,
      requestedAt: stamp(addDays(anchor, -2)),
      state: 'pending',
      allocationId: 'al-1',
    },
    {
      id: 'ap-2',
      updatedAt: t,
      title: 'Practice field tiles',
      amount: 189,
      requestedById: byName('J. Duval').id,
      requestedAt: stamp(addDays(anchor, -5)),
      state: 'pending',
      allocationId: 'al-5',
    },
    {
      id: 'ap-3',
      updatedAt: t,
      title: 'Qualifier van rental',
      amount: 240,
      requestedById: byName('D. Moreau').id,
      requestedAt: stamp(addDays(anchor, -9)),
      state: 'approved',
      decidedById: byName('D. Moreau').id,
      decidedAt: stamp(addDays(anchor, -8)),
      allocationId: 'al-3',
    },
  ]

  const thisWeek = weekStart(anchor)
  const weekly: WeeklyReport[] = [
    {
      id: 'wk-9',
      updatedAt: t,
      week: 9,
      from: addDays(thisWeek, -7),
      to: addDays(thisWeek, -1),
      summary:
        "Slower week. Intake ate Thursday and Saturday, but it's on the robot and it works. Two motors are still in transit, so the arm is stalled until the 19th. Drive practice starts next Saturday whether or not the arm is done.",
      author: 'J. Duval, captain',
      shoutouts: [
        { id: 'so-1', who: 'P. Nair', text: 'stayed till 9 rewiring the hub. Twice.' },
        { id: 'so-2', who: 'Outreach', text: 'booked the library demo.' },
      ],
      mediaIds: [],
      published: true,
      publishedAt: stamp(addDays(thisWeek, -1)),
      reads: 41,
    },
    {
      id: 'wk-10',
      updatedAt: t,
      week: 10,
      from: thisWeek,
      to: addDays(thisWeek, 6),
      summary: '',
      author: 'J. Duval, captain',
      shoutouts: [],
      mediaIds: [],
      published: false,
      reads: 0,
    },
  ]

  const scouting: ScoutingNote[] = [
    { id: 'sc-1', updatedAt: t, teamNumber: '14672', teamName: 'Iron Foxes', note: 'Consistent 2-sample auto, weak in endgame. Tell them we climb.', opr: 48.1, auto: 22.0, rank: 6 },
    { id: 'sc-2', updatedAt: t, teamNumber: '9021', teamName: 'Vector North', note: 'Fast cycle, struggles if the pit is contested early.', opr: 71.0, auto: 31.5, rank: 1 },
    { id: 'sc-3', updatedAt: t, teamNumber: '7737', teamName: 'Redline', note: 'Tipped twice on Saturday. Avoid contact, do not bait.', opr: 33.9, auto: 12.0, rank: 9 },
  ]

  const settings: Settings = {
    alliance: 'red',
    matchSeconds: 138,
    matchLabel: 'Q42',
    matchField: '2',
    partner: '14672',
    opponents: ['9021', '7737'],
    notificationsEnabled: false,
    notifyLeadSeconds: 300,
    ftcApiKey: '',
    ftcSeason: String(new Date(anchor).getFullYear()),
    ftcEventCode: 'ONMI',
    simulateOffline: false,
    reducedData: false,
    lastSyncAt: null,
  }

  return {
    team,
    members,
    events,
    rsvps,
    tasks,
    sponsors,
    allocations,
    approvals,
    media: [],
    weekly,
    scouting,
    competition: sampleCompetition(qualifier, t),
    partsOwned: { bare: {}, rookie: {}, comp: {} },
    partsTier: 'rookie',
    settings,
  }
}

/** A brand-new team: the coach who registered it, and nothing else. */
export function buildEmptySeason(teamNumber: string, teamName: string, coachName: string): SeasonData {
  const anchor = today()
  const t = stamp(anchor)
  const base = buildSeed(anchor)
  return {
    ...base,
    team: { ...base.team, id: uid('team-'), number: teamNumber, name: teamName, region: '', rookieYear: new Date().getFullYear(), goal: 0 },
    members: [
      {
        id: uid('mem-'),
        updatedAt: t,
        name: coachName,
        role: 'coach',
        username: usernameFor(coachName, teamNumber),
        password: null,
        pending: false,
        joinedAt: t,
      },
    ],
    events: [],
    rsvps: [],
    tasks: [],
    sponsors: [],
    allocations: [],
    approvals: [],
    media: [],
    weekly: [],
    scouting: [],
    partsOwned: { bare: {}, rookie: {}, comp: {} },
  }
}

const SAMPLE_TEAMS: [rank: number, num: string, name: string, w: number, l: number, opr: number][] = [
  [1, '9021', 'Vector North', 4, 0, 71.0],
  [2, '6217', 'Northline', 4, 0, 66.8],
  [3, '11244', 'Halton Habs', 3, 1, 64.1],
  [4, '11138', 'Robo Eclipse', 3, 1, 62.4],
  [5, '8814', 'Steel Sparrows', 3, 1, 55.2],
  [6, '14672', 'Iron Foxes', 2, 2, 48.1],
  [7, '10310', 'Bramalea Bots', 2, 2, 44.7],
  [8, '12005', 'Mavryk', 1, 3, 39.6],
  [9, '7737', 'Redline', 1, 3, 33.9],
  [10, '15880', 'Trillium', 0, 4, 21.4],
]

const SAMPLE_MATCHES: [id: string, red: [string, string], blue: [string, string], field: string, time: string, rs?: number, bs?: number, onDeck?: boolean][] = [
  ['Q31', ['11138', '7737'], ['6217', '12005'], '1', '09:14', 118, 96],
  ['Q34', ['9021', '15880'], ['11244', '8814'], '2', '09:31', 96, 104],
  ['Q36', ['14672', '10310'], ['6217', '7737'], '1', '09:48', 88, 71],
  ['Q38', ['11138', '7737'], ['8814', '11244'], '1', '10:05', 118, 96],
  ['Q40', ['9021', '6217'], ['12005', '15880'], '2', '10:22', 131, 60],
  ['Q42', ['11138', '14672'], ['9021', '7737'], '2', '10:39', undefined, undefined, true],
  ['Q44', ['8814', '15880'], ['10310', '11244'], '1', '10:56'],
  ['Q47', ['11138', '8814'], ['11244', '6217'], '1', '11:13'],
  ['Q49', ['12005', '7737'], ['9021', '10310'], '2', '11:30'],
  ['Q53', ['11138', '6217'], ['14672', '9021'], '2', '11:47'],
  ['Q55', ['15880', '10310'], ['12005', '8814'], '1', '12:04'],
]

export function sampleCompetition(date: string, updatedAt = new Date().toISOString()): CompetitionEvent {
  const rankings: RankingRow[] = SAMPLE_TEAMS.map(([rank, teamNumber, teamName, wins, losses, opr]) => ({
    rank,
    teamNumber,
    teamName,
    wins,
    losses,
    ties: 0,
    opr,
  }))
  const matches: Match[] = SAMPLE_MATCHES.map(([label, red, blue, field, time, rs, bs, onDeck]) => ({
    id: label,
    label,
    field,
    time,
    red,
    blue,
    redScore: rs,
    blueScore: bs,
    played: rs !== undefined,
    onDeck,
  }))
  return {
    id: 'comp-sample',
    updatedAt,
    code: 'ONMI',
    name: 'Ontario Qualifier — Milton',
    venue: 'Milton Sports Centre',
    date,
    matches,
    rankings,
    source: 'sample',
  }
}

export const SEED_ANCHOR = toIso(new Date())
