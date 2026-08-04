import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Spinner } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { getTeam, searchTeams, SEASON_NAMES, type ScoutTeam } from '@/lib/ftcScout'
import type { Season } from '@/lib/ftcScout'

/**
 * 03 · Team identity — the app's front door.
 *
 * Type a number, get the real registration back from FTCScout. The confirmation
 * is a card, not a toast: it holds name, school, city, state and rookie year so
 * you can tell 11138 from 11183 before committing a season to it.
 *
 * Nothing about the team is authored locally. If FTCScout does not have the
 * number, the app says so rather than inventing a plausible team.
 */
export function TeamIdentityScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const adoptTeam = useStore((s) => s.adoptTeam)
  const busy = useStore((s) => s.scoutBusy)
  const notify = useStore((s) => s.notify)

  const [query, setQuery] = useState('')
  const [match, setMatch] = useState<ScoutTeam | null>(null)
  const [suggestions, setSuggestions] = useState<ScoutTeam[]>([])
  const [state, setState] = useState<'idle' | 'looking' | 'found' | 'missing' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setState('idle')
      setMatch(null)
      setSuggestions([])
      return
    }

    setState('looking')
    let live = true
    const id = setTimeout(async () => {
      try {
        if (/^\d{1,6}$/.test(trimmed)) {
          const { team } = await getTeam(trimmed)
          if (!live) return
          setMatch(team)
          setSuggestions([])
          setState('found')
        } else {
          // Names go through search; numbers go straight to the record.
          const results = await searchTeams(trimmed, season.settings.region as never, 8)
          if (!live) return
          setSuggestions(results)
          setMatch(null)
          setState(results.length ? 'idle' : 'missing')
        }
      } catch (err) {
        if (!live) return
        const message = err instanceof Error ? err.message : 'Lookup failed'
        if (message.includes('Not found')) {
          setState('missing')
        } else {
          setError(message)
          setState('error')
        }
      }
    }, 400)

    return () => {
      live = false
      clearTimeout(id)
    }
  }, [query, season.settings.region])

  async function confirm(team: ScoutTeam) {
    const result = await adoptTeam(String(team.number))
    if (!result.ok) {
      setError(result.message)
      setState('error')
      return
    }
    notify(`Linked to ${result.message}`)
    navigate('/register')
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="label-lg" style={{ marginBottom: 10 }}>
          Set up · step 1 of 2
        </div>
        <h1 className="h1-lg" style={{ fontSize: 25, marginBottom: 6 }}>
          Your team number
        </h1>
        <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 18 }}>
          Everything factual — your name, city, rookie year, competitions and results — comes from
          FTCScout. No account or API key needed.
        </p>

        <Field
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="11138, or search by name"
          autoFocus
          big
          mono
          aria-label="Team number or name"
          style={{ height: 60, fontSize: 22, letterSpacing: '0.04em' }}
        />

        {state === 'looking' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
            <Spinner />
            <span className="meta">Searching FTCScout…</span>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="card" style={{ overflow: 'hidden', margin: '14px 0' }}>
            {suggestions.map((team) => (
              <button
                key={team.number}
                type="button"
                onClick={() => {
                  setQuery(String(team.number))
                  setMatch(team)
                  setSuggestions([])
                  setState('found')
                }}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  width: '100%',
                  padding: '11px 14px',
                  borderBottom: '1px solid var(--line-soft)',
                  textAlign: 'left',
                }}
              >
                <span className="num" style={{ font: '600 14px var(--font-mono)', color: 'var(--signal)', width: 60 }}>
                  {team.number}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: '500 13px var(--font-sans)', color: 'var(--ink-body)' }}>
                    {team.name}
                  </span>
                  <span className="meta">{[team.city, team.state].filter(Boolean).join(', ')}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {state === 'found' && match && (
          <div className="card" style={{ overflow: 'hidden', margin: '14px 0', animation: 'riseIn .3s ease both' }}>
            <div
              style={{ padding: '10px 15px', borderBottom: '1px solid #22282b', display: 'flex', alignItems: 'center', gap: 7 }}
            >
              <span className="dot dot-live" style={{ width: 6, height: 6 }} />
              <span className="label" style={{ color: 'var(--signal)' }}>
                Found on FTCScout
              </span>
            </div>
            <div style={{ padding: '16px 15px' }}>
              <div style={{ font: '600 20px/1.2 var(--font-sans)', color: 'var(--ink)' }}>{match.name}</div>
              <div className="num" style={{ font: '500 12.5px/1.7 var(--font-mono)', color: 'var(--ink-3)' }}>
                {match.number} · {[match.city, match.state, match.country].filter(Boolean).join(', ')}
              </div>
              {match.rookieYear > 0 && (
                <div className="meta" style={{ marginTop: 2 }}>
                  Rookie year {match.rookieYear}
                  {match.schoolName ? ` · ${match.schoolName}` : ''}
                </div>
              )}
              {match.sponsors?.length > 0 && (
                <div className="meta" style={{ marginTop: 6 }}>
                  Registered sponsors: {match.sponsors.join(', ')}
                </div>
              )}

              <div style={{ display: 'flex', gap: 7, marginTop: 14 }}>
                <Button variant="primary" block disabled={busy} onClick={() => void confirm(match)}>
                  {busy ? 'Pulling season…' : "That's us"}
                </Button>
                <Button
                  onClick={() => {
                    setQuery('')
                    setState('idle')
                    setMatch(null)
                  }}
                >
                  Re-enter
                </Button>
              </div>
              <p className="field-note">
                Pulls your {SEASON_NAMES[season.settings.season as Season]} competitions, dates and venues
                into the calendar.
              </p>
            </div>
          </div>
        )}

        {state === 'missing' && (
          <div className="card-quiet card-pad" style={{ margin: '14px 0' }}>
            <div className="label" style={{ marginBottom: 8 }}>
              Not in the index
            </div>
            <p className="body pretty" style={{ color: 'var(--ink-3)', margin: 0, fontSize: 12.5 }}>
              FTCScout has no team matching &ldquo;{query}&rdquo;. Newly registered teams take a few days to
              appear. Check the number, or try searching by name.
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="card-quiet card-pad" style={{ margin: '14px 0' }}>
            <div className="label" style={{ marginBottom: 8, color: 'var(--pressure)' }}>
              Could not reach FTCScout
            </div>
            <p className="body pretty" style={{ color: 'var(--ink-3)', margin: 0, fontSize: 12.5 }}>
              {error} Nothing is lost — try again when you have signal.
            </p>
          </div>
        )}

        {season.team.number && (
          <Button variant="quiet" block style={{ marginTop: 8 }} onClick={() => navigate('/signin')}>
            Keep {season.team.number} {season.team.name}
          </Button>
        )}
      </div>
    </div>
  )
}
