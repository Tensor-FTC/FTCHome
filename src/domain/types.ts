import type { Capability } from './permissions'

/** Core domain model. One season of one team, plus whatever it takes to run with no internet. */

export type Role = 'coach' | 'mentor' | 'captain' | 'student' | 'parent' | 'guest'

/**
 * A subteam id. Not a closed union: teams invent their own — "CAD", "Pit crew",
 * "Fundraising" — and a fixed list means somebody's real subteam has no home.
 * The built-ins below are seeded for every team; anything else a team adds
 * lives in `SeasonData.subteams` and is therefore visible to everybody.
 */
export type Subteam = string

export interface SubteamDef {
  id: string
  label: string
  /** True for the seven shipped with the app, which cannot be deleted. */
  builtIn?: boolean
}

export const BUILT_IN_SUBTEAMS: SubteamDef[] = [
  { id: 'mechanical', label: 'Mechanical', builtIn: true },
  { id: 'software', label: 'Software', builtIn: true },
  { id: 'electrical', label: 'Electrical', builtIn: true },
  { id: 'notebook', label: 'Notebook', builtIn: true },
  { id: 'outreach', label: 'Outreach', builtIn: true },
  { id: 'drive', label: 'Drive team', builtIn: true },
  { id: 'logistics', label: 'Logistics', builtIn: true },
]

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
 * real team and guessing them is how you end up telling 26022 it is in Ontario.
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

  /** Fundraising goal — a team decision, so it is local. */
  goal: number
}

/**
 * Where a person is in the process of belonging to the team.
 *
 * `requested` is the one that matters: anybody can ask to join a team, and a
 * coach decides. Without it, knowing the team code was the same as being on the
 * team, which is not a decision a six-character string should be making.
 */
export type MemberStatus = 'invited' | 'requested' | 'active' | 'declined' | 'suspended'

export interface Member extends Syncable {
  name: string
  role: Role
  /**
   * Every subteam this person is on. Most students are on two by February, and
   * forcing a single choice meant the roster was quietly wrong about half of
   * them.
   */
  subteams: Subteam[]
  username: string
  /** Null until the member first signs in and sets their own password. */
  password: PasswordVerifier | null
  status: MemberStatus
  /**
   * Extra capabilities this person has been given by name.
   *
   * The role says what someone is; this says what a coach has decided they may
   * additionally do. It is how a trusted captain gets to approve spending, or a
   * treasurer parent gets the budget, without inventing a new role for every
   * team's arrangement.
   */
  grants?: Capability[]
  /** Sign-in address, when the account is a cloud one. */
  email?: string
  /** Supabase auth user id, once they have signed in with a real account. */
  authUserId?: string
  /** Which of the sign-in methods they last used, for the roster to show. */
  authProvider?: AuthProvider
  /** Who let them in, and when. Kept because "who approved this" gets asked. */
  approvedById?: string
  approvedAt?: string
  /** Free-text note from a join request, so a coach knows who is asking. */
  requestNote?: string
  /** Mentor/coach-only. Gated at read time by permissions, not by the UI alone. */
  contact?: ContactRecord
  joinedAt: string
}

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  invited: 'Invite pending',
  requested: 'Waiting for approval',
  active: 'Active',
  declined: 'Declined',
  suspended: 'Suspended',
}

/**
 * `azure` is Supabase's key for Microsoft — it predates the Entra rename, and
 * it is what `app_metadata.provider` actually contains, so the wire value has
 * to stay `azure` even though every label says Microsoft.
 */
export type AuthProvider = 'password' | 'magic-link' | 'google' | 'github' | 'azure' | 'device'

export const AUTH_PROVIDER_LABEL: Record<AuthProvider, string> = {
  password: 'Email and password',
  'magic-link': 'Email link',
  google: 'Google',
  github: 'GitHub',
  azure: 'Microsoft',
  device: 'Team code on this device',
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

/**
 * How to reach somebody, and nothing more.
 *
 * There used to be a medical record here — allergies, notes, guardian details.
 * It is gone on purpose. A season manager is the wrong place to hold minors'
 * health data: it raises the stakes of every sync bug and every shared laptop
 * far beyond what the feature was worth, and teams already keep that
 * information where it belongs, on the FIRST consent forms.
 */
export interface ContactRecord {
  email: string
  phone: string
  /** Who to call if this person is a minor. Adults on the team have neither. */
  guardian?: string
  guardianPhone?: string
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

/**
 * A pit or match note on another team.
 *
 * Written standing up with one hand, so everything except the team number
 * is optional and the quick fields are taps rather than typing. `eventCode` ties
 * the note to the competition it was taken at, which is what lets a season's
 * worth of scouting stay separable and archivable per event.
 */
export interface ScoutingNote extends Syncable {
  teamNumber: string
  teamName: string
  note: string
  /** Pulled from FTCScout when the note is created, so it is a fact not a guess. */
  opr?: number
  auto?: number
  rank?: number
  /** The competition this was observed at. */
  eventCode?: string
  /** Match it came from, when the note is about one match rather than the pit. */
  matchLabel?: string
  /** 1–5, the scout's own read. Absent means they did not commit to one. */
  rating?: number
  /** Quick observations, tapped rather than typed. */
  tags?: string[]
  /** Alliance selection shortlist. */
  wouldPick?: boolean
  authorId?: string
  takenAt?: string
}

/** The tap-sized observations that cover most of what a scout writes down. */
export const SCOUT_TAGS = [
  'Fast cycles',
  'Reliable auto',
  'No auto',
  'Good climb',
  'No climb',
  'Strong defence',
  'Breaks down',
  'Great driver',
  'Would pick',
] as const

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

/**
 * A place the team talks.
 *
 * Three kinds, because they are governed differently. The team channel always
 * exists and cannot be left — it is where "bring your notebook tomorrow" goes.
 * Subteam channels are derived from the roster, so nobody has to maintain
 * membership by hand. Groups are whoever somebody picked, for the drive team
 * or the four people writing the notebook this week.
 */
export type ChannelKind = 'team' | 'subteam' | 'group'

export interface Channel extends Syncable {
  name: string
  kind: ChannelKind
  /** Set for `subteam` channels; membership follows the roster. */
  subteam?: Subteam
  /** Set for `group` channels; membership is exactly this list. */
  memberIds?: string[]
  topic?: string
  createdById?: string
  createdAt: string
  archived?: boolean
  /**
   * Staff-only. For a channel where coaches coordinate without the students
   * reading it — which teams do anyway, in a separate app.
   */
  staffOnly?: boolean
}

export interface ChatMessage extends Syncable {
  channelId: string
  authorId: string
  /**
   * Copied at send time rather than looked up.
   *
   * A message is a record of who said something. Resolving the name through
   * the roster means a member who leaves in March silently rewrites every
   * message they ever sent to "Unknown".
   */
  authorName: string
  body: string
  sentAt: string
  editedAt?: string
  /** True until the outbox has pushed it, so the UI can mark it in flight. */
  queued?: boolean
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
  /**
   * Last time this device opened each channel, for unread counts.
   *
   * Deliberately in the session and never synced: unread is a property of a
   * device and a person, not of the team, and syncing it would mark a phone
   * read because somebody opened a laptop.
   */
  readAt?: Record<string, string>
  /**
   * The person's real role while a coach is previewing someone else's view.
   * Absent when not previewing, so "am I previewing" is one check.
   */
  previewOf?: Role
  /** Set when signed in through Supabase rather than a device credential. */
  authUserId?: string
  email?: string
  via?: AuthProvider
  /**
   * True while a cloud account is signed in but not yet approved onto a team.
   * They can see the app's shell and their own request, and nothing else.
   */
  awaitingApproval?: boolean
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
  | 'channels'
  | 'messages'
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
  /** Built-ins plus whatever this team invented. Synced, so everyone sees them. */
  subteams: SubteamDef[]
  channels: Channel[]
  messages: ChatMessage[]
  competition: CompetitionEvent
  parts: PartItem[]
  settings: Settings
}

export const ROLE_LABEL: Record<Role, string> = {
  coach: 'Coach',
  mentor: 'Mentor',
  captain: 'Captain',
  student: 'Student',
  parent: 'Parent',
  guest: 'Guest',
}

/**
 * Labels for the built-ins only. Use `subteamLabel(season, id)` from
 * domain/subteams.ts anywhere a custom subteam could appear.
 */
export const SUBTEAM_LABEL: Record<string, string> = {
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
