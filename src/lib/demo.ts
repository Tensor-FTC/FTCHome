import { emptySeason } from '@/domain/season'
import { addDays, today } from '@/lib/date'
import type { Member, Role, SeasonData, Subteam } from '@/domain/types'

/**
 * A demo season, for trying the app without setting a team up first.
 *
 * Every screen in this app starts genuinely empty on purpose — pre-filled
 * examples are indistinguishable from real records once somebody has scrolled
 * past them twice, and a team that has to delete fake data before it can start
 * usually just does not start. That rule is right for a real team and wrong for
 * somebody evaluating the app in ninety seconds, so this is the deliberate
 * exception: opt-in, obvious, and thrown away with one tap.
 *
 * There is no shipped password. The demo account is created on the device at
 * the moment you press the button, exactly like a real first account, so
 * nothing here is a credential that exists before you ask for it.
 */

export const DEMO_EMAIL = 'demo@ftchome.app'
export const DEMO_PASSWORD = 'demo-season'
export const DEMO_NAME = 'Demo Coach'

/** Team 19645's real identity, so FTCScout data lines up with the sample season. */
const DEMO_TEAM_NUMBER = '19645'

let seq = 0
const uid = (p: string) => `${p}-demo-${(seq += 1).toString(36)}`

function member(
  name: string,
  role: Role,
  subteams: Subteam[],
  stamp: string,
): Member {
  return {
    id: uid('mem'),
    updatedAt: stamp,
    name,
    role,
    subteams,
    username: `${name.toLowerCase().replace(/[^a-z]/g, '')}@${DEMO_TEAM_NUMBER}`,
    // Null means "has not set a password yet" — an invite, not an account.
    password: null,
    status: 'invited',
    joinedAt: stamp,
  }
}

export function demoSeason(): SeasonData {
  const s = emptySeason()
  const stamp = new Date().toISOString()
  const day = (n: number) => addDays(today(), n)

  s.team = {
    ...s.team,
    number: DEMO_TEAM_NUMBER,
    name: 'Infinity',
    city: 'Chicago',
    state: 'IL',
    country: 'USA',
    rookieYear: 2021,
    goal: 6500,
  }

  const people: Array<[string, Role, Subteam[]]> = [
    ['Aarush Kikkuru', 'captain', ['software']],
    ['Anish Agrawal', 'captain', ['mechanical']],
    ['Maya Rodriguez', 'student', ['electrical']],
    ['Devin Okafor', 'student', ['mechanical']],
    ['Priya Sharma', 'student', ['notebook']],
    ['Rina Ito', 'mentor', []],
  ]
  s.members = people.map(([n, r, sub]) => member(n, r, sub, stamp))
  const idOf = (prefix: string) => s.members.find((m) => m.name.startsWith(prefix))?.id

  s.events = [
    {
      id: uid('ev'), updatedAt: stamp, title: 'Build night', date: day(-2), time: '18:00',
      endTime: '20:30', type: 'meet', location: 'Room 114 — Tech HS', attendance: true,
      source: 'local', recurrence: { freq: 'weekly', interval: 1, days: [2, 4], until: day(90) },
    },
    {
      id: uid('ev'), updatedAt: stamp, title: 'Illinois Qualifier — Naperville', date: day(12),
      time: '08:00', endTime: '18:00', type: 'comp', location: 'Naperville North HS',
      attendance: true, source: 'local',
    },
    {
      id: uid('ev'), updatedAt: stamp, title: 'Robot inspection checklist due', date: day(9),
      time: '', type: 'dead', attendance: false, source: 'local',
    },
    {
      id: uid('ev'), updatedAt: stamp, title: 'STEM night — Lincoln Elementary', date: day(5),
      time: '17:30', endTime: '19:30', type: 'out', location: 'Lincoln Elementary',
      attendance: true, source: 'local',
    },
  ]

  s.tasks = [
    { id: uid('t'), updatedAt: stamp, name: 'Re-cut intake side plates (2mm thinner)', subteam: 'mechanical', assigneeId: idOf('Devin'), due: day(3), status: 'doing' },
    { id: uid('t'), updatedAt: stamp, name: 'Tune AprilTag alignment for the far shot', subteam: 'software', assigneeId: idOf('Aarush'), due: day(4), status: 'doing' },
    { id: uid('t'), updatedAt: stamp, name: 'Rewire odometry pods — strain relief', subteam: 'electrical', assigneeId: idOf('Maya'), due: day(1), status: 'todo' },
    { id: uid('t'), updatedAt: stamp, name: 'Engineering notebook — week 6 write-up', subteam: 'notebook', assigneeId: idOf('Priya'), due: day(-1), status: 'todo' },
    { id: uid('t'), updatedAt: stamp, name: 'Practice field reset drill — under 20s', subteam: 'drive', assigneeId: idOf('Anish'), due: day(8), status: 'todo' },
    { id: uid('t'), updatedAt: stamp, name: 'Order spare 435 RPM motors', subteam: 'mechanical', assigneeId: idOf('Anish'), due: day(-3), status: 'done', doneAt: stamp },
  ]

  s.sponsors = [
    { id: uid('sp'), updatedAt: stamp, name: 'Infinity Math & Science', tier: 'Gold', amount: 2500, state: 'Received', loggedAt: stamp },
    { id: uid('sp'), updatedAt: stamp, name: 'Northbrook Machine Works', tier: 'Silver', amount: 1200, state: 'Received', loggedAt: stamp },
    { id: uid('sp'), updatedAt: stamp, name: 'Cook County Engineers Assoc.', tier: 'Silver', amount: 1000, state: 'Pledged', loggedAt: stamp },
    { id: uid('sp'), updatedAt: stamp, name: 'Lakeshore Robotics Alumni Fund', tier: 'Bronze', amount: 600, state: 'Pledged', loggedAt: stamp },
  ]

  s.allocations = [
    { id: uid('al'), updatedAt: stamp, name: 'Robot parts', cap: 2600, spent: 1840 },
    { id: uid('al'), updatedAt: stamp, name: 'Registration & events', cap: 1600, spent: 1600 },
    { id: uid('al'), updatedAt: stamp, name: 'Travel', cap: 900, spent: 240 },
    { id: uid('al'), updatedAt: stamp, name: 'Outreach materials', cap: 400, spent: 165 },
  ]

  s.parts = [
    { id: uid('p'), updatedAt: stamp, name: 'goBILDA 5203 Yellow Jacket 435 RPM', partNumber: '5203-2402-0014', vendor: 'goBILDA', category: 'Drivetrain', qty: 4, unit: 43.99, owned: true },
    { id: uid('p'), updatedAt: stamp, name: 'Mecanum wheel set 104mm', partNumber: '3213-3606-0004', vendor: 'goBILDA', category: 'Drivetrain', qty: 1, unit: 129.99, owned: true },
    { id: uid('p'), updatedAt: stamp, name: 'REV Control Hub', partNumber: 'REV-31-1595', vendor: 'REV Robotics', category: 'Electronics', qty: 1, unit: 299.99, owned: true },
    { id: uid('p'), updatedAt: stamp, name: 'Odometry pod (through-bore)', partNumber: 'REV-11-1271', vendor: 'REV Robotics', category: 'Sensors', qty: 3, unit: 34, owned: false },
    { id: uid('p'), updatedAt: stamp, name: '8mm REX shafting, 300mm', partNumber: '2101-0008-0300', vendor: 'goBILDA', category: 'Structure', qty: 6, unit: 6.99, owned: false },
  ]

  s.settings = { ...s.settings, region: 'USIL' }
  return s
}
