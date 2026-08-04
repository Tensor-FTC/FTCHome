import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Chip, Field, IconButton, Toggle } from '@/components/ui'
import { TYPE_COLOR } from './Calendar'
import { useStore } from '@/store/useStore'
import { can } from '@/domain/permissions'
import { EVENT_TYPE_LABEL, type EventType } from '@/domain/types'
import { addDays, dayNum, isValidIso, monShort, today as todayIso } from '@/lib/date'
import { calendarIcs, download } from '@/lib/exporters'

const TYPES: EventType[] = ['meet', 'comp', 'out', 'dead']

/**
 * C1 · Edit calendar
 *
 * One form, four fields, four types. Nothing about recurrence is hidden in a
 * submenu — the weekly-build toggle sits on the entry it affects.
 *
 * Deletes are immediate with no confirmation dialog: the list is short and
 * mistakes are cheap to retype.
 */
export function CalendarEditorScreen() {
  const season = useStore((s) => s.season)
  const role = useStore((s) => s.session.role)
  const addEvent = useStore((s) => s.addEvent)
  const updateEvent = useStore((s) => s.updateEvent)
  const removeEvent = useStore((s) => s.removeEvent)
  const notify = useStore((s) => s.notify)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayIso())
  const [time, setTime] = useState('10:00')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [type, setType] = useState<EventType>('meet')
  const [repeat, setRepeat] = useState(false)
  const [error, setError] = useState('')

  if (!can(role, 'calendar.edit')) return <Navigate to="/calendar" replace />

  function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const name = title.trim()
    if (!name) {
      setError('Give it a name')
      return
    }
    if (!isValidIso(date)) {
      setError('Pick a date')
      return
    }
    addEvent({
      title: name,
      date,
      time: time.trim() || '—',
      endTime: endTime.trim() || undefined,
      location: location.trim() || undefined,
      type,
      repeatWeeklyUntil: repeat ? addDays(date, 7 * 16) : undefined,
    })
    setTitle('')
    setLocation('')
    notify(`Added ${name}`)
  }

  const sorted = [...season.events].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <h1 className="h1">Edit calendar</h1>
        <p className="lede" style={{ marginTop: 4 }}>
          Anything you add here shows on the team calendar and on Today.
        </p>
      </div>

      <div className="cols cols-2">
        <form onSubmit={submit} className="section">
          <div className="card-quiet card-pad">
            <div className="label" style={{ marginBottom: 11 }}>
              New entry
            </div>
            <div className="stack" style={{ gap: 9 }}>
              <Field
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What is it?"
                aria-label="Event name"
                error={error}
              />
              <div style={{ display: 'flex', gap: 9 }}>
                <Field
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Date"
                  className="field-mono"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Field
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  aria-label="Start time"
                  className="field-mono"
                  style={{ width: 118, flex: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <Field
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Where?"
                  aria-label="Location"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Field
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  aria-label="End time"
                  className="field-mono"
                  style={{ width: 118, flex: 'none' }}
                />
              </div>

              <div className="wrap">
                {TYPES.map((t) => (
                  <Chip key={t} active={type === t} onClick={() => setType(t)} dot={TYPE_COLOR[t]}>
                    {EVENT_TYPE_LABEL[t]}
                  </Chip>
                ))}
              </div>

              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}
              >
                <span className="lede">Repeat weekly for 16 weeks</span>
                <Toggle checked={repeat} onChange={setRepeat} label="Repeat weekly" />
              </div>

              <Button type="submit" variant="primary" block disabled={!title.trim()}>
                Add to calendar
              </Button>
            </div>
          </div>
        </form>

        <div className="section">
          <div className="section-head" style={{ padding: 0 }}>
            <span className="label">Scheduled · {season.events.length}</span>
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

          {sorted.length === 0 ? (
            <div className="card-dashed" style={{ padding: 20, textAlign: 'center' }}>
              <span className="meta">Nothing scheduled yet.</span>
            </div>
          ) : (
            sorted.map((event) => (
              <div key={event.id} className="row">
                <span
                  style={{ width: 3, height: 36, borderRadius: 2, flex: 'none', background: TYPE_COLOR[event.type] }}
                />
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
                    onChange={(e) => updateEvent(event.id, { title: e.target.value })}
                  />
                  <div className="label" style={{ marginTop: 2, paddingLeft: 6 }}>
                    {EVENT_TYPE_LABEL[event.type]}
                    {event.repeatWeeklyUntil ? ' · WEEKLY' : ''}
                  </div>
                </div>
                <IconButton
                  label={`Delete ${event.title}`}
                  small
                  onClick={() => {
                    removeEvent(event.id)
                    notify(`Deleted ${event.title}`)
                  }}
                >
                  ×
                </IconButton>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
