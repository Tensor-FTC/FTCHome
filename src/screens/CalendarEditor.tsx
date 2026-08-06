import { useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Chip, Field, IconButton, Select, Toggle } from '@/components/ui'
import { RecurrenceEditor } from '@/components/RecurrenceEditor'
import { TYPE_COLOR } from './Calendar'
import { useStore } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { describeRecurrence } from '@/domain/recurrence'
import { TASK_STATUS_LABEL, TASK_STATUSES } from '@/domain/tasks'
import {
  EVENT_TYPE_LABEL,
  SUBTEAM_LABEL,
  type CalendarEvent,
  type EventType,
  type Recurrence,
  type Subteam,
} from '@/domain/types'
import { dayNum, dueLabel, isValidIso, monShort, today as todayIso } from '@/lib/date'
import { calendarIcs, download } from '@/lib/exporters'

const TYPES: EventType[] = ['meet', 'comp', 'out', 'dead']

/**
 * Whether people are expected to turn up. A parts order deadline belongs on the
 * calendar but asking the team to RSVP to it is noise, so attendance defaults
 * per type and stays overridable.
 */
const ATTENDANCE_BY_DEFAULT: Record<EventType, boolean> = {
  meet: true,
  comp: true,
  out: true,
  dead: false,
}

const SUBTEAMS = Object.keys(SUBTEAM_LABEL) as Subteam[]

/**
 * C1 · Plan
 *
 * A planner, not an event list. Three things go on a team calendar and they are
 * genuinely different: sessions people attend, dates that simply exist, and work
 * that is due. Putting them behind one "add event" form was why everything
 * looked like a meeting.
 */
export function CalendarEditorScreen() {
  const allow = useCan()
  const [tab, setTab] = useState<'entry' | 'task'>('entry')

  if (!allow('calendar.edit')) return <Navigate to="/calendar" replace />

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <h1 className="h1">Plan</h1>
        <p className="lede" style={{ marginTop: 4 }}>
          Schedule sessions, mark dates that matter, and give work a deadline. Everything here shows on the
          calendar and on Today.
        </p>
      </div>

      <div className="section" style={{ paddingTop: 12 }}>
        <div className="wrap">
          <Chip active={tab === 'entry'} onClick={() => setTab('entry')}>
            Calendar entry
          </Chip>
          <Chip active={tab === 'task'} onClick={() => setTab('task')}>
            Task or deadline
          </Chip>
        </div>
      </div>

      <div className="cols cols-2">
        {tab === 'entry' ? <EntryForm /> : <TaskForm />}
        <Scheduled />
      </div>
    </div>
  )
}

// ── new calendar entry ──────────────────────────────────────

function EntryForm() {
  const addEvent = useStore((s) => s.addEvent)
  const notify = useStore((s) => s.notify)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayIso())
  const [time, setTime] = useState('10:00')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [type, setType] = useState<EventType>('meet')
  const [attendance, setAttendance] = useState(true)
  // Null until the coach touches the toggle, so changing type can still move it.
  const [attendanceTouched, setAttendanceTouched] = useState(false)
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>()
  const [error, setError] = useState('')

  function pickType(next: EventType) {
    setType(next)
    if (!attendanceTouched) setAttendance(ATTENDANCE_BY_DEFAULT[next])
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const name = title.trim()
    if (!name) return setError('Give it a name')
    if (!isValidIso(date)) return setError('Pick a date')

    addEvent({
      title: name,
      date,
      time: time.trim() || '—',
      endTime: endTime.trim() || undefined,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      type,
      attendance,
      recurrence,
      source: 'local',
    })
    setTitle('')
    setLocation('')
    setNotes('')
    setRecurrence(undefined)
    notify(recurrence ? `Added ${name}, repeating` : `Added ${name}`)
  }

  return (
    <form onSubmit={submit} className="section">
      <div className="card-quiet card-pad">
        <div className="label" style={{ marginBottom: 11 }}>
          New calendar entry
        </div>
        <div className="stack" style={{ gap: 11 }}>
          <Field
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is it?"
            aria-label="Entry name"
            error={error}
          />

          <div className="wrap">
            {TYPES.map((t) => (
              <Chip key={t} active={type === t} onClick={() => pickType(t)} dot={TYPE_COLOR[t]}>
                {EVENT_TYPE_LABEL[t]}
              </Chip>
            ))}
          </div>

          <div className="field-row">
            <Field label="Date" type="date" mono value={date} onChange={(e) => setDate(e.target.value)} />
            <Field label="Starts" type="time" mono value={time} onChange={(e) => setTime(e.target.value)} />
            <Field label="Ends" type="time" mono value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>

          <Field
            label="Where"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Room, school, venue"
          />

          <Field
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the team should know"
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span className="lede" style={{ minWidth: 0 }}>
              Expect the team to turn up
              <span className="meta" style={{ display: 'block' }}>
                Adds RSVP and counts attendance. Off for dates that are just dates.
              </span>
            </span>
            <Toggle
              checked={attendance}
              onChange={(next) => {
                setAttendance(next)
                setAttendanceTouched(true)
              }}
              label="Expect attendance"
            />
          </div>

          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 11 }}>
            <RecurrenceEditor value={recurrence} onChange={setRecurrence} startDate={date} />
          </div>

          <Button type="submit" variant="primary" block disabled={!title.trim()}>
            Add to calendar
          </Button>
        </div>
      </div>
    </form>
  )
}

// ── new task ────────────────────────────────────────────────

function TaskForm() {
  const season = useStore((s) => s.season)
  const addTask = useStore((s) => s.addTask)
  const notify = useStore((s) => s.notify)

  const [name, setName] = useState('')
  const [due, setDue] = useState(todayIso())
  const [start, setStart] = useState('')
  const [subteam, setSubteam] = useState<Subteam | ''>('')
  const [assigneeId, setAssigneeId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const label = name.trim()
    if (!label) return setError('Give it a name')
    if (due && !isValidIso(due)) return setError('Pick a due date, or clear it')

    addTask({
      name: label,
      due,
      start: start || undefined,
      subteam: subteam || undefined,
      assigneeId: assigneeId || undefined,
      notes: notes.trim() || undefined,
      status: 'todo',
    })
    setName('')
    setNotes('')
    notify(`Added ${label}`)
  }

  return (
    <form onSubmit={submit} className="section">
      <div className="card-quiet card-pad">
        <div className="label" style={{ marginBottom: 11 }}>
          New task
        </div>
        <div className="stack" style={{ gap: 11 }}>
          <Field
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What needs doing?"
            aria-label="Task name"
            error={error}
          />

          <div className="field-row">
            <Field label="Due" type="date" mono value={due} onChange={(e) => setDue(e.target.value)} />
            <Field
              label="Start (optional)"
              type="date"
              mono
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>

          <div className="field-row">
            <Select label="Subteam" value={subteam} onChange={(e) => setSubteam(e.target.value as Subteam | '')}>
              <option value="">No subteam</option>
              {SUBTEAMS.map((s) => (
                <option key={s} value={s}>
                  {SUBTEAM_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select label="Owner" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {season.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>

          <Field
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detail, links, part numbers"
          />

          <p className="meta">
            Tasks with a due date appear on the calendar and on Today. Anyone can move them along from
            {' '}To do to Done.
          </p>

          <Button type="submit" variant="primary" block disabled={!name.trim()}>
            Add task
          </Button>
        </div>
      </div>
    </form>
  )
}

// ── everything already scheduled ────────────────────────────

function Scheduled() {
  const season = useStore((s) => s.season)
  const updateEvent = useStore((s) => s.updateEvent)
  const removeEvent = useStore((s) => s.removeEvent)
  const updateTask = useStore((s) => s.updateTask)
  const removeTask = useStore((s) => s.removeTask)
  const notify = useStore((s) => s.notify)
  const [show, setShow] = useState<'events' | 'tasks'>('events')

  const events = useMemo(
    () => [...season.events].sort((a, b) => a.date.localeCompare(b.date)),
    [season.events],
  )
  const tasks = useMemo(
    () => [...season.tasks].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')),
    [season.tasks],
  )

  return (
    <div className="section">
      <div className="section-head" style={{ padding: 0 }}>
        <span className="label">{show === 'events' ? `Scheduled · ${events.length}` : `Tasks · ${tasks.length}`}</span>
        <Button
          size="sm"
          variant="quiet"
          onClick={() =>
            download(`ftc-${season.team.number}-calendar.ics`, calendarIcs(season), 'text/calendar;charset=utf-8')
          }
        >
          Export .ics
        </Button>
      </div>

      <div className="wrap" style={{ marginBottom: 10 }}>
        <Chip active={show === 'events'} onClick={() => setShow('events')}>
          Calendar
        </Chip>
        <Chip active={show === 'tasks'} onClick={() => setShow('tasks')}>
          Tasks
        </Chip>
      </div>

      {show === 'events' ? (
        events.length === 0 ? (
          <Nothing>Nothing scheduled yet.</Nothing>
        ) : (
          events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              onChange={(patch) => updateEvent(event.id, patch)}
              onDelete={() => {
                removeEvent(event.id)
                notify(`Deleted ${event.title}`)
              }}
            />
          ))
        )
      ) : tasks.length === 0 ? (
        <Nothing>No tasks yet.</Nothing>
      ) : (
        tasks.map((task) => (
          <div key={task.id} className="row">
            <div style={{ width: 52, flex: 'none' }}>
              {task.due ? (
                <>
                  <div className="num" style={{ font: '600 13px/1.2 var(--font-mono)', color: 'var(--ink-body)' }}>
                    {monShort(task.due)} {dayNum(task.due)}
                  </div>
                  <div
                    className="num"
                    style={{
                      font: '500 9.5px/1.5 var(--font-mono)',
                      color: dueLabel(task.due).late && task.status !== 'done' ? 'var(--pressure)' : 'var(--ink-4)',
                    }}
                  >
                    {dueLabel(task.due).text}
                  </div>
                </>
              ) : (
                <span className="meta-mono">no date</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                className="field"
                style={{ height: 32, background: 'transparent', padding: '0 6px', font: '500 13px var(--font-sans)' }}
                value={task.name}
                aria-label={`Rename ${task.name}`}
                onChange={(e) => updateTask(task.id, { name: e.target.value })}
              />
              <div className="label" style={{ marginTop: 2, paddingLeft: 6 }}>
                {task.subteam ? SUBTEAM_LABEL[task.subteam] : 'No subteam'}
              </div>
            </div>
            <select
              className="field"
              aria-label={`Status of ${task.name}`}
              style={{ width: 118, flex: 'none', height: 32, font: '500 11.5px var(--font-sans)' }}
              value={task.status}
              onChange={(e) => updateTask(task.id, { status: e.target.value as (typeof TASK_STATUSES)[number] })}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <IconButton
              label={`Delete ${task.name}`}
              small
              onClick={() => {
                removeTask(task.id)
                notify(`Deleted ${task.name}`)
              }}
            >
              ×
            </IconButton>
          </div>
        ))
      )}
    </div>
  )
}

function Nothing({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-dashed" style={{ padding: 20, textAlign: 'center' }}>
      <span className="meta">{children}</span>
    </div>
  )
}

/**
 * One scheduled entry. Editing expands in place rather than pushing to another
 * screen: changing "every Tuesday" to "Tuesday and Thursday" is a two-second
 * job and should not cost a navigation.
 */
function EventRow({
  event,
  onChange,
  onDelete,
}: {
  event: CalendarEvent
  onChange: (patch: Partial<CalendarEvent>) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const fromScout = event.source === 'ftc-scout'

  return (
    <div style={{ borderBottom: '1px solid var(--line)' }}>
      <div className="row" style={{ borderBottom: 'none' }}>
        <span style={{ width: 3, height: 36, borderRadius: 2, flex: 'none', background: TYPE_COLOR[event.type] }} />
        <div style={{ width: 56, flex: 'none' }}>
          <div className="num" style={{ font: '600 13px/1.2 var(--font-mono)', color: 'var(--ink-body)' }}>
            {monShort(event.date)} {dayNum(event.date)}
          </div>
          <div className="num" style={{ font: '500 9.5px/1.5 var(--font-mono)', color: 'var(--ink-4)' }}>
            {event.time}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            className="field"
            style={{ height: 32, background: 'transparent', padding: '0 6px', font: '500 13px var(--font-sans)' }}
            value={event.title}
            aria-label={`Rename ${event.title}`}
            disabled={fromScout}
            onChange={(e) => onChange({ title: e.target.value })}
          />
          <div className="label" style={{ marginTop: 2, paddingLeft: 6 }}>
            {EVENT_TYPE_LABEL[event.type]}
            {event.recurrence ? ` · ${describeRecurrence(event.recurrence)}` : ''}
            {event.attendance ? ' · RSVP' : ''}
            {fromScout ? ' · FTCSCOUT' : ''}
          </div>
        </div>
        {!fromScout && (
          <IconButton label={`Edit ${event.title}`} small onClick={() => setOpen((o) => !o)}>
            {open ? '−' : '⋯'}
          </IconButton>
        )}
        <IconButton label={`Delete ${event.title}`} small onClick={onDelete}>
          ×
        </IconButton>
      </div>

      {open && !fromScout && (
        <div className="stack" style={{ gap: 11, padding: '4px 10px 16px' }}>
          <div className="wrap">
            {TYPES.map((t) => (
              <Chip key={t} active={event.type === t} onClick={() => onChange({ type: t })} dot={TYPE_COLOR[t]}>
                {EVENT_TYPE_LABEL[t]}
              </Chip>
            ))}
          </div>
          <div className="field-row">
            <Field label="Date" type="date" mono value={event.date} onChange={(e) => onChange({ date: e.target.value })} />
            <Field
              label="Starts"
              type="time"
              mono
              value={event.time === '—' ? '' : event.time}
              onChange={(e) => onChange({ time: e.target.value || '—' })}
            />
            <Field
              label="Ends"
              type="time"
              mono
              value={event.endTime ?? ''}
              onChange={(e) => onChange({ endTime: e.target.value || undefined })}
            />
          </div>
          <Field
            label="Where"
            value={event.location ?? ''}
            onChange={(e) => onChange({ location: e.target.value || undefined })}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span className="lede">Expect the team to turn up</span>
            <Toggle
              checked={Boolean(event.attendance)}
              onChange={(next) => onChange({ attendance: next })}
              label="Expect attendance"
            />
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 11 }}>
            <RecurrenceEditor
              value={event.recurrence}
              onChange={(recurrence) => onChange({ recurrence })}
              startDate={event.date}
            />
          </div>
          {Boolean(event.exceptions?.length) && (
            <div className="meta">
              {event.exceptions?.length} skipped {event.exceptions?.length === 1 ? 'date' : 'dates'} ·{' '}
              <button
                type="button"
                className="link"
                onClick={() => onChange({ exceptions: [] })}
                style={{ color: 'var(--signal)' }}
              >
                restore all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
