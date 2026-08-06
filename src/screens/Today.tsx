import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Check, Chip, LockedValue, SectionLabel } from '@/components/ui'
import { GettingStarted } from '@/components/GettingStarted'
import { isDone } from '@/domain/tasks'
import { StatusPicker } from '@/components/StatusPicker'
import { TASK_STATUS } from '@/domain/status'
import { useStore, budgetTotals, currentMember } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { useArchive } from '@/domain/useArchive'
import { daysBetween, dueLabel, longStamp, seasonWeek, today as todayIso } from '@/lib/date'
import { money, plural } from '@/lib/format'
import { nextCompetition } from '@/domain/season'
import { SEASON_NAMES, type Season as ScoutSeason } from '@/lib/ftcScout'
import { ROLE_LABEL, type Task } from '@/domain/types'

/**
 * 04 · Today (home)
 *
 * What is next, who is needed, what is blocked — ordered by how soon it can hurt
 * you. Approvals is the gated block: mentors see the figure, everyone else sees
 * a locked chip with the amount visibly withheld rather than the row removed.
 */
export function TodayScreen() {
  const season = useStore((s) => s.season)
  const allow = useCan()
  const { current } = useArchive()
  const session = useStore((s) => s.session)
  const me = useStore(currentMember)
  const toggleTask = useStore((s) => s.toggleTask)
  const addTask = useStore((s) => s.addTask)
  const setRsvp = useStore((s) => s.setRsvp)
  const decideApproval = useStore((s) => s.decideApproval)

  const iso = todayIso()
  const [draft, setDraft] = useState('')
  const [assigneeId, setAssigneeId] = useState(me?.id ?? '')

  /**
   * The next competition, or — once the season is over — the last one, so a
   * team that has finished sees its result instead of an empty card claiming
   * nothing is booked.
   */
  const nextComp = useMemo(() => nextCompetition(season, iso), [season, iso])
  const compIsPast = Boolean(nextComp && nextComp.date < iso)

  // Build week counts from the season's own start — the earliest thing on the
  // calendar — not from whichever event happens to be first in the array.
  const kickoff = useMemo(
    () => season.events.reduce<string>((min, e) => (!min || e.date < min ? e.date : min), ''),
    [season.events],
  )
  const lastDate = useMemo(
    () => season.events.reduce<string>((max, e) => (e.date > max ? e.date : max), ''),
    [season.events],
  )
  const seasonOver = Boolean(lastDate && lastDate < iso)
  const stats = season.team.seasonStats

  const todaysMeetings = season.events.filter((e) => e.date === iso)

  // "Assigned to you" means exactly that; a coach with nothing assigned sees the team's open work.
  const myTasks = useMemo(() => {
    const open = current.tasks.filter((t) => !isDone(t))
    const mine = open.filter((t) => t.assigneeId === me?.id)
    return (mine.length ? mine : open).slice(0, 8)
  }, [current.tasks, me?.id])

  const overdue = myTasks.filter((t) => !isDone(t) && dueLabel(t.due).late).length
  const blocked = current.tasks.filter((t) => !isDone(t) && t.blockedBy)
  const pendingApprovals = season.approvals.filter((a) => a.state === 'pending')
  const notebookGaps = current.tasks.filter((t) => t.subteam === 'notebook' && !isDone(t)).length
  const going = season.rsvps.filter((r) => r.eventId === nextComp?.id && r.status === 'going').length
  const budget = budgetTotals(season)

  function submitTask(e: FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    addTask({ name, assigneeId: assigneeId || undefined, due: '', status: 'todo', createdBy: me?.id })
    setDraft('')
  }

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <div className="label" style={{ marginBottom: 5 }}>
            {longStamp(iso)}
            {kickoff && !seasonOver ? ` · WEEK ${seasonWeek(iso, kickoff)}` : ''}
            {seasonOver ? ` · ${SEASON_NAMES[season.settings.season as ScoutSeason] ?? ''} COMPLETE` : ''}
          </div>
          <h1 className="h1-lg">Today</h1>
        </div>
        <Link
          to="/settings"
          aria-label={`Signed in as ${me?.name ?? 'guest'}, ${ROLE_LABEL[session.role]}`}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: '1px solid var(--line-2)',
            background: '#161a1d',
            display: 'grid',
            placeItems: 'center',
            font: '600 11px var(--font-mono)',
            color: 'var(--signal)',
          }}
        >
          {ROLE_LABEL[session.role].charAt(0)}
        </Link>
      </div>

      <GettingStarted />

      <div className="cols cols-3">
        <div>
          {/* ── next competition ─────────────────────────── */}
          <div className="section">
            {nextComp ? (
              <Link to={`/events/${nextComp.id}`} className="card-hero" style={{ display: 'block', color: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="label">{compIsPast ? 'Last competition' : 'Next competition'}</div>
                    <div style={{ font: '600 16px/1.3 var(--font-sans)', color: 'var(--ink)', marginTop: 6 }}>
                      {nextComp.title}
                    </div>
                    <div className="meta">
                      {longStamp(nextComp.date)}
                      {nextComp.location ? ` · ${nextComp.location}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div
                      className="num"
                      style={{
                        font: '600 34px/1 var(--font-mono)',
                        color: compIsPast ? 'var(--ink-3)' : 'var(--signal)',
                      }}
                    >
                      {Math.abs(daysBetween(iso, nextComp.date))}
                    </div>
                    <div className="label" style={{ marginTop: 3 }}>
                      {compIsPast ? 'Days ago' : 'Days'}
                    </div>
                  </div>
                </div>
                <hr className="divider" style={{ margin: '14px 0 12px', background: '#242b2e' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  {/* Real season performance from FTCScout, not a status somebody typed. */}
                  <Fact
                    label="Season OPR"
                    value={stats ? stats.totalOpr.toFixed(1) : '—'}
                    sub={stats ? `#${stats.totalRank} of ${stats.teamCount.toLocaleString('en-US')}` : 'no matches yet'}
                    mono
                  />
                  <Fact
                    label="Engr. NB"
                    value={notebookGaps ? plural(notebookGaps, 'gap') : 'Current'}
                    tone={notebookGaps ? 'pressure' : 'ink'}
                  />
                  <Fact
                    label={compIsPast ? 'Attended' : 'Going'}
                    value={`${going}/${season.members.length}`}
                    mono
                  />
                </div>
              </Link>
            ) : (
              <div className="card-dashed" style={{ padding: 20, textAlign: 'center' }}>
                <div style={{ font: '500 14px var(--font-sans)', color: 'var(--ink-2)' }}>No competition booked</div>
                <p className="meta" style={{ margin: '6px 0 14px' }}>
                  Add one to the calendar and this becomes your countdown.
                </p>
                {allow('calendar.edit') && (
                  <Link to="/calendar/edit">
                    <Button variant="primary" size="sm">
                      Add a competition
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* ── today's meeting ──────────────────────────── */}
          <div className="section">
            <div className="label" style={{ marginBottom: 9 }}>
              Today&rsquo;s meeting
            </div>
            {todaysMeetings.length === 0 ? (
              <div className="card-dashed" style={{ padding: 16, textAlign: 'center' }}>
                <span className="meta">Nothing scheduled today.</span>
              </div>
            ) : (
              todaysMeetings.map((event) => {
                const mine = season.rsvps.find((r) => r.eventId === event.id && r.memberId === me?.id)
                const yes = season.rsvps.filter((r) => r.eventId === event.id && r.status === 'going').length
                const no = season.rsvps.filter((r) => r.eventId === event.id && r.status === 'cant').length
                return (
                  <div
                    key={event.id}
                    className="card card-pad"
                    style={{ display: 'flex', gap: 13, alignItems: 'center', marginBottom: 8 }}
                  >
                    <span
                      style={{
                        width: 3,
                        height: 38,
                        borderRadius: 2,
                        flex: 'none',
                        background: 'var(--signal)',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link to={`/events/${event.id}`} style={{ color: 'var(--ink-body)' }}>
                        <div style={{ font: '500 13.5px/1.3 var(--font-sans)' }}>{event.title}</div>
                      </Link>
                      <div className="meta-mono">
                        {event.time}
                        {event.endTime ? `–${event.endTime}` : ''} · {yes} going · {no} no
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={mine?.status === 'going' ? 'primary' : 'ghost'}
                      onClick={() => me && setRsvp(event.id, me.id, mine?.status === 'going' ? 'none' : 'going')}
                      disabled={!me}
                    >
                      {mine?.status === 'going' ? 'Here' : 'Here?'}
                    </Button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── tasks ──────────────────────────────────────── */}
        <div className="section">
          <SectionLabel
            aside={
              overdue > 0 ? (
                <span
                  className="mono"
                  style={{ font: '500 10px var(--font-mono)', color: 'var(--alliance-red)', letterSpacing: '0.1em' }}
                >
                  {overdue} OVERDUE
                </span>
              ) : undefined
            }
          >
            Assigned to you
          </SectionLabel>

          <div className="card" style={{ overflow: 'hidden' }}>
            {myTasks.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <span className="meta">Nothing assigned. Add the first thing below.</span>
              </div>
            ) : (
              myTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} />)
            )}

            {allow('tasks.create') && (
              <>
                <form
                  onSubmit={submitTask}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px 9px 14px', background: '#161a1d' }}
                >
                  <input
                    className="field"
                    style={{ height: 36, flex: 1, minWidth: 0, borderRadius: 9, background: 'var(--srf-0)', border: '1px solid #2a3134' }}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Add a task…"
                    aria-label="New task"
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={!draft.trim()}>
                    Add
                  </Button>
                </form>
                {allow('tasks.assignOthers') && (
                  <div className="wrap" style={{ padding: '0 14px 12px', background: '#161a1d' }}>
                    {season.members
                      .filter((m) => m.role !== 'parent')
                      .slice(0, 6)
                      .map((m) => (
                        <Chip
                          key={m.id}
                          className="chip-mono"
                          active={assigneeId === m.id}
                          onClick={() => setAssigneeId(m.id)}
                        >
                          {m.name}
                          {m.id === me?.id ? ' · you' : ''}
                        </Chip>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── approvals + blocked ────────────────────────── */}
        <div>
          <div className="section">
            <div className="label" style={{ marginBottom: 9 }}>
              Approvals
            </div>
            <div
              style={{
                border: `1px solid ${allow('approvals.decide') ? 'var(--signal-line)' : '#2a3134'}`,
                borderRadius: 14,
                background: allow('approvals.decide') ? '#141810' : 'var(--srf-1)',
                overflow: 'hidden',
              }}
            >
              {pendingApprovals.length === 0 ? (
                <div style={{ padding: 15 }}>
                  <span className="meta">Nothing waiting on a decision.</span>
                </div>
              ) : (
                pendingApprovals.map((approval) => {
                  const requester = season.members.find((m) => m.id === approval.requestedById)
                  return (
                    <div key={approval.id} style={{ padding: '14px 15px', borderBottom: '1px solid var(--line-soft)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '500 13.5px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>
                            {approval.title}
                          </div>
                          <div className="meta" style={{ marginTop: 2 }}>
                            {allow('approvals.viewAmounts')
                              ? `Requested by ${requester?.name ?? 'someone'}`
                              : 'Awaiting mentor approval'}
                          </div>
                        </div>
                        {allow('approvals.viewAmounts') ? (
                          <div className="num" style={{ font: '600 17px var(--font-mono)', color: 'var(--ink)' }}>
                            {money(approval.amount, { cents: true })}
                          </div>
                        ) : (
                          <LockedValue />
                        )}
                      </div>

                      {allow('approvals.decide') ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
                          <Button
                            variant="primary"
                            size="sm"
                            block
                            onClick={() => me && decideApproval(approval.id, 'approved', me.id)}
                          >
                            Approve
                          </Button>
                          <Button size="sm" block onClick={() => me && decideApproval(approval.id, 'held', me.id)}>
                            Hold
                          </Button>
                        </div>
                      ) : (
                        <div className="meta" style={{ marginTop: 10, color: 'var(--ink-rail)' }}>
                          Amounts are mentor-only. You&rsquo;ll see the status change here.
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {blocked.length > 0 && (
            <div className="section">
              <div className="label" style={{ marginBottom: 9 }}>
                Blocked
              </div>
              <div className="card-pressure card-pad" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ width: 3, height: 34, borderRadius: 2, background: 'var(--pressure)', flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--pressure-ink)' }}>
                    {blocked[0].blockedBy}
                  </div>
                  <div style={{ font: '400 11px/1.5 var(--font-mono)', color: 'var(--pressure-ink-2)' }}>
                    blocks {plural(blocked.length, 'task')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {allow('budget.viewAmounts') && (
            <div className="section">
              <div className="label" style={{ marginBottom: 9 }}>
                Budget
              </div>
              <Link to="/budget" className="card card-pad" style={{ display: 'block', color: 'inherit' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="num" style={{ font: '600 22px var(--font-mono)', color: 'var(--ink)' }}>
                    {money(budget.left)}
                  </span>
                  <span className="meta">left of {money(budget.raised)}</span>
                </div>
                <div className="meta" style={{ marginTop: 4 }}>
                  {plural(pendingApprovals.length, 'open request')}
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Fact({
  label,
  value,
  sub,
  tone = 'ink',
  mono,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'ink' | 'pressure'
  mono?: boolean
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="label" style={{ fontSize: 9, letterSpacing: '0.14em' }}>
        {label}
      </div>
      <div
        className={mono ? 'num' : undefined}
        style={{
          font: `500 12.5px/1.6 var(--font-${mono ? 'mono' : 'sans'})`,
          color: tone === 'pressure' ? 'var(--pressure)' : 'var(--ink-body)',
        }}
      >
        {value}
      </div>
      {sub && (
        <div className="num" style={{ font: '400 9.5px/1.4 var(--font-mono)', color: 'var(--ink-4)' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const members = useStore((s) => s.season.members)
  const updateTask = useStore((s) => s.updateTask)
  const allow = useCan()
  const due = dueLabel(task.due)
  const assignee = members.find((m) => m.id === task.assigneeId)
  return (
    <div
      style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--line-soft)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Check checked={isDone(task)} onChange={onToggle} label={`Mark "${task.name}" ${isDone(task) ? 'not done' : 'done'}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            font: '500 12.5px/1.35 var(--font-sans)',
            color: 'var(--ink-body)',
            textDecoration: isDone(task) ? 'line-through' : 'none',
            opacity: isDone(task) ? 0.5 : 1,
          }}
        >
          {task.name}
        </div>
        <div className="meta-mono">
          {task.subteam ?? 'general'}
          {assignee ? ` · ${assignee.name}` : ''}
        </div>
      </div>
      {task.due && !isDone(task) && (
        <span
          className="mono"
          style={{
            font: '500 10.5px var(--font-mono)',
            flex: 'none',
            letterSpacing: '0.04em',
            color: due.late ? 'var(--alliance-red)' : 'var(--ink-3)',
          }}
        >
          {due.text}
        </span>
      )}
      <StatusPicker
        size="sm"
        value={task.status}
        options={TASK_STATUS}
        editable={allow('tasks.create')}
        label={`Status of ${task.name}`}
        onChange={(status) =>
          updateTask(task.id, { status, doneAt: status === 'done' ? new Date().toISOString() : undefined })
        }
      />
    </div>
  )
}
