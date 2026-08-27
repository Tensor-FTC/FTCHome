import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Check, Select, Spinner } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { inferRegion } from '@/lib/geo'
import {
  CURRENT_SEASON,
  INTERNATIONAL_REGIONS,
  REGION_GROUPS,
  regionLabel,
  SEASON_NAMES,
  searchEvents,
  US_REGIONS,
  type Region,
  type ScoutEvent,
} from '@/lib/ftcScout'
import { dayNum, monShort, today as todayIso } from '@/lib/date'

/**
 * 01 · Getting started
 *
 * For somebody who is not on a team yet and does not know what the process
 * even is. This replaced a "browse as guest" hub, which showed a rookie coach
 * a pile of links and left them to work out the order themselves.
 *
 * Registration is genuinely confusing because it happens **twice**, through
 * two different organisations, and rookie teams routinely miss the second one:
 *
 *   • **Season registration** is national — you register the team with FIRST.
 *   • **Event registration** is regional — run by the Program Delivery Partner
 *     for your area, who set and collect their own event fees.
 *
 * Doing the first and assuming you are done is the single most common rookie
 * mistake, so the steps below are numbered and the split is called out.
 *
 * Nothing here prints a fee, a deadline or a kit price. Those change every
 * season and differ by region, and a confident wrong number is worse than a
 * link to the people who publish the right one — the same rule the rest of the
 * app follows.
 */

const DONE_KEY = 'ftc-home.getting-started.done'

interface Step {
  id: string
  title: string
  who: string
  body: string
  link?: { label: string; href: string }
  note?: string
}

const STEPS: Step[] = [
  {
    id: 'decide',
    title: 'Check whether there is already a team near you',
    who: 'Anyone',
    body:
      'Joining an existing team is faster, cheaper and usually more fun than starting one from nothing. FIRST publishes a search of registered teams and events by location — worth ten minutes before you commit to founding one.',
    link: { label: 'Find teams and events near you', href: 'https://www.firstinspires.org/team-event-search' },
  },
  {
    id: 'adults',
    title: 'Find at least two adult mentors',
    who: 'Required before you compete',
    body:
      'A team needs adults. FIRST requires screened adult mentors, and events expect a coach present. This is usually the real bottleneck for a student-founded team, so start asking early — a teacher, a parent, an engineer at a local firm.',
    note: 'Adults working with youth teams complete Youth Protection Program screening. Budget time for it; it is not instant.',
    link: { label: 'Youth Protection Program', href: 'https://www.firstinspires.org/resource-library/youth-protection-policy' },
  },
  {
    id: 'dashboard',
    title: 'Create a FIRST account and register the team',
    who: 'A lead mentor or coach',
    body:
      'Everything official happens in the FIRST Dashboard. An adult creates an account, starts a team registration for FIRST Tech Challenge, and pays the season registration fee. You are issued a team number at the end of this — that number is what the rest of this app runs on.',
    link: { label: 'FIRST team registration', href: 'https://www.firstinspires.org/robotics/ftc/team-registration' },
  },
  {
    id: 'grants',
    title: 'Apply for rookie grants before you buy anything',
    who: 'Mentor, with student help',
    body:
      'Rookie teams are often eligible for grants that cover a large share of registration and the kit — but they have deadlines, and several close before the season starts. Check what is open for your region now rather than after you have paid.',
    note: 'Grant programmes and deadlines vary by region and change yearly, which is why none are listed here.',
    link: { label: 'FIRST grants and funding', href: 'https://www.firstinspires.org/resource-library/team-management-resources' },
  },
  {
    id: 'kit',
    title: 'Get the kit and a control system',
    who: 'Mentor plus the build subteam',
    body:
      'A competing team needs a control system, a battery, a phone or driver hub, and structural parts. Registration includes some of this; the rest is bought from the FIRST storefront and the usual FTC vendors. Ask vendors about team discounts — most run one, and rookie teams routinely miss several hundred dollars by not asking.',
    link: { label: 'FIRST storefront', href: 'https://www.firstinspires.org/store' },
  },
  {
    id: 'partner',
    title: 'Find your Program Delivery Partner — this is the step teams miss',
    who: 'Mentor',
    body:
      'Registering with FIRST does not enter you into any competition. Events are run regionally by a Program Delivery Partner, who publish their own event calendar, set their own fees and take their own registrations. Find yours and get on their mailing list the week you register.',
    note: 'This is the second registration. Doing the first and assuming you are finished is the most common rookie mistake in the programme.',
    link: { label: 'Find your local partner', href: 'https://www.firstinspires.org/team-event-search' },
  },
  {
    id: 'events',
    title: 'Register for events in your region',
    who: 'Mentor',
    body:
      'Once your partner opens registration, sign up for a qualifier. Spaces fill. The events below are the real ones already scheduled in your region this season, pulled live so the dates are current.',
  },
  {
    id: 'app',
    title: 'Set the season up in FTC Home',
    who: 'Anyone on the team',
    body:
      'Enter your team number and the app pulls your name, city, rookie year, competitions, match results and rankings automatically. Then add the roster and invite the rest of the team by email.',
  },
]

export function GettingStartedScreen() {
  const navigate = useNavigate()
  const storedRegion = useStore((s) => s.season.settings.region)

  const [guess] = useState(inferRegion)
  const [region, setRegion] = useState<Region>((storedRegion as Region) || guess.region)
  const [events, setEvents] = useState<ScoutEvent[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  // Ticking a step is a private note-to-self, not team data — it belongs on the
  // device, not in the synced season.
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}') as Record<string, boolean>
    } catch {
      return {}
    }
  })

  function toggle(id: string) {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(DONE_KEY, JSON.stringify(next))
      } catch {
        // Private browsing — the checklist just will not persist.
      }
      return next
    })
  }

  useEffect(() => {
    let live = true
    setState('loading')
    void searchEvents(CURRENT_SEASON, region, { limit: 60 })
      .then((rows) => {
        if (!live) return
        setEvents(rows)
        setState('ready')
      })
      .catch((err: unknown) => {
        if (!live) return
        setError(err instanceof Error ? err.message : 'Could not reach FTCScout')
        setState('error')
      })
    return () => {
      live = false
    }
  }, [region])

  const iso = todayIso()
  const shown = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start))
    const ahead = sorted.filter((e) => e.end >= iso)
    return (ahead.length ? ahead : sorted.slice(-6).reverse()).slice(0, 6)
  }, [events, iso])

  const completed = STEPS.filter((s) => done[s.id]).length

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ width: '100%', maxWidth: 760 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            gap: 12,
          }}
        >
          <span
            className="label"
            style={{
              color: 'var(--signal)',
              padding: '5px 8px',
              border: '1px solid var(--signal-line)',
              borderRadius: 5,
              background: '#171e10',
            }}
          >
            NO ACCOUNT NEEDED
          </span>
          <Button size="sm" variant="quiet" onClick={() => navigate('/')}>
            Back
          </Button>
        </div>

        <h1 className="h1-lg" style={{ fontSize: 25, marginBottom: 6 }}>
          How to start an FTC team
        </h1>
        <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 6 }}>
          Eight steps, in the order they actually happen. Registration happens{' '}
          <strong style={{ color: 'var(--ink-2)' }}>twice</strong> — once nationally with FIRST, and
          again regionally for events. Missing the second one is the most common rookie mistake.
        </p>
        <p className="meta pretty" style={{ marginBottom: 18 }}>
          {completed} of {STEPS.length} done · ticks are saved on this device only
        </p>

        <Select
          label="Where are you?"
          value={region}
          onChange={(e) => setRegion(e.target.value as Region)}
          style={{ marginBottom: 18 }}
        >
          <optgroup label="Groups">
            {REGION_GROUPS.map((r) => (
              <option key={r} value={r}>
                {regionLabel(r)}
              </option>
            ))}
          </optgroup>
          <optgroup label="United States">
            {US_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </optgroup>
          <optgroup label="International">
            {INTERNATIONAL_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </optgroup>
        </Select>

        {/* ── the steps ─────────────────────────────────── */}
        {STEPS.map((step, i) => (
          <div
            key={step.id}
            className="card"
            style={{ marginBottom: 10, padding: 15, opacity: done[step.id] ? 0.6 : 1 }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ paddingTop: 2 }}>
                <Check
                  checked={Boolean(done[step.id])}
                  onChange={() => toggle(step.id)}
                  label={`Mark "${step.title}" done`}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="label" style={{ marginBottom: 4, color: 'var(--ink-4)' }}>
                  STEP {i + 1} · {step.who.toUpperCase()}
                </div>
                <div
                  style={{
                    font: '600 15px/1.35 var(--font-sans)',
                    color: 'var(--ink-body)',
                    marginBottom: 6,
                    textDecoration: done[step.id] ? 'line-through' : 'none',
                  }}
                >
                  {step.title}
                </div>
                <p className="body pretty" style={{ color: 'var(--ink-3)', margin: '0 0 8px', fontSize: 12.5 }}>
                  {step.body}
                </p>

                {step.note && (
                  <p
                    className="meta pretty"
                    style={{
                      margin: '0 0 8px',
                      paddingLeft: 10,
                      borderLeft: '2px solid var(--signal-line)',
                      color: 'var(--ink-3)',
                    }}
                  >
                    {step.note}
                  </p>
                )}

                {step.link && (
                  <a href={step.link.href} target="_blank" rel="noreferrer noopener">
                    <Button size="sm">{step.link.label} ↗</Button>
                  </a>
                )}

                {step.id === 'app' && (
                  <Button size="sm" variant="primary" onClick={() => navigate('/identity')}>
                    Start a new team with FTC Home
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* ── real events for the chosen region ──────────── */}
        <div className="card" style={{ overflow: 'hidden', margin: '16px 0 12px' }}>
          <div
            style={{
              padding: '13px 15px',
              borderBottom: '1px solid #22282b',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <span className="label" style={{ flex: 1 }}>
              {SEASON_NAMES[CURRENT_SEASON]} events · {regionLabel(region)}
            </span>
            {state === 'ready' && (
              <span className="meta">{shown.length ? 'live from FTCScout' : 'none listed'}</span>
            )}
          </div>

          {state === 'loading' && (
            <div style={{ padding: 20, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
              <Spinner />
              <span className="meta">Loading events…</span>
            </div>
          )}

          {state === 'error' && (
            <div style={{ padding: 18 }}>
              <p className="meta pretty">{error} — check your connection, or try another region.</p>
            </div>
          )}

          {state === 'ready' && shown.length === 0 && (
            <div style={{ padding: 18 }}>
              <p className="meta pretty">
                Nothing scheduled yet for {regionLabel(region)}. Your Program Delivery Partner
                publishes these — step 6.
              </p>
            </div>
          )}

          {state === 'ready' &&
            shown.map((event) => (
              <div
                key={event.code}
                style={{
                  padding: '12px 15px',
                  borderBottom: '1px solid var(--line-soft)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <div style={{ width: 46, flex: 'none', textAlign: 'center' }}>
                  <div style={{ font: '600 15px/1 var(--font-mono)', color: 'var(--ink-body)' }}>
                    {dayNum(event.start)}
                  </div>
                  <div style={{ font: '500 9px/1.5 var(--font-mono)', color: 'var(--ink-4)', letterSpacing: '.1em' }}>
                    {monShort(event.start).toUpperCase()}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>
                    {event.name}
                  </div>
                  <div className="meta">
                    {[event.venue, event.city, event.state].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            ))}
        </div>

        <p className="meta pretty">
          Fees, kit contents and grant deadlines change every season and differ by region, so this
          guide links to the organisations that publish the current ones rather than printing a
          number that may already be wrong.
        </p>
      </div>
    </div>
  )
}
