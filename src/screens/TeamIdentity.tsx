import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Spinner } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { hasApiKey, lookupTeam } from '@/lib/ftcEvents'

interface Match {
  number: string
  name: string
  region: string
  rookieYear: number
}

/**
 * 03 · Signup — team identity
 *
 * Type a number, get a confirmation card back from the registry. Confirm or
 * re-enter.
 *
 * The confirmation is a card, not a toast: it holds name, region and rookie year
 * so you can tell 11138 from 11183. Provisional teams are a first-class path,
 * not an error — new numbers take about 48h to appear in the index.
 */
export function TeamIdentityScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const replaceSeason = useStore((s) => s.replaceSeason)
  const notify = useStore((s) => s.notify)

  const [number, setNumber] = useState('')
  const [match, setMatch] = useState<Match | null>(null)
  const [state, setState] = useState<'idle' | 'looking' | 'found' | 'missing'>('idle')

  // Debounced lookup: nobody presses a Search button for a five-digit number.
  useEffect(() => {
    const trimmed = number.trim()
    if (!/^\d{3,6}$/.test(trimmed)) {
      setState('idle')
      setMatch(null)
      return
    }

    setState('looking')
    const controller = new AbortController()
    const id = setTimeout(async () => {
      if (hasApiKey()) {
        const found = await lookupTeam(season.settings.ftcSeason, trimmed)
        if (controller.signal.aborted) return
        if (found) {
          setMatch(found)
          setState('found')
          return
        }
        setState('missing')
        return
      }
      // Without a registry key the only team this device can confirm is its own.
      if (trimmed === season.team.number) {
        setMatch({
          number: season.team.number,
          name: season.team.name,
          region: season.team.region,
          rookieYear: season.team.rookieYear,
        })
        setState('found')
      } else {
        setState('missing')
      }
    }, 450)

    return () => {
      controller.abort()
      clearTimeout(id)
    }
  }, [number, season.settings.ftcSeason, season.team])

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div style={{ display: 'flex', gap: 5, marginBottom: 22 }}>
          <span style={{ height: 3, flex: 1, borderRadius: 2, background: 'var(--signal)' }} />
          <span style={{ height: 3, flex: 1, borderRadius: 2, background: 'var(--signal)' }} />
          <span style={{ height: 3, flex: 1, borderRadius: 2, background: state === 'found' ? 'var(--signal)' : '#242b2e' }} />
        </div>

        <h1 className="h1-lg" style={{ fontSize: 25, marginBottom: 6 }}>
          Team number
        </h1>
        <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 18 }}>
          {hasApiKey()
            ? "We'll pull your registration from the FIRST index."
            : 'Add a FIRST API key in Settings to look numbers up against the registry.'}
        </p>

        <Field
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder={season.team.number}
          inputMode="numeric"
          autoFocus
          big
          mono
          aria-label="Team number"
          style={{ height: 60, fontSize: 24, letterSpacing: '0.06em' }}
        />

        {state === 'looking' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
            <Spinner />
            <span className="meta">Checking the index…</span>
          </div>
        )}

        {state === 'found' && match && (
          <div className="card" style={{ overflow: 'hidden', margin: '14px 0', animation: 'riseIn .3s ease both' }}>
            <div
              style={{ padding: '10px 15px', borderBottom: '1px solid #22282b', display: 'flex', alignItems: 'center', gap: 7 }}
            >
              <span className="dot dot-live" style={{ width: 6, height: 6 }} />
              <span className="label" style={{ color: 'var(--signal)' }}>
                Match found
              </span>
            </div>
            <div style={{ padding: '16px 15px' }}>
              <div style={{ font: '600 20px/1.2 var(--font-sans)', color: 'var(--ink)' }}>{match.name}</div>
              <div className="num" style={{ font: '500 12.5px/1.6 var(--font-mono)', color: 'var(--ink-3)' }}>
                {match.number}
                {match.region ? ` · ${match.region}` : ''}
                {match.rookieYear ? ` · rookie ${match.rookieYear}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 14 }}>
                <Button
                  variant="primary"
                  block
                  onClick={async () => {
                    if (match.number !== season.team.number) {
                      await replaceSeason({
                        ...season,
                        team: {
                          ...season.team,
                          number: match.number,
                          name: match.name,
                          region: match.region,
                          rookieYear: match.rookieYear,
                          updatedAt: new Date().toISOString(),
                        },
                      })
                    }
                    notify(`Linked to ${match.number} ${match.name}`)
                    navigate('/signin')
                  }}
                >
                  That&rsquo;s us
                </Button>
                <Button
                  onClick={() => {
                    setNumber('')
                    setState('idle')
                  }}
                >
                  Re-enter
                </Button>
              </div>
            </div>
          </div>
        )}

        {state === 'missing' && (
          <div className="card-quiet card-pad" style={{ margin: '14px 0' }}>
            <div className="label" style={{ marginBottom: 8 }}>
              Not in the index yet?
            </div>
            <p className="body pretty" style={{ color: 'var(--ink-3)', margin: '0 0 12px', fontSize: 12.5 }}>
              New teams appear about 48 hours after registration. Start a provisional team now and link it
              when your number lands.
            </p>
            <Button block onClick={() => navigate('/register')}>
              Create provisional team
            </Button>
          </div>
        )}

        <Button variant="quiet" block style={{ marginTop: 8 }} onClick={() => navigate('/signin')}>
          Skip — sign in to an existing team
        </Button>
      </div>
    </div>
  )
}
