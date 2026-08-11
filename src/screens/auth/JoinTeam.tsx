import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Brand } from '@/components/Brand'
import { Button, Field, Spinner } from '@/components/ui'
import { getTeam, type ScoutTeam } from '@/lib/ftcScout'
import { isAuthConfigured } from '@/lib/auth'
import { rememberInvite } from '@/lib/invites'

/**
 * Join a team you are already on.
 *
 * This exists because the launch screen only offered "Set up my team", which
 * made joining an existing team look unsupported — so the student whose team
 * already has an account had nowhere obvious to go.
 *
 * Two ways in, and the order is deliberate:
 *
 *   1. **An invite code**, if somebody on the team sent you one. This puts you
 *      straight on the roster, because the invite is the authorisation.
 *   2. **Ask to join**, if nobody did. This only ever creates a request that
 *      somebody on the team has to accept — finding a team number, which is
 *      public, never gets you access to anything.
 *
 * The team lookup here is cosmetic: it confirms you typed the right number and
 * shows the name back. It proves nothing about who you are, which is why
 * neither path grants anything on its own.
 */
export function JoinTeamScreen() {
  const navigate = useNavigate()

  const [number, setNumber] = useState('')
  const [team, setTeam] = useState<ScoutTeam | null>(null)
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')

  const cloudReady = isAuthConfigured()

  async function lookup(e: FormEvent) {
    e.preventDefault()
    const trimmed = number.trim()
    if (!trimmed) return
    setError('')
    setTeam(null)
    setLooking(true)
    try {
      const found = await getTeam(trimmed)
      setTeam(found.team)
    } catch {
      setError(`No team ${trimmed} on FTCScout. Check the number.`)
    } finally {
      setLooking(false)
    }
  }

  return (
    <AuthLayout back="/">
      <Brand size={52} />
      <h1 className="h1-lg" style={{ margin: '22px 0 8px', fontSize: 27 }}>
        Join a team
      </h1>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 22 }}>
        Find your team, then either use the invite somebody sent you or ask them to let you in.
      </p>

      <form onSubmit={lookup} className="stack" style={{ gap: 11 }}>
        <Field
          label="Team number"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="19645"
          inputMode="numeric"
          error={error}
        />
        <Button type="submit" variant="primary" block disabled={looking || !number.trim()}>
          {looking ? 'Looking…' : 'Find my team'}
        </Button>
      </form>

      {looking && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 18 }}>
          <Spinner />
          <span className="meta">Checking FTCScout…</span>
        </div>
      )}

      {team && (
        <>
          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="label" style={{ marginBottom: 6 }}>
              Found on FTCScout
            </div>
            <div style={{ font: '600 16px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{team.name}</div>
            <div className="meta" style={{ marginTop: 4 }}>
              {team.number}
              {team.city ? ` · ${team.city}` : ''}
              {team.state ? `, ${team.state}` : ''}
            </div>
          </div>

          {!cloudReady ? (
            <p className="meta pretty" style={{ marginTop: 16 }}>
              This team has not connected a shared database yet, so there is nobody to ask. Whoever
              set the team up can turn it on under Settings &rarr; Sync, and then invites work.
            </p>
          ) : (
            <>
              <div className="stack" style={{ gap: 11, marginTop: 18 }}>
                <Field
                  label="Invite code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="8 characters"
                  autoCapitalize="characters"
                  hint="Somebody on the team can generate one for you."
                />
                <Button
                  variant="primary"
                  block
                  disabled={!code.trim()}
                  onClick={() => {
                    // Parked so it survives the trip out to Google and back.
                    rememberInvite(code)
                    navigate('/signin/cloud?mode=signup')
                  }}
                >
                  Use this invite
                </Button>
              </div>

              <div className="rule-label" style={{ margin: '18px 0' }}>
                or
              </div>

              <Button block onClick={() => navigate('/signin/cloud?mode=signup')}>
                Ask to join {team.number}
              </Button>
              <p className="meta pretty" style={{ marginTop: 10 }}>
                You will sign in first, then somebody on the team accepts you. Knowing a team number
                is not enough on its own — it is public information.
              </p>
            </>
          )}
        </>
      )}
    </AuthLayout>
  )
}
