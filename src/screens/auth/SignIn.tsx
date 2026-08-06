import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Brand } from '@/components/Brand'
import { Button, Field } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { isConfigured } from '@/domain/season'
import { isAuthConfigured } from '@/lib/auth'

/**
 * A1 · Sign in
 *
 * One door, and no shared secret behind it.
 *
 * There used to be a team password: one string everyone knew, that lived in a
 * group chat and was never rotated. It protected nothing. A device that has
 * never synced has an empty season, so there is nothing on it to gate; a device
 * restored from a backup file already holds everything the file contained. What
 * actually establishes who somebody is, is their own account, and what
 * establishes that they belong on the team is a coach saying so.
 *
 * So this screen only routes:
 *
 *  - Real accounts configured → sign in with one.
 *  - No accounts, and nobody on the team yet → whoever is here is setting the
 *    app up, so they make the first account and are its coach. There is nobody
 *    to approve them; requiring approval would be a deadlock.
 *  - No accounts, but the team exists → pick yourself and use your own password.
 */
export function SignInScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const createFirstAccount = useStore((s) => s.createFirstAccount)
  const notify = useStore((s) => s.notify)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // A team has to exist before anybody can be on it.
  if (!isConfigured(season)) return <Navigate to="/identity" replace />
  if (isAuthConfigured()) return <Navigate to="/signin/cloud" replace />
  if (season.members.some((m) => m.status === 'active')) return <Navigate to="/signin/who" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('What should the team call you?')
    if (password.length < 8) return setError('Use at least eight characters')

    setBusy(true)
    try {
      const member = await createFirstAccount({ name, email, password })
      notify(`Signed in as ${member.name}`)
      navigate('/today')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <Brand size={52} />
      <h1 className="h1-lg" style={{ margin: '22px 0 8px', fontSize: 27 }}>
        Create your account
      </h1>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 8 }}>
        You are the first person here, so this account runs{' '}
        <strong style={{ color: 'var(--ink-2)' }}>
          {season.team.number} {season.team.name}
        </strong>
        . Everyone you add afterwards gets their own.
      </p>
      <p className="meta pretty" style={{ marginBottom: 22 }}>
        Stored on this device only, hashed — nothing is sent anywhere. Connect a Supabase project
        later and everyone can sign in with email, Google or GitHub instead.
      </p>

      <form onSubmit={submit} className="stack" style={{ gap: 11 }}>
        <Field
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How the team knows you"
          autoComplete="name"
        />
        <Field
          label="Email (optional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
          hint="Only used to match you up if you add accounts later."
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          error={error}
          hint={error ? undefined : 'At least eight characters. Yours alone — not shared with the team.'}
        />
        <Button type="submit" variant="primary" size="lg" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Creating…' : 'Create account and start'}
        </Button>
      </form>

      <hr className="divider" style={{ margin: '26px 0 18px' }} />

      <Button variant="quiet" block onClick={() => navigate('/identity')}>
        This is the wrong team
      </Button>
    </AuthLayout>
  )
}
