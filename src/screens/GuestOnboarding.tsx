import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Select, Spinner } from '@/components/ui'
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
import { fromIso, today as todayIso } from '@/lib/date'

/**
 * 01 · Guest onboarding hub
 *
 * Real answers before any account — but only answers we can actually source.
 * Every event, venue and date below comes from FTCScout for the region you pick.
 *
 * There is deliberately no invented cost breakdown here. Registration fees and
 * kit prices change yearly and vary by region, and a confident wrong number is
 * worse than a link to the people who publish the right one.
 */
export function GuestOnboardingScreen() {
  const navigate = useNavigate()
  const storedRegion = useStore((s) => s.season.settings.region)

  // A stored choice always wins. Otherwise open on wherever the browser's own
  // timezone says they are, so a rookie coach lands on their own region's
  // events instead of scrolling a list of fifty-odd states.
  const [guess] = useState(inferRegion)
  const [region, setRegion] = useState<Region>((storedRegion as Region) || guess.region)
  const [events, setEvents] = useState<ScoutEvent[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

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

  /** Upcoming first; if the season is over, show the most recent instead of nothing. */
  const shown = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start))
    const ahead = sorted.filter((e) => e.end >= iso)
    return (ahead.length ? ahead : sorted.slice(-8).reverse()).slice(0, 8)
  }, [events, iso])

  const upcoming = shown.filter((e) => e.end >= iso).length

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ width: '100%', maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <span
            className="label"
            style={{
              color: 'var(--signal)',
              padding: '5px 8px',
              border: '1px solid var(--signal-line)',
              borderRadius: 5,
              background: 'var(--signal-bg)',
            }}
          >
            GUEST · NO ACCOUNT
          </span>
          <Button size="sm" variant="quiet" onClick={() => navigate('/')}>
            Back
          </Button>
        </div>

        <h1 className="h1-lg" style={{ fontSize: 25, marginBottom: 6 }}>
          Starting an FTC team
        </h1>
        <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 20 }}>
          Everything below is public data from FTCScout. Nothing is saved and no account is made.
        </p>

        <Select
          label="Where are you?"
          value={region}
          onChange={(e) => setRegion(e.target.value as Region)}
          style={{ marginBottom: 16 }}
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

        {/* ── official sources ─────────────────────────── */}
        <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ padding: '13px 15px', borderBottom: '1px solid #22282b' }}>
            <span className="label">Where the real answers are</span>
          </div>
          <div style={{ padding: 15 }}>
            <p className="body pretty" style={{ color: 'var(--ink-3)', margin: '0 0 12px', fontSize: 12.5 }}>
              Registration fees, kit contents and grant deadlines change every season and differ by
              region. Rather than print a number that might be wrong by the time you read it, here are
              the people who publish the current ones.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href="https://www.firstinspires.org/robotics/ftc/team-registration" target="_blank" rel="noreferrer noopener">
                <Button size="sm" variant="primary">
                  FIRST · registration &amp; fees
                </Button>
              </a>
              <a href="https://www.firstinspires.org/team-event-search" target="_blank" rel="noreferrer noopener">
                <Button size="sm">Find your local partner</Button>
              </a>
              <a href="https://ftcscout.org" target="_blank" rel="noreferrer noopener">
                <Button size="sm">FTCScout</Button>
              </a>
            </div>
          </div>
        </div>

        {/* ── events ───────────────────────────────────── */}
        <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
          <div
            style={{ padding: '13px 15px', borderBottom: '1px solid #22282b', display: 'flex', gap: 10, alignItems: 'center' }}
          >
            <span className="label" style={{ flex: 1 }}>
              {SEASON_NAMES[CURRENT_SEASON]} events · {regionLabel(region)}
            </span>
            {state === 'ready' && (
              <span className="meta">
                {upcoming > 0 ? `${upcoming} upcoming` : 'season complete'}
              </span>
            )}
          </div>

          {state === 'loading' && (
            <div style={{ padding: 20, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
              <Spinner />
              <span className="meta">Loading events from FTCScout…</span>
            </div>
          )}

          {state === 'error' && (
            <div style={{ padding: 18 }}>
              <p className="meta pretty">{error} — check your connection and try another region.</p>
            </div>
          )}

          {state === 'ready' && shown.length === 0 && (
            <div style={{ padding: 18 }}>
              <p className="meta">No {SEASON_NAMES[CURRENT_SEASON]} events listed for {regionLabel(region)}.</p>
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
                  gap: 13,
                  alignItems: 'center',
                }}
              >
                <div style={{ width: 42, flex: 'none', textAlign: 'center' }}>
                  <div className="num" style={{ font: '600 15px/1 var(--font-mono)', color: 'var(--ink)' }}>
                    {fromIso(event.start).getDate()}
                  </div>
                  <div
                    style={{ font: '500 9px/1.6 var(--font-mono)', color: 'var(--ink-4)', letterSpacing: '0.1em' }}
                  >
                    {fromIso(event.start).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{event.name}</div>
                  <div className="meta">
                    {[event.venue, event.city, event.state].filter(Boolean).join(' · ') || 'Location TBC'}
                  </div>
                </div>
                <span
                  className="label"
                  style={{ padding: '4px 7px', border: '1px solid var(--line-2)', borderRadius: 5, color: 'var(--ink-3)' }}
                >
                  {event.type}
                </span>
              </div>
            ))}
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 20, flexWrap: 'wrap' }}>
          <Button block variant="primary" onClick={() => navigate('/identity')}>
            I have a team number
          </Button>
        </div>
      </div>
    </div>
  )
}
