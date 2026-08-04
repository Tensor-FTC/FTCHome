import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Brand } from '@/components/Brand'
import { Button, Field } from '@/components/ui'
import { useStore } from '@/store/useStore'

/**
 * A1 · Team access
 *
 * Deliberately two steps: the shared code proves you belong to the team, your
 * own password proves who you are. A leaked team code cannot read anybody's
 * records — it only gets you to the roster picker.
 */
export function TeamAccessScreen() {
  const navigate = useNavigate()
  const team = useStore((s) => s.season.team)
  const verifyTeamCode = useStore((s) => s.verifyTeamCode)

  const [number, setNumber] = useState(team.number)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const firstRun = team.code === null

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
    navigate('/signin/who')
  }

  return (
    <AuthLayout>
      <Brand size={52} />
      <h1 className="h1-lg" style={{ margin: '22px 0 8px', fontSize: 27 }}>
        Team access
      </h1>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 26 }}>
        One code for the whole team. You&rsquo;ll pick who you are next.
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
          label="Team password"
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={firstRun ? 'set one now — everyone shares it' : 'shared with your team'}
          autoComplete="current-password"
          big
          error={error}
          hint={
            firstRun
              ? 'No code is set on this device yet. The first one entered becomes the team code.'
              : undefined
          }
        />
        <Button type="submit" variant="primary" size="lg" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Checking…' : 'Continue'}
        </Button>
      </form>

      <hr className="divider" style={{ margin: '26px 0 18px' }} />

      <div className="stack" style={{ gap: 12 }}>
        <Button onClick={() => navigate('/signin/mentor')}>I&rsquo;m a mentor or volunteer</Button>
        <Button variant="quiet" style={{ color: 'var(--signal)' }} onClick={() => navigate('/register')}>
          Register a new team
        </Button>
      </div>
    </AuthLayout>
  )
}
