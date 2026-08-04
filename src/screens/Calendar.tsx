import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Chip, IconButton } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { can } from '@/domain/permissions'
import { EVENT_TYPE_LABEL, type EventType } from '@/domain/types'
import {
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

const FILTERS: { id: EventType | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'meet', label: 'Builds' },
  { id: 'comp', label: 'Comps' },
  { id: 'out', label: 'Outreach' },
  { id: 'dead', label: 'Deadlines' },
]

/**
 * 05 · Calendar
 *
 * Month grid, season timeline, and an agenda that runs past this season into
 * next year's deadlines. The timeline shows build phases as bars against fixed
 * event marks, so slipping a phase is visible against a date you cannot move.
 */
export function CalendarScreen() {
  const season = useStore((s) => s.season)
  const role = useStore((s) => s.session.role)
  const navigate = useNavigate()

  const iso = todayIso()
  const [cursor, setCursor] = useState(() => {
    const d = fromIso(iso)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [filter, setFilter] = useState<EventType | 'all'>('all')

  const visible = useMemo(
    () => season.events.filter((e) => filter === 'all' || e.type === filter),
    [season.events, filter],
  )

  const byDate = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const e of visible) {
      const list = map.get(e.date) ?? []
      list.push(e)
      map.set(e.date, list)
    }
    return map
  }, [visible])

  const grid = monthGrid(cursor.year, cursor.month)

  const agenda = useMemo(
    () =>
      [...visible]
        .filter((e) => e.date >= iso)
        .sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.time) - timeToMinutes(b.time)),
    [visible, iso],
  )

  function step(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="h1">{monthLong(cursor.year, cursor.month)}</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <IconButton label="Previous month" small onClick={() => step(-1)}>
            ‹
          </IconButton>
          <IconButton label="Next month" small onClick={() => step(1)}>
            ›
          </IconButton>
          {can(role, 'calendar.edit') && (
            <Button size="sm" onClick={() => navigate('/calendar/edit')}>
              Edit
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
              dot={f.id === 'all' ? undefined : TYPE_COLOR[f.id]}
            >
              {f.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="cols cols-2">
        <div className="section">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 5 }}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div
                key={i}
                style={{ textAlign: 'center', font: '500 9px var(--font-mono)', color: 'var(--ink-rail)', letterSpacing: '0.1em' }}
              >
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
            {grid.map((cell) => {
              const events = byDate.get(cell.iso) ?? []
              const isToday = cell.iso === iso
              const content = (
                <>
                  <span
                    className="num"
                    style={{
                      font: '500 12px var(--font-mono)',
                      color: isToday ? 'var(--signal)' : cell.inMonth ? 'var(--ink-2)' : '#333b3e',
                    }}
                  >
                    {dayNum(cell.iso).replace(/^0/, '')}
                  </span>
                  <span style={{ display: 'flex', gap: 2, justifyContent: 'center', height: 4 }}>
                    {events.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        style={{ width: 4, height: 4, borderRadius: '50%', background: TYPE_COLOR[e.type], display: 'block' }}
                      />
                    ))}
                  </span>
                </>
              )
              const style: React.CSSProperties = {
                aspectRatio: '1',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                background: isToday ? '#1b2124' : 'transparent',
                border: `1px solid ${isToday ? 'var(--signal-line)' : 'transparent'}`,
              }
              return events.length ? (
                <Link
                  key={cell.iso}
                  to={`/events/${events[0].id}`}
                  style={{ ...style, color: 'inherit' }}
                  aria-label={`${cell.iso}, ${events.length} event${events.length > 1 ? 's' : ''}`}
                >
                  {content}
                </Link>
              ) : (
                <div key={cell.iso} style={style}>
                  {content}
                </div>
              )
            })}
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
                {can(role, 'calendar.edit') ? 'Add your first meeting.' : 'A coach adds events here.'}
              </p>
              {can(role, 'calendar.edit') && (
                <Button variant="primary" size="sm" style={{ marginTop: 12 }} onClick={() => navigate('/calendar/edit')}>
                  Add first meeting
                </Button>
              )}
            </div>
          ) : (
            agenda.map((event) => (
              <Link key={event.id} to={`/events/${event.id}`} className="row" style={{ color: 'inherit' }}>
                <span
                  style={{ width: 3, height: 36, borderRadius: 2, flex: 'none', background: TYPE_COLOR[event.type] }}
                />
                <div style={{ width: 44, flex: 'none' }}>
                  <div className="num" style={{ font: '600 14px/1.1 var(--font-mono)', color: 'var(--ink-body)' }}>
                    {dayNum(event.date)}
                  </div>
                  <div
                    style={{
                      font: '500 8.5px/1.6 var(--font-mono)',
                      color: 'var(--ink-4)',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {monShort(event.date)}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{event.title}</div>
                  <div className="meta-mono">
                    {event.time !== '—' ? `${event.time} · ` : ''}
                    {event.location || EVENT_TYPE_LABEL[event.type].toLowerCase()}
                  </div>
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

  const comps = season.events
    .filter((e) => e.type === 'comp')
    .sort((a, b) => a.date.localeCompare(b.date))
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
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${progress}%`,
                    background: phase.color,
                    borderRadius: 4,
                  }}
                />
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
              <span
                style={{
                  font: '500 8.5px var(--font-mono)',
                  color: 'var(--ink-4)',
                  whiteSpace: 'nowrap',
                }}
              >
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
