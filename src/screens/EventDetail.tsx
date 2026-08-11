import { useMemo } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Avatar, Button, IconButton, Meter } from '@/components/ui'
import { useStore, currentMember } from '@/store/useStore'
import { describeRecurrence, parseOccurrenceId } from '@/domain/recurrence'
import { eventStaffing } from '@/domain/staffing'
import { describeSubteams, inSubteam } from '@/domain/subteams'
import { EVENT_TYPE_LABEL, ROLE_LABEL, type RsvpStatus } from '@/domain/types'
import { longStamp } from '@/lib/date'
import { bytes } from '@/lib/format'

/**
 * 06 · Event detail
 *
 * RSVP, forecast, the roster of who cannot come, and attachments that work with
 * no signal.
 *
 * "Who can't make it" is shown by name deliberately. Hiding it is how teams
 * arrive at a qualifier without a backup coach.
 */
export function EventDetailScreen() {
  const { eventId: routeId = '' } = useParams()
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const me = useStore(currentMember)
  const online = useStore((s) => s.online)
  const setRsvp = useStore((s) => s.setRsvp)
  const updateEvent = useStore((s) => s.updateEvent)
  const notify = useStore((s) => s.notify)

  /**
   * A repeating entry is one record and many dates, so the route carries
   * `id@date`. RSVPs are keyed on that whole string: "I can't make next
   * Tuesday" must not mean "I can't make any Tuesday".
   */
  const { eventId, date: occurrenceDate } = parseOccurrenceId(routeId)
  const event = season.events.find((e) => e.id === eventId)
  const offline = !online || season.settings.simulateOffline
  const rsvpKey = routeId

  const counts = useMemo(() => {
    const forEvent = season.rsvps.filter((r) => r.eventId === rsvpKey)
    const by = (status: RsvpStatus) => forEvent.filter((r) => r.status === status).length
    const going = by('going')
    const maybe = by('maybe')
    const cant = by('cant')
    return { going, maybe, cant, silent: Math.max(0, season.members.length - going - maybe - cant) }
  }, [season.rsvps, season.members.length, rsvpKey])

  if (!event) return <Navigate to="/calendar" replace />

  const shownDate = occurrenceDate ?? event.date
  // Attendance is opt-in per entry: a parts deadline is on the calendar but
  // nobody turns up to it, and asking the team to RSVP would be noise.
  const expectsAttendance = event.attendance ?? event.type !== 'dead'

  const mine = season.rsvps.find((r) => r.eventId === rsvpKey && r.memberId === me?.id)
  const cantMake = season.rsvps
    .filter((r) => r.eventId === rsvpKey && r.status === 'cant')
    .map((r) => season.members.find((m) => m.id === r.memberId))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))

  const staffing = eventStaffing(season, rsvpKey)
  const driveGap = cantMake.some((m) => inSubteam(m, 'drive'))

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <IconButton label="Back" onClick={() => navigate(-1)} style={{ marginBottom: 14 }}>
          ←
        </IconButton>

        {offline && (
          <div className="status-strip" style={{ marginBottom: 14 }}>
            <span className="dot" />
            <span>Cached. Everything here works offline.</span>
          </div>
        )}

        <div className="label" style={{ marginBottom: 6 }}>
          {EVENT_TYPE_LABEL[event.type]} · {longStamp(shownDate)}
        </div>
        <h1 className="h1" style={{ marginBottom: 4 }}>
          {event.title}
        </h1>
        <div className="lede">
          {[event.location, event.time !== '—' ? `starts ${event.time}` : null, event.endTime ? `ends ${event.endTime}` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
        {event.notes && (
          <p className="body pretty" style={{ marginTop: 10, color: 'var(--ink-3)' }}>
            {event.notes}
          </p>
        )}
        {event.recurrence && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            <span className="meta">{describeRecurrence(event.recurrence)}</span>
            {occurrenceDate && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  updateEvent(event.id, { exceptions: [...(event.exceptions ?? []), occurrenceDate] })
                  notify(`Skipped ${longStamp(occurrenceDate)}`)
                  navigate('/calendar')
                }}
              >
                Skip this one
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="cols cols-2">
        <div>
          {!expectsAttendance && (
            <div className="section">
              <div className="card-quiet card-pad">
                <div className="label">No attendance expected</div>
                <p className="meta" style={{ marginTop: 6 }}>
                  This is a date on the calendar, not a session. Nobody needs to RSVP.
                </p>
              </div>
            </div>
          )}
          {expectsAttendance && (
          <div className="section">
            <div style={{ display: 'flex', gap: 9 }}>
              {(['going', 'cant', 'maybe'] as RsvpStatus[]).map((status) => (
                <Button
                  key={status}
                  block={status !== 'maybe'}
                  size="lg"
                  variant={mine?.status === status ? 'primary' : 'default'}
                  style={status === 'maybe' ? { width: 56, flex: 'none', padding: 0 } : undefined}
                  disabled={!me}
                  onClick={() => me && setRsvp(rsvpKey, me.id, mine?.status === status ? 'none' : status)}
                >
                  {status === 'going' ? 'Going' : status === 'cant' ? "Can't" : '?'}
                </Button>
              ))}
            </div>
            {!me && (
              <p className="meta" style={{ marginTop: 8 }}>
                Sign in to RSVP. Guests can read the details.
              </p>
            )}
          </div>
          )}

          {expectsAttendance && (
          <div className="section">
            <div className="card card-pad">
              <div className="section-head" style={{ marginBottom: 11 }}>
                <span className="label">Attendance forecast</span>
                <span className="num" style={{ font: '600 15px var(--font-mono)', color: 'var(--ink)' }}>
                  {counts.going + counts.maybe} / {season.members.length}
                </span>
              </div>
              <Meter
                label={`${counts.going} going, ${counts.maybe} maybe, ${counts.cant} can't`}
                segments={[
                  { value: counts.going, of: season.members.length },
                  { value: counts.maybe, of: season.members.length, tone: 'dim' },
                  { value: counts.cant, of: season.members.length, tone: 'red' },
                ]}
              />
              <div style={{ display: 'flex', gap: 14, marginTop: 11, flexWrap: 'wrap' }}>
                <span className="meta">{counts.going} going</span>
                <span className="meta">{counts.maybe} maybe</span>
                <span className="meta">{counts.cant} can&rsquo;t</span>
                <span className="meta">{counts.silent} no reply</span>
              </div>

              <hr className="divider" style={{ margin: '14px 0 12px', background: 'var(--line)' }} />

              <div className="label" style={{ marginBottom: 9 }}>
                Who can&rsquo;t make it
              </div>
              {cantMake.length === 0 ? (
                <span className="meta">Everyone who has replied is coming.</span>
              ) : (
                cantMake.map((m) => (
                  <div key={m.id} className="row" style={{ padding: '7px 0' }}>
                    <Avatar name={m.name} size="sm" color={m.avatarColor} src={m.avatarUrl} />
                    <span style={{ flex: 1, font: '500 12.5px var(--font-sans)', color: '#d6dcde' }}>{m.name}</span>
                    <span className="meta">{describeSubteams(season, m) || ROLE_LABEL[m.role].toLowerCase()}</span>
                  </div>
                ))
              )}
              {staffing.uncovered && (
                <div className="meta" style={{ marginTop: 10, color: 'var(--pressure)' }}>
                  No adult is coming. Every coach and mentor on this team has said they can&rsquo;t make it.
                </div>
              )}
              {!staffing.uncovered && staffing.total === 1 && staffing.declined === 0 && (
                <div className="meta" style={{ marginTop: 10, color: 'var(--ink-rail)' }}>
                  One adult is covering this on their own. A second would remove the single point of failure.
                </div>
              )}
              {driveGap && (
                <div className="meta" style={{ marginTop: 10, color: 'var(--ink-rail)' }}>
                  Drive team gap: somebody on drive can&rsquo;t make it. Assign a backup before the event.
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        <div className="section">
          <div className="label" style={{ marginBottom: 9 }}>
            Attachments{offline ? ' · cached' : ''}
          </div>
          {!event.attachments?.length ? (
            <div className="card-dashed" style={{ padding: 18, textAlign: 'center' }}>
              <span className="meta">No attachments on this one.</span>
            </div>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {event.attachments.map((a) => (
                <div
                  key={a.id}
                  className="card"
                  style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', borderRadius: 16 }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'var(--srf-3)',
                      border: '1px solid var(--line-2)',
                      display: 'grid',
                      placeItems: 'center',
                      font: '500 8.5px var(--font-mono)',
                      color: '#9ba5a9',
                    }}
                  >
                    {a.ext}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '500 12.5px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{a.name}</div>
                    <div className="meta-mono">{bytes(a.size)} · offline</div>
                  </div>
                  {/*
                   * The arrow is a *state*, not an action: attachments cache on
                   * RSVP, not on open, so they are already here.
                   */}
                  <span className="mono" style={{ fontSize: 13, color: 'var(--signal)' }} title="Cached on this device">
                    ↓
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
