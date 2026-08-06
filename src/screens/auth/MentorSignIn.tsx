import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Button, Field, Select } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { isStaff } from '@/domain/permissions'
import { passwordStrength } from '@/lib/crypto'

/**
 * A4 · Mentor sign-in
 *
 * A separate door with a separate credential, visually distinct from the student
 * flow: grey chip instead of lime, an account picker instead of a team number.
 * The colour of the screen tells a mentor immediately they are in the right place.
 *
 * A mentor may cover several teams, and the account
 * carries the permissions.
 */
export function MentorSignInScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const signIn = useStore((s) => s.signIn)
  const notify = useStore((s) => s.notify)

  const staff = season.members.filter((m) => isStaff(m.role))
  const [memberId, setMemberId] = useState(staff[0]?.id ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const member = staff.find((m) => m.id === memberId)
  const firstTime = member?.password === null
  const strength = passwordStrength(password)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!member) {
      setError('No mentor account on this team yet. Register the team first.')
      return
    }
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
      setError('Wrong password for that account.')
      return
    }
    notify(`Signed in as ${member.name} — coach tools on`)
    navigate('/today', { replace: true })
  }

  return (
    <AuthLayout
      aside={
        <div className="card-quiet card-pad">
          <div className="label" style={{ marginBottom: 8 }}>
            Why it&rsquo;s separate
          </div>
          <p className="meta pretty">
            Mentors approve spending and can read medical and contact records. Those permissions never
            travel on a code that a whole team knows.
          </p>
          <p className="meta pretty" style={{ marginTop: 10 }}>
            On a shared cloud project the mentor account is also the only one that can change the season
            goal or remove a member, so the audit trail stays meaningful.
          </p>
        </div>
      }
    >
      <div className="auth-badge">
        <span className="dot" />
        <span className="auth-badge-text">MENTOR &amp; VOLUNTEER ACCESS</span>
      </div>

      <h1 className="h1-lg" style={{ marginBottom: 8 }}>
        Mentor sign-in
      </h1>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 26 }}>
        Mentor accounts can span several teams.
      </p>

      <form onSubmit={onSubmit} className="stack" style={{ gap: 11 }}>
        <Select label="Account" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {staff.length === 0 && <option value="">No mentor accounts yet</option>}
          {staff.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {m.username}
            </option>
          ))}
        </Select>

        <Field
          label={firstTime ? 'Choose your password' : 'Password'}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
          {busy ? 'Checking…' : 'Sign in as mentor'}
        </Button>
      </form>

      <Button variant="quiet" block style={{ marginTop: 14 }} onClick={() => navigate('/signin')}>
        I&rsquo;m a student
      </Button>
    </AuthLayout>
  )
}
