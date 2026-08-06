import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Chip, IconButton } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { expandAll, occurrenceId } from '@/domain/recurrence'
import { isDone } from '@/domain/tasks'
import { EVENT_TYPE_LABEL, type EventType } from '@/domain/types'
import {
  addDays,
  dayNum,
  fromIso,
  monShort,
  monthGrid,
  monthLong,
  timeToMinutes,
  today as todayIso,
} from '@/lib/date'
import { calendarIcs, download } from '@/lib/exporters'

/** Event types are colour-coded from the neutral-plus-lime set — never alliance colour. */
export const TYPE_COLOR: Record<EventType, string> = {
  meet: 'var(--signal)',
  comp: '#E4E9EA',
  out: 'var(--signal-dim)',
  dead: 'var(--pressure)',
}

type Filter = EventType | 'all' | 'task'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'meet', label: 'Builds' },
  { id: 'comp', label: 'Comps' },
  { id: 'out', label: 'Outreach' },
  { id: 'dead', label: 'Deadlines' },
  { id: 'task', label: 'Tasks' },
]

/** One thing happening on one day — a calendar occurrence or a task that is due. */
interface DayItem {
  key: string
  date: string
  title: string
  color: string
  to: string
  time: string
  sub: string
  done: boolean
  sort: number
}

/**
 * 05 · Calendar
 *
 * A month grid of hairline cells, a season timeline, and an agenda that runs
 * past this season into next year's deadlines.
 *
 * Repeating entries are expanded here rather than stored as rows, so a team
 * that builds every Tuesday and Thursday has one record and fifty dates. Task
 * due dates land on the same grid: a deadline nobody can see is a deadline
 * nobody meets.
 */
export function CalendarScreen() {
  const season = useStore((s) => s.season)
  const allow = useCan()
  const navigate = useNavigate()

  const iso = todayIso()
  const [cursor, setCursor] = useState(() => {
    const d = fromIso(iso)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [filter, setFilter] = useState<Filter>('all')

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const gridFrom = grid[0]?.iso ?? iso
  const gridTo = grid[grid.length - 1]?.iso ?? iso

  const showEvents = filter !== 'task'
  const showTasks = filter === 'all' || filter === 'task'

  /** Everything falling inside `[from, to]`, occurrences expanded, tasks folded in. */
  const itemsIn = useMemo(() => {
    return (from: string, to: string): DayItem[] => {
      const out: DayItem[] = []

      if (showEvents) {
        const events = season.events.filter((e) => filter === 'all' || e.type === filter)
        for (const occ of expandAll(events, from, to)) {
          const e = occ.event
          out.push({
            key: occurrenceId(e, occ.date),
            date: occ.date,
            title: e.title,
            color: TYPE_COLOR[e.type],
            to: `/events/${occurrenceId(e, occ.date)}`,
            time: e.time,
            sub: [e.time !== '—' ? e.time : null, e.location || EVENT_TYPE_LABEL[e.type].toLowerCase()]
              .filter(Boolean)
              .join(' · '),
            done: false,
            sort: timeToMinutes(e.time),
          })
        }
      }

      if (showTasks) {
        for (const task of season.tasks) {
          if (!task.due || task.due < from || task.due > to) continue
          const late = !isDone(task) && task.due < iso
          out.push({
            key: `task-${task.id}`,
            date: task.due,
            title: task.name,
            color: isDone(task) ? 'var(--ink-5)' : late ? 'var(--pressure)' : 'var(--ink-3)',
            to: '/today',
            time: '—',
            sub: `due · ${task.subteam ?? 'task'}`,
            done: isDone(task),
            // Due dates sit after timed entries in a day.
            sort: 24 * 60 + 1,
          })
        }
      }

      return out.sort((a, b) => a.date.localeCompare(b.date) || a.sort - b.sort || a.title.localeCompare(b.title))
    }
  }, [season.events, season.tasks, filter, showEvents, showTasks, iso])

  const byDate = useMemo(() => {
    const map = new Map<string, DayItem[]>()
    for (const item of itemsIn(gridFrom, gridTo)) {
      const list = map.get(item.date) ?? []
      list.push(item)
      map.set(item.date, list)
    }
    return map
  }, [itemsIn, gridFrom, gridTo])

  // A year ahead is enough to catch next season's kickoff without walking forever.
  const agenda = useMemo(() => itemsIn(iso, addDays(iso, 365)).slice(0, 40), [itemsIn, iso])

  function step(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  return (
    <div className="screen">
      <div
        className="section"
        style={{ paddingTop: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}
      >
        <h1 className="h1">{monthLong(cursor.year, cursor.month)}</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <IconButton label="Previous month" small onClick={() => step(-1)}>
            ‹
          </IconButton>
          <IconButton
            label="Back to this month"
            small
            onClick={() => {
              const d = fromIso(iso)
              setCursor({ year: d.getFullYear(), month: d.getMonth() })
            }}
          >
            ·
          </IconButton>
          <IconButton label="Next month" small onClick={() => step(1)}>
            ›
          </IconButton>
          {allow('calendar.edit') && (
            <Button size="sm" onClick={() => navigate('/calendar/edit')}>
              Plan
            </Button>
          )}
        </div>
      </div>

      <div className="section" style={{ paddingTop: 12 }}>
        <div className="wrap">
          {FILTERS.map((f) => (
            <Chip
              key={f.id}
              active={filter === f.id}
              onClick={() => setFilter(f.id)}
              dot={f.id === 'all' || f.id === 'task' ? undefined : TYPE_COLOR[f.id]}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="cols cols-2">
        <div className="section">
          <div className="cal">
            <div className="cal-head">
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
                <span key={d}>{d.slice(0, 1)}</span>
              ))}
            </div>
            <div className="cal-grid">
              {grid.map((cell) => {
                const items = byDate.get(cell.iso) ?? []
                const classes = [
                  'cal-cell',
                  cell.inMonth ? '' : 'is-outside',
                  cell.iso === iso ? 'is-today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <div key={cell.iso} className={classes}>
                    <span className="cal-date">{dayNum(cell.iso).replace(/^0/, '')}</span>
                    {items.slice(0, 3).map((item) => (
                      <Link
                        key={item.key}
                        to={item.to}
                        className={`cal-chip${item.done ? ' is-done' : ''}`}
                        title={`${item.title} — ${item.sub}`}
                      >
                        <i style={{ background: item.color }} />
                        <span>{item.title}</span>
                      </Link>
                    ))}
                    {items.length > 3 && <span className="cal-more">+{items.length - 3} more</span>}
                  </div>
                )
              })}
            </div>
          </div>

          <SeasonTimeline />
        </div>

        <div className="section">
          <div className="section-head" style={{ padding: 0 }}>
            <span className="label">Agenda &amp; deadlines</span>
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

          {agenda.length === 0 ? (
            <div className="card-dashed" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ font: '500 13px var(--font-sans)', color: 'var(--ink-2)' }}>Nothing ahead</div>
              <p className="meta" style={{ marginTop: 4 }}>
                {allow('calendar.edit') ? 'Add your first meeting.' : 'A coach adds events here.'}
              </p>
              {allow('calendar.edit') && (
                <Button variant="primary" size="sm" style={{ marginTop: 12 }} onClick={() => navigate('/calendar/edit')}>
                  Add first meeting
                </Button>
              )}
            </div>
          ) : (
            agenda.map((item) => (
              <Link key={item.key} to={item.to} className="row" style={{ color: 'inherit' }}>
                <span style={{ width: 3, height: 36, borderRadius: 2, flex: 'none', background: item.color }} />
                <div style={{ width: 44, flex: 'none' }}>
                  <div className="num" style={{ font: '600 14px/1.1 var(--font-mono)', color: 'var(--ink-body)' }}>
                    {dayNum(item.date)}
                  </div>
                  <div style={{ font: '500 8.5px/1.6 var(--font-mono)', color: 'var(--ink-4)', letterSpacing: '0.1em' }}>
                    {monShort(item.date)}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      font: '500 13px/1.3 var(--font-sans)',
                      color: 'var(--ink-body)',
                      textDecoration: item.done ? 'line-through' : 'none',
                    }}
                  >
                    {item.title}
                  </div>
                  <div className="meta-mono">{item.sub}</div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Build phases as bars against fixed marks. Phases are derived from the season's
 * own competition dates rather than hard-coded, so a team with one qualifier and
 * a team with four both get a truthful timeline.
 */
function SeasonTimeline() {
  const season = useStore((s) => s.season)
  const iso = todayIso()

  const comps = season.events.filter((e) => e.type === 'comp').sort((a, b) => a.date.localeCompare(b.date))
  const start = season.events.map((e) => e.date).sort()[0] ?? iso
  const end = comps[comps.length - 1]?.date ?? season.events.map((e) => e.date).sort().at(-1) ?? iso

  const span = Math.max(1, fromIso(end).getTime() - fromIso(start).getTime())
  const at = (date: string) => ((fromIso(date).getTime() - fromIso(start).getTime()) / span) * 100

  const phases = [
    { name: 'Kickoff & strategy', from: start, to: addPct(start, end, 0.18), color: 'var(--line-3)' },
    { name: 'Prototype', from: addPct(start, end, 0.18), to: addPct(start, end, 0.4), color: 'var(--ink-5)' },
    { name: 'Build v1', from: addPct(start, end, 0.4), to: addPct(start, end, 0.72), color: 'var(--signal)' },
    { name: 'Drive practice', from: addPct(start, end, 0.72), to: end, color: 'var(--signal-dim)' },
  ]

  if (season.events.length === 0) return null

  return (
    <div style={{ marginTop: 20 }}>
      <div className="label" style={{ marginBottom: 10 }}>
        Season timeline
      </div>
      <div className="card card-pad" style={{ padding: 14 }}>
        {phases.map((phase) => {
          const left = Math.max(0, at(phase.from))
          const right = Math.min(100, at(phase.to))
          const progress = Math.min(100, Math.max(0, ((at(iso) - left) / Math.max(1, right - left)) * 100))
          return (
            <div key={phase.name} style={{ marginBottom: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ font: '500 10.5px var(--font-sans)', color: '#b7c0c3' }}>{phase.name}</span>
                <span className="meta-mono" style={{ fontSize: 9.5 }}>
                  {monShort(phase.from)} {dayNum(phase.from)} – {monShort(phase.to)} {dayNum(phase.to)}
                </span>
              </div>
              <div style={{ height: 7, borderRadius: 4, background: '#1c2225', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${progress}%`, background: phase.color, borderRadius: 4 }} />
              </div>
            </div>
          )
        })}

        <div style={{ position: 'relative', height: 24, marginTop: 6, borderTop: '1px solid #242b2e', paddingTop: 7 }}>
          {comps.slice(0, 4).map((comp) => (
            <div
              key={comp.id}
              style={{
                position: 'absolute',
                left: `${Math.min(96, Math.max(4, at(comp.date)))}%`,
                top: 0,
                textAlign: 'center',
                transform: 'translateX(-50%)',
              }}
            >
              <span style={{ width: 1, height: 7, background: 'var(--ink-5)', display: 'block', margin: '0 auto' }} />
              <span style={{ font: '500 8.5px var(--font-mono)', color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
                {monShort(comp.date)} {dayNum(comp.date)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function addPct(from: string, to: string, fraction: number): string {
  const a = fromIso(from).getTime()
  const b = fromIso(to).getTime()
  const d = new Date(a + (b - a) * fraction)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
