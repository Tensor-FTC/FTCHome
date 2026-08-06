/** Core domain model. One season of one team, plus whatever it takes to survive a gym. */

export type Role = 'coach' | 'mentor' | 'captain' | 'student' | 'parent' | 'guest'

export type Subteam = 'mechanical' | 'software' | 'electrical' | 'notebook' | 'outreach' | 'drive' | 'logistics'

export type EventType = 'meet' | 'comp' | 'out' | 'dead'

export type RsvpStatus = 'going' | 'maybe' | 'cant' | 'none'

export type Alliance = 'red' | 'blue'

export type SponsorState = 'Prospect' | 'Pledged' | 'Received' | 'Declined'

export type MediaKind = 'photo' | 'video' | 'cad' | 'match'

export type ApprovalState = 'pending' | 'approved' | 'held' | 'denied'

/** Every synced record carries these, so the outbox can order and de-duplicate writes. */
export interface Syncable {
  id: string
  updatedAt: string
  /** Soft delete — a tombstone still has to reach the server. */
  deleted?: boolean
}

/**
 * Team identity. Everything above `code` is *sourced from FTCScout*, never
 * authored here — name, city, state, rookie year and sponsors are facts about a
 * real team and guessing them is how you end up telling 11138 it is in Ontario.
 */
export interface Team extends Syncable {
  number: string
  name: string
  schoolName: string
  city: string
  state: string
  country: string
  rookieYear: number
  website: string | null
  /** Sponsors as registered with FIRST. Distinct from the money in `sponsors`. */
  registeredSponsors: string[]
  /** FTCScout region code for this team's home state, e.g. USWA. */
  region: string
  /** Season-wide performance from FTCScout, with world ranks. Null before any match. */
  seasonStats: TeamSeasonStats | null
  /** When the identity above was last pulled. Null means never — not yet set up. */
  syncedAt: string | null

  /** PBKDF2 verifier for the shared team code. Never the code itself. */
  code: PasswordVerifier | null
  /** Fundraising goal — a team decision, so it is local. */
  goal: number
}

export interface Member extends Syncable {
  name: string
  role: Role
  subteam?: Subteam
  username: string
  /** Null until the member first signs in and sets their own password. */
  password: PasswordVerifier | null
  pending: boolean
  /** Mentor/coach-only. Gated at read time by permissions, not by the UI alone. */
  medical?: MedicalRecord
  contact?: ContactRecord
  joinedAt: string
}

/** FTCScout "quick stats": average contribution, with a rank among all teams. */
export interface TeamSeasonStats {
  totalOpr: number
  totalRank: number
  autoOpr: number
  autoRank: number
  teleopOpr: number
  endgameOpr: number
  /** How many teams the ranks are out of. */
  teamCount: number
}

export interface MedicalRecord {
  notes: string
  allergies: string
  guardian: string
  guardianPhone: string
}

export interface ContactRecord {
  email: string
  phone: string
}

export interface PasswordVerifier {
  algo: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  hash: string
}

/**
 * A repeat rule. Expanded on read by domain/recurrence.ts rather than written
 * out as rows — a season of twice-weekly builds is ~50 rows of nothing, and
 * editing the series afterwards would mean rewriting every one.
 */
export interface Recurrence {
  freq: 'weekly' | 'monthly'
  /** Every N weeks/months. */
  interval: number
  /** Weekly only. 0 = Sunday. Empty means "the weekday it starts on". */
  days?: number[]
  /** Ends after this many occurrences … */
  count?: number
  /** … or on this ISO date. */
  until?: string
}

export interface CalendarEvent extends Syncable {
  title: string
  /** ISO date, YYYY-MM-DD. Times are local and stored separately so "—" stays possible. */
  date: string
  time: string
  endTime?: string
  type: EventType
  location?: string
  notes?: string
  recurrence?: Recurrence
  /** Dates in the series that were cancelled, so one skipped week is not a delete. */
  exceptions?: string[]
  /**
   * Whether this entry expects people to turn up. A deadline is on the calendar
   * but is not a meeting, and asking the team to RSVP to one is noise.
   */
  attendance?: boolean
  attachments?: Attachment[]
  /**
   * Where this entry came from. FTCScout entries are replaced wholesale on
   * refresh; locally-created ones are never touched by a pull.
   */
  source?: 'ftc-scout' | 'local'
  /** FTCScout event code, for entries that map to a real competition. */
  eventCode?: string
}

export interface Attachment {
  id: string
  name: string
  ext: string
  size: number
  /** IndexedDB blob key when the file has been cached for offline use. */
  blobKey?: string
}

export interface Rsvp extends Syncable {
  eventId: string
  memberId: string
  status: RsvpStatus
}

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done'

export interface Task extends Syncable {
  name: string
  notes?: string
  subteam?: Subteam
  assigneeId?: string
  /** ISO date, or empty for "no date". Shown on the calendar when set. */
  due: string
  /** Optional planned start, so a task can occupy a span rather than a deadline. */
  start?: string
  status: TaskStatus
  doneAt?: string
  blockedBy?: string
  createdBy?: string
}

export interface Sponsor extends Syncable {
  name: string
  tier: string
  amount: number
  state: SponsorState
  contact?: string
  loggedAt: string
}

export interface Allocation extends Syncable {
  name: string
  cap: number
  spent: number
}

export interface Approval extends Syncable {
  title: string
  amount: number
  requestedById: string
  requestedAt: string
  state: ApprovalState
  decidedById?: string
  decidedAt?: string
  note?: string
  allocationId?: string
}

/**
 * A line on the team's own bill of materials. There is no bundled parts
 * catalogue: vendor prices change constantly and no API publishes them, so a
 * shipped list would be wrong within a season. Teams add what they are actually
 * buying, or import a CSV from a vendor cart.
 */
export interface PartItem extends Syncable {
  name: string
  partNumber: string
  vendor: string
  /** Free text — teams group by subsystem, and no fixed taxonomy fits all of them. */
  category: string
  qty: number
  unit: number
  owned: boolean
  url?: string
}

export interface MediaItem extends Syncable {
  kind: MediaKind
  name: string
  caption: string
  author: string
  /** ISO date the work happened, which is how the log groups. */
  day: string
  size: number
  durationSec?: number
  tags: string[]
  /** Key into the blob store. Absent when the file is still queued or was pruned. */
  blobKey?: string
  thumbKey?: string
  mimeType?: string
  /** True while the file sits in the outbox waiting for Wi-Fi. */
  queued?: boolean
}

export interface WeeklyReport extends Syncable {
  week: number
  from: string
  to: string
  summary: string
  author: string
  shoutouts: Shoutout[]
  heroMediaId?: string
  mediaIds: string[]
  published: boolean
  publishedAt?: string
  reads: number
}

export interface Shoutout {
  id: string
  who: string
  text: string
}

export interface ScoutingNote extends Syncable {
  teamNumber: string
  teamName: string
  note: string
  opr?: number
  auto?: number
  rank?: number
}

/** A match as published by FTCScout. */
export interface Match {
  id: string
  /** Q42, SF1-1, F1 … */
  label: string
  field: string
  /** Display clock, "10:39". */
  time: string
  /**
   * Real scheduled start, ISO. This is what the countdown counts down to —
   * without it there is no honest way to say how long you have.
   */
  startsAt?: string
  red: [string, string]
  blue: [string, string]
  redScore?: number
  blueScore?: number
  played: boolean
  /** Set on the one match that is currently on deck. */
  onDeck?: boolean
}

export interface RankingRow {
  rank: number
  teamNumber: string
  teamName: string
  wins: number
  losses: number
  ties: number
  opr: number
}

export interface CompetitionEvent extends Syncable {
  code: string
  name: string
  venue: string
  city: string
  state: string
  date: string
  endDate: string
  ongoing: boolean
  finished: boolean
  matches: Match[]
  rankings: RankingRow[]
  /** Where the data came from, so the UI can be honest about staleness. */
  source: 'ftc-scout' | 'none'
  fetchedAt?: string
  /** True when it was served from cache because the network was unreachable. */
  stale?: boolean
}

/**
 * Who a given class of information is visible to.
 *
 * `everyone` includes parents and guests; `members` is the signed-in team;
 * `staff` is coaches and mentors only.
 */
export type Audience = 'everyone' | 'members' | 'staff'

/**
 * Team-configurable visibility. The app defaults to open — a team is a group of
 * people building one robot, and hiding the budget from the students raising the
 * money is usually the wrong default. Coaches can tighten any of these.
 *
 * `contactRecords` is the exception and defaults to staff-only: it is minors'
 * medical and guardian data, and that is a safeguarding decision rather than a
 * preference.
 */
export interface TeamPolicy {
  budgetFigures: Audience
  purchaseAmounts: Audience
  contactRecords: Audience
  rosterEditing: Audience
  calendarEditing: Audience
  /** Days after which finished work moves to the archive. */
  archiveAfterDays: number
}

export interface Settings {
  policy: TeamPolicy
  /**
   * Fallback alliance colour for Competition Mode when no match is scheduled.
   * When a match *is* scheduled the real side is derived from it and wins.
   */
  alliance: Alliance
  notificationsEnabled: boolean
  notifyLeadSeconds: number
  /** FTCScout season (the game's start year) and region code. */
  season: number
  region: string
  /** Event code currently loaded into Live and Competition Mode. */
  eventCode: string
  /** Forces the offline treatment on, for testing the gym case on a good connection. */
  simulateOffline: boolean
  lastSyncAt: string | null
  /** Last successful pull from FTCScout. */
  lastScoutSyncAt: string | null
}

export interface Session {
  memberId: string | null
  role: Role
  teamNumber: string
  signedInAt: string | null
  /** True when browsing without an account. */
  guest: boolean
  /** Set when the user hides the getting-started checklist by hand. */
  onboardingDismissed?: boolean
}

/** A pending write. The queue is user-visible, so it carries a human label and a size. */
export interface OutboxEntry {
  id: string
  table: SyncTable
  op: 'upsert' | 'delete'
  recordId: string
  payload: unknown
  label: string
  bytes: number
  createdAt: string
  attempts: number
  lastError?: string
}

export type SyncTable =
  | 'teams'
  | 'members'
  | 'events'
  | 'rsvps'
  | 'tasks'
  | 'sponsors'
  | 'allocations'
  | 'approvals'
  | 'media'
  | 'weekly_reports'
  | 'scouting_notes'
  | 'competition_events'
  | 'parts_state'

export interface SeasonData {
  team: Team
  members: Member[]
  events: CalendarEvent[]
  rsvps: Rsvp[]
  tasks: Task[]
  sponsors: Sponsor[]
  allocations: Allocation[]
  approvals: Approval[]
  media: MediaItem[]
  weekly: WeeklyReport[]
  scouting: ScoutingNote[]
  competition: CompetitionEvent
  parts: PartItem[]
  settings: Settings
}

export const ROLE_LABEL: Record<Role, string> = {
  coach: 'Head coach',
  mentor: 'Mentor',
  captain: 'Captain',
  student: 'Student',
  parent: 'Parent',
  guest: 'Guest',
}

export const SUBTEAM_LABEL: Record<Subteam, string> = {
  mechanical: 'Mechanical',
  software: 'Software',
  electrical: 'Electrical',
  notebook: 'Notebook',
  outreach: 'Outreach',
  drive: 'Drive team',
  logistics: 'Logistics',
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  meet: 'Build',
  comp: 'Competition',
  out: 'Outreach',
  dead: 'Deadline',
}
