import { create } from 'zustand'
import { toggledStatus } from '@/domain/tasks'
import { GRANTABLE, canPreviewAs, type Capability } from '@/domain/permissions'
import { missingDefaults } from '@/domain/chat'
import { subteamId } from '@/domain/subteams'
import type { AuthUser } from '@/lib/auth'
import {
  calendarFromScout,
  emptySeason,
  isConfigured,
  mergeScoutEvents,
  migrateSeason,
  statsFromQuickStats,
  teamFromScout,
} from '@/domain/season'
import {
  getEvent,
  getEventSnapshot,
  getQuickStats,
  getTeam,
  getTeamSeason,
  type Season as ScoutSeason,
} from '@/lib/ftcScout'
import type {
  Allocation,
  AuthProvider,
  Channel,
  ChatMessage,
  Approval,
  CalendarEvent,
  CompetitionEvent,
  MediaItem,
  Member,
  Role,
  Rsvp,
  ScoutingNote,
  SeasonData,
  Session,
  Settings,
  PartItem,
  Sponsor,
  Task,
  WeeklyReport,
  Syncable,
  SyncTable,
} from '@/domain/types'
import { loadSeason, loadSession, saveSeason, saveSession, clearAll } from '@/lib/idb'
import { enqueue, sync as runSync, canSync, type SyncResult } from '@/lib/sync'
import { pushMemberDecision } from '@/lib/membership'
import { now, uid } from '@/lib/id'
import { hashPassword, verifyPassword } from '@/lib/crypto'
import { dropMedia } from '@/lib/media'

/**
 * One store for the season.
 *
 * Rules it keeps so screens do not have to:
 *  - every mutation stamps `updatedAt` and appends to the sync outbox
 *  - every mutation persists to IndexedDB (debounced, so a slider does not
 *    write 60 times a second)
 *  - reads never wait on the network
 */

const GUEST_SESSION: Session = {
  memberId: null,
  role: 'guest',
  teamNumber: '',
  signedInAt: null,
  guest: true,
}

interface StoreState {
  ready: boolean
  season: SeasonData
  session: Session
  online: boolean
  syncing: boolean
  lastSyncResult: SyncResult | null
  toast: { id: string; text: string; tone: 'ok' | 'warn' } | null

  hydrate: () => Promise<void>
  setOnline: (online: boolean) => void
  notify: (text: string, tone?: 'ok' | 'warn') => void
  dismissToast: () => void

  // session
  signIn: (memberId: string, password: string) => Promise<boolean>
  signInAs: (memberId: string) => void
  browseAsGuest: () => void
  signOut: () => void
  setRole: (role: Role) => void
  /** Drops a role preview and returns to the signed-in person's own role. */
  endRolePreview: () => void
  dismissOnboarding: () => void
  setMemberPassword: (memberId: string, password: string) => Promise<void>
  /** Creates the first account on an empty team and signs in as its coach. */
  createFirstAccount: (input: { name: string; email?: string; password: string }) => Promise<Member>

  // roster
  addMember: (name: string, role: Role, subteams?: string[]) => Member
  /** Adds a subteam to the team's own list. Idempotent on the derived id. */
  addSubteam: (label: string) => string
  updateMember: (id: string, patch: Partial<Member>) => void
  removeMember: (id: string) => void
  /** Sign in with a Supabase account, matching it to a member or raising a request. */
  signInWithCloudUser: (user: AuthUser) => { ok: boolean; awaitingApproval: boolean; message: string }
  requestToJoin: (input: {
    name: string
    email?: string
    authUserId?: string
    role: Role
    note?: string
    provider?: AuthProvider
  }) => Member
  approveMember: (id: string, role?: Role) => void
  declineMember: (id: string) => void
  setGrants: (id: string, grants: Capability[]) => void

  // calendar
  addEvent: (event: Omit<CalendarEvent, 'id' | 'updatedAt'>) => CalendarEvent
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void
  removeEvent: (id: string) => void
  setRsvp: (eventId: string, memberId: string, status: Rsvp['status']) => void

  // tasks
  addTask: (task: Omit<Task, 'id' | 'updatedAt'>) => Task
  toggleTask: (id: string) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void

  // budget
  addSponsor: (sponsor: Omit<Sponsor, 'id' | 'updatedAt'>) => Sponsor
  updateSponsor: (id: string, patch: Partial<Sponsor>) => void
  removeSponsor: (id: string) => void
  setGoal: (goal: number) => void
  updateAllocation: (id: string, patch: Partial<Allocation>) => void
  addAllocation: (name: string, cap: number) => void
  removeAllocation: (id: string) => void
  addApproval: (approval: Omit<Approval, 'id' | 'updatedAt'>) => Approval
  decideApproval: (id: string, state: Approval['state'], deciderId: string) => void

  // parts — the team's own bill of materials
  addPart: (part: Omit<PartItem, 'id' | 'updatedAt'>) => PartItem
  updatePart: (id: string, patch: Partial<PartItem>) => void
  togglePart: (id: string) => void
  removePart: (id: string) => void
  importParts: (parts: Omit<PartItem, 'id' | 'updatedAt'>[]) => number

  // media
  addMedia: (item: Omit<MediaItem, 'id' | 'updatedAt'>) => MediaItem
  updateMedia: (id: string, patch: Partial<MediaItem>) => void
  removeMedia: (id: string) => Promise<void>

  // weekly
  upsertWeekly: (report: WeeklyReport) => void
  publishWeekly: (id: string) => void
  addShoutout: (weekId: string, who: string, text: string) => void
  removeShoutout: (weekId: string, shoutoutId: string) => void

  // chat
  ensureChannels: () => void
  createChannel: (input: { name: string; memberIds: string[]; topic?: string; staffOnly?: boolean }) => Channel
  updateChannel: (id: string, patch: Partial<Channel>) => void
  sendMessage: (channelId: string, body: string) => ChatMessage | null
  removeMessage: (id: string) => void
  markChannelRead: (channelId: string) => void

  // scouting
  upsertScouting: (note: Omit<ScoutingNote, 'id' | 'updatedAt'> & { id?: string }) => void
  removeScouting: (id: string) => void

  // competition
  setCompetition: (competition: CompetitionEvent) => void

  // FTCScout — the only source of factual data in the app
  adoptTeam: (teamNumber: string) => Promise<{ ok: boolean; message: string }>
  refreshTeam: () => Promise<void>
  loadEvent: (code: string) => Promise<{ ok: boolean; message: string }>
  scoutBusy: boolean

  // settings + lifecycle
  updateSettings: (patch: Partial<Settings>) => void
  sync: () => Promise<void>
  replaceSeason: (season: SeasonData) => Promise<void>
  resetSeason: () => Promise<void>
  eraseEverything: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function persistSoon(season: SeasonData): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void saveSeason(season)
    saveTimer = null
  }, 180)
}

/** Flush any debounced write immediately — used on pagehide. */
export async function flushPendingSave(season: SeasonData): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  await saveSeason(season)
}

function stamped<T extends Syncable>(record: T): T {
  return { ...record, updatedAt: now() }
}

export const useStore = create<StoreState>((set, get) => {
  /** Apply a change to the season, persist it, and queue it for sync. */
  function commit(
    mutate: (draft: SeasonData) => void,
    outbox?: { table: SyncTable; op: 'upsert' | 'delete'; record: Syncable; label: string; bytes?: number },
  ): void {
    const season = structuredClone(get().season)
    mutate(season)
    set({ season })
    persistSoon(season)
    if (outbox) {
      void enqueue(outbox.table, outbox.op, outbox.record, outbox.label, outbox.bytes)
    }
  }

  return {
    ready: false,
    season: emptySeason(),
    session: GUEST_SESSION,
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    syncing: false,
    scoutBusy: false,
    lastSyncResult: null,
    toast: null,

    async hydrate() {
      const [season, session] = await Promise.all([loadSeason(), loadSession()])
      // Migrate rather than reset: a stored season predating a model change
      // must not cost a team its roster.
      const next = migrateSeason(season)
      await saveSeason(next)
      set({ season: next, session: session ?? GUEST_SESSION, ready: true })
      // Identity and competition dates go stale; refresh quietly on open.
      if (isConfigured(next)) void get().refreshTeam()
    },

    setOnline(online) {
      set({ online })
      if (online && canSync()) void get().sync()
    },

    notify(text, tone = 'ok') {
      set({ toast: { id: uid('t-'), text, tone } })
    },

    dismissToast() {
      set({ toast: null })
    },

    // ── session ─────────────────────────────────────────────
    async signIn(memberId, password) {
      const member = get().season.members.find((m) => m.id === memberId)
      if (!member) return false
      // First sign-in: the member has no verifier yet, so this call sets one.
      if (!member.password) {
        await get().setMemberPassword(memberId, password)
      } else if (!(await verifyPassword(password, member.password))) {
        return false
      }
      const session: Session = {
        memberId,
        role: member.role,
        teamNumber: get().season.team.number,
        signedInAt: now(),
        guest: false,
      }
      set({ session })
      void saveSession(session)
      if (member.status === 'invited') get().updateMember(memberId, { status: 'active' })
      return true
    },

    signInAs(memberId) {
      const member = get().season.members.find((m) => m.id === memberId)
      if (!member) return
      const session: Session = {
        memberId,
        role: member.role,
        teamNumber: get().season.team.number,
        signedInAt: now(),
        guest: false,
      }
      set({ session })
      void saveSession(session)
    },

    browseAsGuest() {
      set({ session: GUEST_SESSION })
      void saveSession(GUEST_SESSION)
    },

    signOut() {
      set({ session: GUEST_SESSION })
      void saveSession(GUEST_SESSION)
    },

    setRole(role) {
      const me = currentMember(get())
      // Remember the real one the first time, so "back to me" is always exact.
      const previewOf = get().session.previewOf ?? me?.role
      const real = previewOf ?? me?.role ?? 'guest'

      /*
       * A preview may only ever narrow. This changes `session.role`, which is
       * what every `allow()` in the UI reads, so without the guard it is a role
       * switcher rather than a preview — a student who reached it could pick
       * coach and read the budget. Enforced here rather than by hiding the
       * chips, because the chips are a UI detail and this is the rule.
       */
      if (!canPreviewAs(real, role, get().season.settings.policy)) return

      const session: Session =
        me && role === previewOf
          ? { ...get().session, role, previewOf: undefined }
          : { ...get().session, role, previewOf }
      set({ session })
      void saveSession(session)
    },

    endRolePreview() {
      const me = currentMember(get())
      const session: Session = {
        ...get().session,
        role: get().session.previewOf ?? me?.role ?? 'guest',
        previewOf: undefined,
      }
      set({ session })
      void saveSession(session)
    },

    dismissOnboarding() {
      const session = { ...get().session, onboardingDismissed: true }
      set({ session })
      void saveSession(session)
    },

    async setMemberPassword(memberId, password) {
      const verifier = await hashPassword(password)
      get().updateMember(memberId, { password: verifier, status: 'active' })
    },

    /**
     * The first account on an empty team.
     *
     * Whoever sets the app up is the coach, with no approval step — there is
     * nobody to approve them, and requiring one would be a deadlock. Every
     * account after this one goes through the roster.
     *
     * Guarded on the team being genuinely empty so it cannot be used to mint a
     * second coach on a team that already has people.
     */
    async createFirstAccount({ name, email, password }) {
      const existing = get().season.members.filter((m) => m.status === 'active')
      if (existing.length) throw new Error('This team already has members. Ask one of them to add you.')

      const verifier = await hashPassword(password)
      const team = get().season.team
      const member: Member = {
        id: uid('mem-'),
        updatedAt: now(),
        name: name.trim(),
        role: 'coach',
        subteams: [],
        username: email?.trim() || `${name.toLowerCase().replace(/[^a-z]/g, '')}@${team.number}`,
        password: verifier,
        status: 'active',
        email: email?.trim() || undefined,
        authProvider: 'device',
        joinedAt: now(),
      }
      commit((d) => void d.members.push(member), {
        table: 'members',
        op: 'upsert',
        record: member,
        label: `Member · ${member.name}`,
      })
      get().signInAs(member.id)
      return member
    },

    // ── roster ──────────────────────────────────────────────
    addSubteam(label) {
      const id = subteamId(label)
      if (!id) return id
      if (get().season.subteams.some((s) => s.id === id)) return id
      const next = [...get().season.subteams, { id, label: label.trim() }]
      commit(
        (d) => {
          d.subteams = next
        },
        // Rides the team record: it is one small list, not a table of its own.
        {
          table: 'teams',
          op: 'upsert',
          record: stamped({ ...get().season.team }),
          label: `Subteam · ${label}`,
        },
      )
      return id
    },

    addMember(name, role, subteams) {
      const team = get().season.team
      const member: Member = {
        id: uid('mem-'),
        updatedAt: now(),
        name,
        role,
        subteams: subteams ?? [],
        username: `${name.toLowerCase().replace(/[^a-z]/g, '')}@${team.number}`,
        password: null,
        status: 'invited',
        joinedAt: now(),
      }
      commit((d) => void d.members.push(member), {
        table: 'members',
        op: 'upsert',
        record: member,
        label: `Member · ${name}`,
      })
      return member
    },

    /**
     * Bring a Supabase account onto this device.
     *
     * Matching is by auth id first, then by email, because a coach usually adds
     * somebody by email before that person has ever signed in. Anybody who
     * matches nothing becomes a *request* rather than a member: knowing a URL
     * is not the same as being on a team, and a coach decides which is which.
     */
    signInWithCloudUser(user) {
      const members = get().season.members
      let member =
        members.find((m) => m.authUserId === user.id) ??
        (user.email ? members.find((m) => m.email?.toLowerCase() === user.email.toLowerCase()) : undefined)

      if (!member) {
        /*
         * Nobody on the team yet means this person is setting it up, so they
         * are its coach and there is no approval step — there would be nobody
         * to give it, and waiting for one would deadlock the whole team.
         * Mirrors claim_team() in the migration, which enforces the same rule
         * server-side.
         */
        const firstOnTeam = !members.some((m) => m.status === 'active')
        member = get().requestToJoin({
          name: user.name || user.email.split('@')[0] || 'New member',
          email: user.email,
          authUserId: user.id,
          role: firstOnTeam ? 'coach' : 'student',
          provider: user.provider,
        })
        if (firstOnTeam) {
          get().approveMember(member.id, 'coach')
          member = get().season.members.find((m) => m.id === member!.id) ?? member
        }
      } else if (member.authUserId !== user.id || member.authProvider !== user.provider) {
        // First cloud sign-in for someone a coach added by email: bind the account.
        get().updateMember(member.id, { authUserId: user.id, authProvider: user.provider, email: user.email })
        member = { ...member, authUserId: user.id, authProvider: user.provider, email: user.email }
      }

      const approved = member.status === 'active'
      const session: Session = {
        memberId: member.id,
        role: approved ? member.role : 'guest',
        teamNumber: get().season.team.number,
        signedInAt: now(),
        guest: false,
        authUserId: user.id,
        email: user.email,
        via: user.provider,
        awaitingApproval: !approved,
      }
      set({ session })
      void saveSession(session)

      return {
        ok: true,
        awaitingApproval: !approved,
        message: approved
          ? `Signed in as ${member.name}`
          : 'Your request is with the coaches. You are in as soon as one of them accepts it.',
      }
    },

    requestToJoin({ name, email, authUserId, role, note, provider }) {
      const team = get().season.team
      const member: Member = {
        id: uid('mem-'),
        updatedAt: now(),
        name,
        role,
        subteams: [],
        username: email || `${name.toLowerCase().replace(/[^a-z]/g, '')}@${team.number}`,
        password: null,
        status: 'requested',
        email,
        authUserId,
        authProvider: provider,
        requestNote: note,
        joinedAt: now(),
      }
      commit((d) => void d.members.push(member), {
        table: 'members',
        op: 'upsert',
        record: member,
        label: `Join request · ${name}`,
      })
      return member
    },

    approveMember(id, role) {
      const approver = get().session.memberId
      const existing = get().season.members.find((m) => m.id === id)
      const decided = role ?? existing?.role ?? 'student'
      get().updateMember(id, {
        status: 'active',
        role: decided,
        approvedById: approver ?? undefined,
        approvedAt: now(),
      })
      /*
       * The roster is local; what the database will accept is not. Without
       * this, an approved student keeps being refused every write, while their
       * own device shows them fully on the team — the most confusing shape a
       * permission bug can take. Fire-and-forget: it is a mirror of a decision
       * already made, and a coach approving somebody offline should not be
       * blocked on the network.
       */
      if (existing?.authUserId) {
        void pushMemberDecision(get().season.team.number, existing.authUserId, 'active', decided)
      }
      // If it is *this* device waiting, take the session off hold immediately.
      const session = get().session
      if (session.memberId === id && session.awaitingApproval) {
        const next: Session = {
          ...session,
          awaitingApproval: false,
          role: role ?? existing?.role ?? 'student',
        }
        set({ session: next })
        void saveSession(next)
      }
    },

    declineMember(id) {
      const existing = get().season.members.find((m) => m.id === id)
      get().updateMember(id, {
        status: 'declined',
        approvedById: get().session.memberId ?? undefined,
        approvedAt: now(),
      })
      // Revoke server-side too, or a declined account keeps its sync access.
      if (existing?.authUserId) {
        void pushMemberDecision(get().season.team.number, existing.authUserId, 'declined')
      }
    },

    setGrants(id, grants) {
      // Never store a grant the permission layer would refuse to honour; a
      // stored-but-ignored grant is a coach believing they gave access.
      get().updateMember(id, { grants: grants.filter((g) => GRANTABLE.includes(g)) })
    },

    updateMember(id, patch) {
      const next = stamped({ ...get().season.members.find((m) => m.id === id)!, ...patch })
      commit(
        (d) => {
          const i = d.members.findIndex((m) => m.id === id)
          if (i >= 0) d.members[i] = next
        },
        { table: 'members', op: 'upsert', record: next, label: `Member · ${next.name}` },
      )
    },

    removeMember(id) {
      const member = get().season.members.find((m) => m.id === id)
      if (!member) return
      commit(
        (d) => {
          d.members = d.members.filter((m) => m.id !== id)
          d.rsvps = d.rsvps.filter((r) => r.memberId !== id)
          // Orphaned tasks stay, unassigned — deleting someone's work with them is never right.
          d.tasks = d.tasks.map((t) => (t.assigneeId === id ? { ...t, assigneeId: undefined } : t))
        },
        { table: 'members', op: 'delete', record: member, label: `Removed ${member.name}` },
      )
    },

    // ── calendar ────────────────────────────────────────────
    addEvent(event) {
      const record: CalendarEvent = { ...event, id: uid('ev-'), updatedAt: now() }
      commit((d) => void d.events.push(record), {
        table: 'events',
        op: 'upsert',
        record,
        label: `Event · ${record.title}`,
      })
      return record
    },

    updateEvent(id, patch) {
      const next = stamped({ ...get().season.events.find((e) => e.id === id)!, ...patch })
      commit(
        (d) => {
          const i = d.events.findIndex((e) => e.id === id)
          if (i >= 0) d.events[i] = next
        },
        { table: 'events', op: 'upsert', record: next, label: `Event · ${next.title}` },
      )
    },

    removeEvent(id) {
      const event = get().season.events.find((e) => e.id === id)
      if (!event) return
      commit(
        (d) => {
          d.events = d.events.filter((e) => e.id !== id)
          d.rsvps = d.rsvps.filter((r) => r.eventId !== id)
        },
        { table: 'events', op: 'delete', record: event, label: `Removed ${event.title}` },
      )
    },

    setRsvp(eventId, memberId, status) {
      const existing = get().season.rsvps.find((r) => r.eventId === eventId && r.memberId === memberId)
      const record: Rsvp = existing
        ? stamped({ ...existing, status })
        : { id: uid('rsvp-'), updatedAt: now(), eventId, memberId, status }
      commit(
        (d) => {
          const i = d.rsvps.findIndex((r) => r.id === record.id)
          if (i >= 0) d.rsvps[i] = record
          else d.rsvps.push(record)
        },
        { table: 'rsvps', op: 'upsert', record, label: 'RSVP' },
      )
    },

    // ── tasks ───────────────────────────────────────────────
    addTask(task) {
      const record: Task = { ...task, id: uid('task-'), updatedAt: now() }
      commit((d) => void d.tasks.unshift(record), {
        table: 'tasks',
        op: 'upsert',
        record,
        label: `Task · ${record.name}`,
      })
      return record
    },

    toggleTask(id) {
      const task = get().season.tasks.find((t) => t.id === id)
      if (!task) return
      const status = toggledStatus(task.status)
      const next = stamped({ ...task, status, doneAt: status === 'done' ? now() : undefined })
      commit(
        (d) => {
          const i = d.tasks.findIndex((t) => t.id === id)
          if (i >= 0) d.tasks[i] = next
        },
        { table: 'tasks', op: 'upsert', record: next, label: `Task · ${next.name}` },
      )
    },

    updateTask(id, patch) {
      const next = stamped({ ...get().season.tasks.find((t) => t.id === id)!, ...patch })
      commit(
        (d) => {
          const i = d.tasks.findIndex((t) => t.id === id)
          if (i >= 0) d.tasks[i] = next
        },
        { table: 'tasks', op: 'upsert', record: next, label: `Task · ${next.name}` },
      )
    },

    removeTask(id) {
      const task = get().season.tasks.find((t) => t.id === id)
      if (!task) return
      commit((d) => void (d.tasks = d.tasks.filter((t) => t.id !== id)), {
        table: 'tasks',
        op: 'delete',
        record: task,
        label: `Removed ${task.name}`,
      })
    },

    // ── budget ──────────────────────────────────────────────
    addSponsor(sponsor) {
      const record: Sponsor = { ...sponsor, id: uid('sp-'), updatedAt: now() }
      commit((d) => void d.sponsors.push(record), {
        table: 'sponsors',
        op: 'upsert',
        record,
        label: `Sponsor · ${record.name}`,
      })
      return record
    },

    updateSponsor(id, patch) {
      const next = stamped({ ...get().season.sponsors.find((s) => s.id === id)!, ...patch })
      commit(
        (d) => {
          const i = d.sponsors.findIndex((s) => s.id === id)
          if (i >= 0) d.sponsors[i] = next
        },
        { table: 'sponsors', op: 'upsert', record: next, label: `Sponsor · ${next.name}` },
      )
    },

    removeSponsor(id) {
      const sponsor = get().season.sponsors.find((s) => s.id === id)
      if (!sponsor) return
      commit((d) => void (d.sponsors = d.sponsors.filter((s) => s.id !== id)), {
        table: 'sponsors',
        op: 'delete',
        record: sponsor,
        label: `Removed ${sponsor.name}`,
      })
    },

    setGoal(goal) {
      const next = stamped({ ...get().season.team, goal })
      commit(
        (d) => {
          d.team = next
        },
        { table: 'teams', op: 'upsert', record: next, label: 'Season goal' },
      )
    },

    updateAllocation(id, patch) {
      const next = stamped({ ...get().season.allocations.find((a) => a.id === id)!, ...patch })
      commit(
        (d) => {
          const i = d.allocations.findIndex((a) => a.id === id)
          if (i >= 0) d.allocations[i] = next
        },
        { table: 'allocations', op: 'upsert', record: next, label: `Allocation · ${next.name}` },
      )
    },

    addAllocation(name, cap) {
      const record: Allocation = { id: uid('al-'), updatedAt: now(), name, cap, spent: 0 }
      commit((d) => void d.allocations.push(record), {
        table: 'allocations',
        op: 'upsert',
        record,
        label: `Allocation · ${name}`,
      })
    },

    removeAllocation(id) {
      const allocation = get().season.allocations.find((a) => a.id === id)
      if (!allocation) return
      commit((d) => void (d.allocations = d.allocations.filter((a) => a.id !== id)), {
        table: 'allocations',
        op: 'delete',
        record: allocation,
        label: `Removed ${allocation.name}`,
      })
    },

    addApproval(approval) {
      const record: Approval = { ...approval, id: uid('ap-'), updatedAt: now() }
      commit((d) => void d.approvals.unshift(record), {
        table: 'approvals',
        op: 'upsert',
        record,
        label: `Request · ${record.title}`,
      })
      return record
    },

    decideApproval(id, state, deciderId) {
      const approval = get().season.approvals.find((a) => a.id === id)
      if (!approval) return
      const next = stamped({ ...approval, state, decidedById: deciderId, decidedAt: now() })
      commit(
        (d) => {
          const i = d.approvals.findIndex((a) => a.id === id)
          if (i >= 0) d.approvals[i] = next
          // An approved purchase moves real money out of its allocation.
          if (state === 'approved' && next.allocationId) {
            const ai = d.allocations.findIndex((a) => a.id === next.allocationId)
            if (ai >= 0) d.allocations[ai] = stamped({ ...d.allocations[ai], spent: d.allocations[ai].spent + next.amount })
          }
        },
        { table: 'approvals', op: 'upsert', record: next, label: `${state} · ${next.title}` },
      )
    },

    // ── parts ───────────────────────────────────────────────
    addPart(part) {
      const record: PartItem = { ...part, id: uid('part-'), updatedAt: now() }
      commit((d) => void d.parts.push(record), {
        table: 'parts_state',
        op: 'upsert',
        record,
        label: `Part · ${record.name}`,
      })
      return record
    },

    updatePart(id, patch) {
      const next = stamped({ ...get().season.parts.find((p) => p.id === id)!, ...patch })
      commit(
        (d) => {
          const i = d.parts.findIndex((p) => p.id === id)
          if (i >= 0) d.parts[i] = next
        },
        { table: 'parts_state', op: 'upsert', record: next, label: `Part · ${next.name}` },
      )
    },

    togglePart(id) {
      const part = get().season.parts.find((p) => p.id === id)
      if (!part) return
      get().updatePart(id, { owned: !part.owned })
    },

    removePart(id) {
      const part = get().season.parts.find((p) => p.id === id)
      if (!part) return
      commit((d) => void (d.parts = d.parts.filter((p) => p.id !== id)), {
        table: 'parts_state',
        op: 'delete',
        record: part,
        label: `Removed ${part.name}`,
      })
    },

    importParts(rows) {
      const records: PartItem[] = rows.map((r) => ({ ...r, id: uid('part-'), updatedAt: now() }))
      commit((d) => void d.parts.push(...records))
      for (const record of records) {
        void enqueue('parts_state', 'upsert', record, `Part · ${record.name}`)
      }
      return records.length
    },

    // ── media ───────────────────────────────────────────────
    addMedia(item) {
      const record: MediaItem = { ...item, id: uid('md-'), updatedAt: now() }
      commit((d) => void d.media.unshift(record), {
        table: 'media',
        op: 'upsert',
        record,
        label: `${record.kind} · ${record.name}`,
        bytes: record.size,
      })
      return record
    },

    updateMedia(id, patch) {
      const next = stamped({ ...get().season.media.find((m) => m.id === id)!, ...patch })
      commit(
        (d) => {
          const i = d.media.findIndex((m) => m.id === id)
          if (i >= 0) d.media[i] = next
        },
        { table: 'media', op: 'upsert', record: next, label: `Media · ${next.name}` },
      )
    },

    async removeMedia(id) {
      const item = get().season.media.find((m) => m.id === id)
      if (!item) return
      await dropMedia(item.blobKey, item.thumbKey)
      commit(
        (d) => {
          d.media = d.media.filter((m) => m.id !== id)
          d.weekly = d.weekly.map((w) => ({
            ...w,
            mediaIds: w.mediaIds.filter((x) => x !== id),
            heroMediaId: w.heroMediaId === id ? undefined : w.heroMediaId,
          }))
        },
        { table: 'media', op: 'delete', record: item, label: `Removed ${item.name}` },
      )
    },

    // ── weekly ──────────────────────────────────────────────
    upsertWeekly(report) {
      const next = stamped(report)
      commit(
        (d) => {
          const i = d.weekly.findIndex((w) => w.id === report.id)
          if (i >= 0) d.weekly[i] = next
          else d.weekly.push(next)
        },
        { table: 'weekly_reports', op: 'upsert', record: next, label: `Week ${next.week}` },
      )
    },

    publishWeekly(id) {
      const report = get().season.weekly.find((w) => w.id === id)
      if (!report) return
      const next = stamped({ ...report, published: true, publishedAt: now() })
      commit(
        (d) => {
          const i = d.weekly.findIndex((w) => w.id === id)
          if (i >= 0) d.weekly[i] = next
        },
        { table: 'weekly_reports', op: 'upsert', record: next, label: `Published week ${next.week}` },
      )
    },

    addShoutout(weekId, who, text) {
      const report = get().season.weekly.find((w) => w.id === weekId)
      if (!report) return
      const next = stamped({ ...report, shoutouts: [...report.shoutouts, { id: uid('so-'), who, text }] })
      commit(
        (d) => {
          const i = d.weekly.findIndex((w) => w.id === weekId)
          if (i >= 0) d.weekly[i] = next
        },
        { table: 'weekly_reports', op: 'upsert', record: next, label: 'Shoutout' },
      )
    },

    removeShoutout(weekId, shoutoutId) {
      const report = get().season.weekly.find((w) => w.id === weekId)
      if (!report) return
      const next = stamped({ ...report, shoutouts: report.shoutouts.filter((s) => s.id !== shoutoutId) })
      commit(
        (d) => {
          const i = d.weekly.findIndex((w) => w.id === weekId)
          if (i >= 0) d.weekly[i] = next
        },
        { table: 'weekly_reports', op: 'upsert', record: next, label: 'Shoutout removed' },
      )
    },

    // ── chat ────────────────────────────────────────────────
    /**
     * Create the channels the roster implies, if they are not there yet.
     *
     * Called when Chat is first opened rather than at sign-up: a team of one
     * does not need a mechanical channel, and six empty rooms is a worse first
     * impression than one with people in it.
     */
    ensureChannels() {
      const wanted = missingDefaults(get().season)
      if (!wanted.length) return
      const created = wanted.map((c) => ({ ...c, id: uid('ch-'), updatedAt: now() }) as Channel)
      for (const channel of created) {
        commit((d) => void d.channels.push(channel), {
          table: 'channels',
          op: 'upsert',
          record: channel,
          label: `Channel · ${channel.name}`,
        })
      }
    },

    createChannel({ name, memberIds, topic, staffOnly }) {
      const me = get().session.memberId
      const channel: Channel = {
        id: uid('ch-'),
        updatedAt: now(),
        name: name.trim(),
        kind: 'group',
        // Whoever made it is always in it; leaving your own group out is the
        // classic way to create a room you cannot see.
        memberIds: [...new Set([...memberIds, me].filter((x): x is string => Boolean(x)))],
        topic: topic?.trim() || undefined,
        staffOnly,
        createdById: me ?? undefined,
        createdAt: now(),
      }
      commit((d) => void d.channels.push(channel), {
        table: 'channels',
        op: 'upsert',
        record: channel,
        label: `Channel · ${channel.name}`,
      })
      return channel
    },

    updateChannel(id, patch) {
      const existing = get().season.channels.find((c) => c.id === id)
      if (!existing) return
      const next = stamped({ ...existing, ...patch })
      commit(
        (d) => {
          const i = d.channels.findIndex((c) => c.id === id)
          if (i >= 0) d.channels[i] = next
        },
        { table: 'channels', op: 'upsert', record: next, label: `Channel · ${next.name}` },
      )
    },

    sendMessage(channelId, body) {
      const text = body.trim()
      if (!text) return null
      const me = currentMember(get())
      const message: ChatMessage = {
        id: uid('msg-'),
        updatedAt: now(),
        channelId,
        authorId: me?.id ?? 'unknown',
        // Copied, not looked up: a member who leaves in March must not rewrite
        // every message they ever sent to "Unknown".
        authorName: me?.name ?? 'Someone',
        body: text,
        sentAt: now(),
      }
      commit((d) => void d.messages.push(message), {
        table: 'messages',
        op: 'upsert',
        record: message,
        label: `Message · ${text.slice(0, 32)}`,
      })
      // Sending is also reading; otherwise your own message shows as unread.
      get().markChannelRead(channelId)
      return message
    },

    removeMessage(id) {
      const message = get().season.messages.find((m) => m.id === id)
      if (!message) return
      commit((d) => void (d.messages = d.messages.filter((m) => m.id !== id)), {
        table: 'messages',
        op: 'delete',
        record: message,
        label: 'Message deleted',
      })
    },

    markChannelRead(channelId) {
      const session = get().session
      const next: Session = { ...session, readAt: { ...session.readAt, [channelId]: now() } }
      set({ session: next })
      void saveSession(next)
    },

    // ── scouting ────────────────────────────────────────────
    upsertScouting(note) {
      const existing = note.id
        ? get().season.scouting.find((s) => s.id === note.id)
        : get().season.scouting.find(
            (s) => s.teamNumber === note.teamNumber && (s.eventCode ?? '') === (note.eventCode ?? ''),
          )
      const record: ScoutingNote = stamped({
        ...(existing ?? { id: uid('sc-'), updatedAt: now() }),
        ...note,
        id: existing?.id ?? note.id ?? uid('sc-'),
      } as ScoutingNote)
      commit(
        (d) => {
          const i = d.scouting.findIndex((s) => s.id === record.id)
          if (i >= 0) d.scouting[i] = record
          else d.scouting.push(record)
        },
        { table: 'scouting_notes', op: 'upsert', record, label: `Pit note · ${record.teamNumber}` },
      )
    },

    removeScouting(id) {
      const note = get().season.scouting.find((s) => s.id === id)
      if (!note) return
      commit((d) => void (d.scouting = d.scouting.filter((s) => s.id !== id)), {
        table: 'scouting_notes',
        op: 'delete',
        record: note,
        label: `Removed note ${note.teamNumber}`,
      })
    },

    setCompetition(competition) {
      const next = stamped(competition)
      commit(
        (d) => {
          d.competition = next
        },
        { table: 'competition_events', op: 'upsert', record: next, label: `Event · ${next.code}` },
      )
    },

    // ── FTCScout ────────────────────────────────────────────
    /**
     * Look a team up and adopt its real identity and competition schedule.
     * This is the only way factual data enters the app.
     */
    async adoptTeam(teamNumber) {
      set({ scoutBusy: true })
      try {
        const { team: scout } = await getTeam(teamNumber)
        const previousNumber = get().season.team.number
        const switching = Boolean(previousNumber) && previousNumber !== String(scout.number)

        // Switching teams starts clean. Another team's roster, schedule, budget
        // and scouting notes are not yours, and silently inheriting them is how
        // an app ends up showing numbers nobody can account for.
        const season = switching ? emptySeason() : structuredClone(get().season)
        season.team = teamFromScout(scout, season.team)
        season.settings = {
          ...season.settings,
          season: get().season.settings.season,
          region: season.team.region,
          lastScoutSyncAt: now(),
        }

        const scoutSeason = season.settings.season as ScoutSeason
        season.team.seasonStats = statsFromQuickStats(await getQuickStats(scout.number, scoutSeason))

        const participations = await getTeamSeason(scout.number, season.settings.season as ScoutSeason)
        const details = await Promise.all(
          participations.map((p) => getEvent(season.settings.season as ScoutSeason, p.eventCode).catch(() => null)),
        )
        const events = details.filter((e): e is NonNullable<typeof e> => Boolean(e))
        season.events = mergeScoutEvents(season.events, calendarFromScout(events, participations))

        set({ season })
        await saveSeason(season)
        void enqueue('teams', 'upsert', season.team, `Team · ${season.team.number}`)

        if (switching) {
          set({ session: GUEST_SESSION })
          await saveSession(GUEST_SESSION)
        }

        return {
          ok: true,
          message: `${scout.number} ${scout.name} · ${[scout.city, scout.state].filter(Boolean).join(', ')}`,
        }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Lookup failed' }
      } finally {
        set({ scoutBusy: false })
      }
    },

    /** Quiet refresh of identity and schedule. Never clobbers local calendar entries. */
    async refreshTeam() {
      const current = get().season
      if (!current.team.number) return
      try {
        const { team: scout } = await getTeam(current.team.number)
        const participations = await getTeamSeason(scout.number, current.settings.season as ScoutSeason)
        const details = await Promise.all(
          participations.map((p) => getEvent(current.settings.season as ScoutSeason, p.eventCode).catch(() => null)),
        )
        const events = details.filter((e): e is NonNullable<typeof e> => Boolean(e))

        const stats = statsFromQuickStats(await getQuickStats(scout.number, current.settings.season as ScoutSeason))

        const season = structuredClone(get().season)
        season.team = teamFromScout(scout, season.team)
        season.team.seasonStats = stats
        season.events = mergeScoutEvents(season.events, calendarFromScout(events, participations))
        season.settings = { ...season.settings, lastScoutSyncAt: now() }
        set({ season })
        await saveSeason(season)
      } catch {
        // Offline or upstream down. The cached season is still on screen, which
        // is the whole point — a failed refresh is not an error state.
      }
    },

    /** Pull one event's rankings and full match schedule. */
    async loadEvent(code) {
      const trimmed = code.trim().toUpperCase()
      if (!trimmed) return { ok: false, message: 'Enter an event code.' }
      set({ scoutBusy: true })
      try {
        const seasonNumber = get().season.settings.season as ScoutSeason
        const snap = await getEventSnapshot(seasonNumber, trimmed)
        const us = get().season.team.number

        const competition: CompetitionEvent = {
          id: 'competition',
          updatedAt: now(),
          code: snap.code,
          name: snap.name,
          venue: snap.venue,
          city: snap.city,
          state: snap.state,
          date: snap.start,
          endDate: snap.end,
          ongoing: snap.ongoing,
          finished: snap.finished,
          source: 'ftc-scout',
          fetchedAt: snap.fetchedAt,
          stale: snap.stale,
          rankings: snap.rankings.map((r) => ({
            rank: r.rank,
            teamNumber: r.teamNumber,
            teamName: r.teamName,
            wins: r.wins,
            losses: r.losses,
            ties: r.ties,
            opr: r.opr,
          })),
          matches: snap.matches.map((m) => ({
            id: m.id,
            label: m.label,
            field: m.field,
            time: m.time,
            startsAt: m.startsAt,
            red: [m.red[0] ?? '—', m.red[1] ?? '—'],
            blue: [m.blue[0] ?? '—', m.blue[1] ?? '—'],
            redScore: m.redScore,
            blueScore: m.blueScore,
            played: m.played,
          })),
        }

        // Point the countdown at our own next unplayed match at this event.
        const ours = competition.matches.filter((m) => [...m.red, ...m.blue].includes(us))
        const next = ours.find((m) => !m.played)
        if (next) next.onDeck = true

        const season = structuredClone(get().season)
        season.competition = competition
        season.settings = {
          ...season.settings,
          eventCode: snap.code,
          lastScoutSyncAt: now(),
          // Alliance is the only thing worth remembering here, as a fallback for
          // Competition Mode when nothing is scheduled. Everything else about a
          // match is derived from the schedule at render time.
          ...(next ? { alliance: next.red.includes(us) ? ('red' as const) : ('blue' as const) } : {}),
        }
        set({ season })
        await saveSeason(season)

        return {
          ok: true,
          message: snap.stale
            ? `${snap.name} · showing cached data`
            : `${snap.name} · ${snap.rankings.length} teams, ${snap.matches.length} matches`,
        }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Could not load that event' }
      } finally {
        set({ scoutBusy: false })
      }
    },

    // ── settings + lifecycle ────────────────────────────────
    updateSettings(patch) {
      commit((d) => {
        d.settings = { ...d.settings, ...patch }
      })
    },

    async sync() {
      if (get().syncing) return
      set({ syncing: true })
      const season = structuredClone(get().season)
      const me = currentMember(get())
      const result = await runSync(season, me?.name ?? '')
      // Anything that made it to the server is no longer waiting on Wi-Fi.
      if (result.pushed > 0 && result.failed === 0) {
        season.media = season.media.map((m) => (m.queued ? { ...m, queued: false } : m))
      }
      set({ syncing: false, lastSyncResult: result, season })
      await saveSeason(season)
      if (result.pushed || result.pulled) {
        get().notify(`Synced · ${result.pushed} sent, ${result.pulled} received`)
      } else if (result.error && !result.skipped) {
        get().notify(result.error, 'warn')
      }
    },

    async replaceSeason(season) {
      set({ season })
      await saveSeason(season)
    },

    /** Clears team-entered data but keeps the team's real identity and schedule. */
    async resetSeason() {
      const current = get().season
      const season = emptySeason()
      season.team = current.team
      season.settings = { ...season.settings, season: current.settings.season, region: current.settings.region }
      set({ season })
      await saveSeason(season)
      if (current.team.number) void get().refreshTeam()
      get().notify('Season data cleared. Team identity kept.')
    },

    async eraseEverything() {
      await clearAll()
      const season = emptySeason()
      set({ season, session: GUEST_SESSION })
      await saveSeason(season)
      await saveSession(GUEST_SESSION)
    },
  }
})

// ── derived selectors ─────────────────────────────────────────

export function currentMember(state: { season: SeasonData; session: Session }): Member | null {
  if (!state.session.memberId) return null
  return state.season.members.find((m) => m.id === state.session.memberId) ?? null
}

/** Still-needed subtotal for the team's bill of materials. */
export function partsTotals(season: SeasonData) {
  let need = 0
  let all = 0
  let haveCount = 0
  for (const item of season.parts) {
    const line = item.qty * item.unit
    all += line
    if (item.owned) haveCount++
    else need += line
  }
  return { need, all, haveCount, allCount: season.parts.length }
}

export function budgetTotals(season: SeasonData) {
  const received = season.sponsors.filter((s) => s.state === 'Received').reduce((sum, s) => sum + s.amount, 0)
  const pledged = season.sponsors.filter((s) => s.state === 'Pledged').reduce((sum, s) => sum + s.amount, 0)
  const raised = received + pledged
  const goal = season.team.goal
  const spent = season.allocations.reduce((sum, a) => sum + a.spent, 0)
  return { received, pledged, raised, goal, gap: Math.max(0, goal - raised), spent, left: raised - spent }
}
