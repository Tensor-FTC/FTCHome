import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Button, Field } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { passwordStrength } from '@/lib/crypto'
import { initialsOf } from '@/lib/id'
import { ROLE_LABEL } from '@/domain/types'

/**
 * A3 · Personal sign-in
 *
 * Username is derived and read-only, so nobody has to remember a handle they
 * invented in September. This is the step that decides what the app hides from
 * you for the rest of the session.
 *
 * Recovery is social — a coach resets it. No email round-trip for a student who
 * has no school email on their phone.
 */
export function PersonalSignInScreen() {
  const { memberId = '' } = useParams()
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const signIn = useStore((s) => s.signIn)
  const notify = useStore((s) => s.notify)

  const member = season.members.find((m) => m.id === memberId)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!member) return <Navigate to="/signin/who" replace />

  const firstTime = member.password === null
  const strength = passwordStrength(password)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!member) return
    setError('')

    if (firstTime) {
      if (strength.score === 0) {
        setError(strength.label)
        return
      }
      if (password !== confirm) {
        setError('The two passwords do not match')
        return
      }
    }

    setBusy(true)
    const ok = await signIn(member.id, password)
    setBusy(false)
    if (!ok) {
      setError('Wrong password. A coach can reset it for you.')
      return
    }
    notify(firstTime ? `Password set. Welcome, ${member.name}.` : `Signed in as ${member.name}`)
    navigate('/today', { replace: true })
  }

  return (
    <AuthLayout back="/signin/who">
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 24 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: 'var(--signal-deep)',
            border: '1px solid var(--signal-line)',
            display: 'grid',
            placeItems: 'center',
            font: '600 17px var(--font-mono)',
            color: 'var(--signal)',
          }}
        >
          {initialsOf(member.name)}
        </div>
        <div>
          <div style={{ font: '600 19px/1.2 var(--font-sans)', color: 'var(--ink)' }}>{member.name}</div>
          <div
            style={{
              font: '500 10.5px/1.6 var(--font-mono)',
              color: 'var(--ink-3)',
              letterSpacing: '0.1em',
            }}
          >
            {ROLE_LABEL[member.role].toUpperCase()} · TEAM {season.team.number}
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="stack" style={{ gap: 11 }}>
        <div>
          <div className="label" style={{ marginBottom: 7 }}>
            Username
          </div>
          <div
            className="mono"
            style={{
              height: 54,
              borderRadius: 16,
              background: 'var(--srf-card)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              font: '500 15px var(--font-mono)',
              color: 'var(--ink-3)',
            }}
          >
            {member.username}
          </div>
        </div>

        <Field
          label={firstTime ? 'Choose your password' : 'Your password'}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={firstTime ? 'choose one now' : ''}
          autoComplete={firstTime ? 'new-password' : 'current-password'}
          big
          error={error}
          hint={firstTime && password ? strength.label : undefined}
        />

        {firstTime && (
          <Field
            label="Confirm it"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            big
          />
        )}

        <Button type="submit" variant="primary" size="lg" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Checking…' : firstTime ? 'Set password and sign in' : 'Sign in'}
        </Button>
        {!firstTime && (
          <Button variant="quiet" onClick={() => navigate('/signin/who')}>
            Forgot it — ask a coach to reset
          </Button>
        )}
      </form>

      {firstTime && (
        <div className="card-quiet card-pad" style={{ marginTop: 18 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            First sign-in
          </div>
          <div className="meta">
            You set your own password now. It is stored on this device, hashed with PBKDF2 — a coach can
            reset it but nobody, including a coach, can read it back.
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
