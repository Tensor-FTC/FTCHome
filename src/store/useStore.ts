import { create } from 'zustand'
import {
  calendarFromScout,
  emptySeason,
  isConfigured,
  mergeScoutEvents,
  statsFromQuickStats,
  teamFromScout,
} from '@/domain/season'
import { tierById } from '@/domain/parts'
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
  Sponsor,
  Task,
  WeeklyReport,
  Syncable,
  SyncTable,
} from '@/domain/types'
import { loadSeason, loadSession, saveSeason, saveSession, clearAll } from '@/lib/idb'
import { enqueue, sync as runSync, canSync, type SyncResult } from '@/lib/sync'
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
  setMemberPassword: (memberId: string, password: string) => Promise<void>
  verifyTeamCode: (code: string) => Promise<boolean>
  setTeamCode: (code: string) => Promise<void>

  // roster
  addMember: (name: string, role: Role, subteam?: Member['subteam']) => Member
  updateMember: (id: string, patch: Partial<Member>) => void
  removeMember: (id: string) => void

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

  // parts
  setPartsTier: (tier: SeasonData['partsTier']) => void
  togglePart: (itemId: string) => void
  resetParts: () => void

  // media
  addMedia: (item: Omit<MediaItem, 'id' | 'updatedAt'>) => MediaItem
  updateMedia: (id: string, patch: Partial<MediaItem>) => void
  removeMedia: (id: string) => Promise<void>

  // weekly
  upsertWeekly: (report: WeeklyReport) => void
  publishWeekly: (id: string) => void
  addShoutout: (weekId: string, who: string, text: string) => void
  removeShoutout: (weekId: string, shoutoutId: string) => void

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
  tickMatchClock: () => void
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
      const next = season ?? emptySeason()
      if (!season) await saveSeason(next)
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
      if (member.pending) get().updateMember(memberId, { pending: false })
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
      const session = { ...get().session, role }
      set({ session })
      void saveSession(session)
    },

    async setMemberPassword(memberId, password) {
      const verifier = await hashPassword(password)
      get().updateMember(memberId, { password: verifier, pending: false })
    },

    async verifyTeamCode(code) {
      const team = get().season.team
      // A team that has not set a code yet accepts the first one offered and adopts it.
      if (!team.code) {
        await get().setTeamCode(code)
        return true
      }
      return verifyPassword(code, team.code)
    },

    async setTeamCode(code) {
      const verifier = await hashPassword(code)
      const next = stamped({ ...get().season.team, code: verifier })
      commit(
        (d) => {
          d.team = next
        },
        { table: 'teams', op: 'upsert', record: next, label: 'Team code' },
      )
    },

    // ── roster ──────────────────────────────────────────────
    addMember(name, role, subteam) {
      const team = get().season.team
      const member: Member = {
        id: uid('mem-'),
        updatedAt: now(),
        name,
        role,
        subteam,
        username: `${name.toLowerCase().replace(/[^a-z]/g, '')}@${team.number}`,
        password: null,
        pending: true,
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
      const next = stamped({ ...task, done: !task.done, doneAt: !task.done ? now() : undefined })
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
    setPartsTier(tier) {
      commit((d) => {
        d.partsTier = tier
      })
    },

    togglePart(itemId) {
      const tier = get().season.partsTier
      commit(
        (d) => {
          const owned = { ...(d.partsOwned[tier] ?? {}) }
          owned[itemId] = !owned[itemId]
          d.partsOwned = { ...d.partsOwned, [tier]: owned }
        },
        {
          table: 'parts_state',
          op: 'upsert',
          record: { id: 'parts', updatedAt: now() },
          label: 'Parts list',
        },
      )
    },

    resetParts() {
      const tier = get().season.partsTier
      commit((d) => {
        d.partsOwned = { ...d.partsOwned, [tier]: {} }
      })
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

    // ── scouting ────────────────────────────────────────────
    upsertScouting(note) {
      const existing = note.id
        ? get().season.scouting.find((s) => s.id === note.id)
        : get().season.scouting.find((s) => s.teamNumber === note.teamNumber)
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
        const season = structuredClone(get().season)
        season.team = teamFromScout(scout, season.team)
        season.settings = { ...season.settings, region: season.team.region, lastScoutSyncAt: now() }

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
          ...(next
            ? {
                matchLabel: next.label,
                matchField: next.field,
                alliance: next.red.includes(us) ? ('red' as const) : ('blue' as const),
                partner: (next.red.includes(us) ? next.red : next.blue).filter((t) => t !== us)[0] ?? '',
                opponents: next.red.includes(us) ? next.blue : next.red,
              }
            : {}),
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

    tickMatchClock() {
      const season = get().season
      const next = season.settings.matchSeconds - 1
      // Loop rather than sit at zero: the prototype's countdown is a live demo,
      // and a clock frozen at 0:00 reads as broken rather than finished.
      set({
        season: { ...season, settings: { ...season.settings, matchSeconds: next < 0 ? 138 : next } },
      })
    },

    async sync() {
      if (get().syncing) return
      set({ syncing: true })
      const season = structuredClone(get().season)
      const result = await runSync(season)
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

/** Still-needed subtotal for the active parts tier. */
export function partsTotals(season: SeasonData) {
  const tier = tierById(season.partsTier)
  const owned = season.partsOwned[tier.id] ?? {}
  let need = 0
  let all = 0
  let haveCount = 0
  for (const item of tier.items) {
    const line = item.qty * item.unit
    all += line
    if (owned[item.id]) haveCount++
    else need += line
  }
  return { need, all, haveCount, allCount: tier.items.length, tier, owned }
}

export function budgetTotals(season: SeasonData) {
  const received = season.sponsors.filter((s) => s.state === 'Received').reduce((sum, s) => sum + s.amount, 0)
  const pledged = season.sponsors.filter((s) => s.state === 'Pledged').reduce((sum, s) => sum + s.amount, 0)
  const raised = received + pledged
  const goal = season.team.goal
  const spent = season.allocations.reduce((sum, a) => sum + a.spent, 0)
  return { received, pledged, raised, goal, gap: Math.max(0, goal - raised), spent, left: raised - spent }
}
