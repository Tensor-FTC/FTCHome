import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Brand } from '@/components/Brand'
import { Button, Field } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { isAuthConfigured } from '@/lib/auth'
import { isDeviceEnrolled, markDeviceEnrolled } from '@/lib/supabase'

/**
 * A1 · Enrol this device
 *
 * The shared code is a *device enrolment* secret, not a password. It is asked
 * once, when a device first joins a team that has no cloud accounts, and never
 * again — after that, everybody signs in with their own password.
 *
 * It disappears entirely once a team has real accounts. A secret every member
 * knows, that lives in a group chat and is never rotated, adds nothing on top
 * of individual passwords and a coach approving people; the only thing it ever
 * genuinely did was stop a brand-new device seeing the roster before anyone
 * vouched for it, which is a one-time question rather than a login.
 */
export function TeamAccessScreen() {
  const navigate = useNavigate()
  const team = useStore((s) => s.season.team)
  const verifyTeamCode = useStore((s) => s.verifyTeamCode)
  const cloudAccounts = isAuthConfigured()

  const [number, setNumber] = useState(team.number)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const firstRun = team.code === null

  // With real accounts there is nothing for a shared secret to do.
  if (cloudAccounts) return <Navigate to="/signin/cloud" replace />
  // Already enrolled: straight to picking who you are.
  if (isDeviceEnrolled() && !firstRun) return <Navigate to="/signin/who" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!/^\d{1,6}$/.test(number.trim())) {
      setError('Not a valid team number')
      return
    }
    if (number.trim() !== team.number) {
      setError(`This device is set up for team ${team.number}. Restore a backup to switch teams.`)
      return
    }
    if (code.length < 4) {
      setError('Team codes are at least 4 characters')
      return
    }

    setBusy(true)
    const ok = await verifyTeamCode(code)
    setBusy(false)
    if (!ok) {
      setError('That code does not match. Ask a coach for the current one.')
      return
    }
    markDeviceEnrolled()
    navigate('/signin/who')
  }

  return (
    <AuthLayout>
      <Brand size={52} />
      <h1 className="h1-lg" style={{ margin: '22px 0 8px', fontSize: 27 }}>
        Set up this device
      </h1>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 26 }}>
        Asked once per device, then never again. After this everyone signs in with their own
        password.
      </p>

      <form onSubmit={onSubmit} className="stack" style={{ gap: 11 }}>
        <Field
          label="Team number"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          big
          mono
        />
        <Field
          label="Device setup code"
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={firstRun ? 'set one now' : 'ask a coach'}
          autoComplete="one-time-code"
          big
          error={error}
          hint={
            firstRun
              ? 'No code is set yet. The first one entered becomes this team’s setup code.'
              : 'Not your password — it only gets this device onto the team.'
          }
        />
        <Button type="submit" variant="primary" size="lg" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Checking…' : 'Continue'}
        </Button>
      </form>

      <hr className="divider" style={{ margin: '26px 0 18px' }} />

      <p className="meta pretty" style={{ marginBottom: 16 }}>
        Set up a Supabase project and this step disappears — everyone gets their own account and a
        coach accepts them from the roster. See Settings &rarr; Sync.
      </p>

      <div className="stack" style={{ gap: 12 }}>
        <Button onClick={() => navigate('/signin/mentor')}>I&rsquo;m a mentor or volunteer</Button>
        <Button variant="quiet" style={{ color: 'var(--signal)' }} onClick={() => navigate('/register')}>
          Register a new team
        </Button>
      </div>
    </AuthLayout>
  )
}
