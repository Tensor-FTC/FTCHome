import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Brand } from '@/components/Brand'
import { Button, Field } from '@/components/ui'
import { useStore } from '@/store/useStore'
import {
  currentAuthUser,
  isAuthConfigured,
  looksLikeAuthCallback,
  sendPasswordReset,
  signInWithEmail,
  signInWithLink,
  signInWithProvider,
  signUpWithEmail,
  type AuthResult,
} from '@/lib/auth'

type Mode = 'signin' | 'signup' | 'link' | 'reset'

const TITLE: Record<Mode, string> = {
  signin: 'Sign in',
  signup: 'Create an account',
  link: 'Sign in with a link',
  reset: 'Reset your password',
}

/**
 * A6 · Cloud sign-in
 *
 * An account that follows you between devices: email and password, an emailed
 * link, Google or GitHub. All of it is Supabase Auth, so the credentials live
 * with the identity provider and never in this app.
 *
 * Signing in proves *who you are* and nothing more. Being on a team is a
 * separate fact that a coach decides — anybody who signs in without matching a
 * member lands on the roster as a request. That split is the whole point: a
 * link that anyone can open should not be a way onto anybody's roster.
 *
 * This screen needs the network. A device that is already signed in keeps its
 * session offline, which is the case that actually matters at a venue.
 */
export function CloudSignInScreen() {
  const navigate = useNavigate()
  const signInWithCloudUser = useStore((s) => s.signInWithCloudUser)
  const notify = useStore((s) => s.notify)

  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AuthResult | null>(null)
  const [checking, setChecking] = useState(true)

  const configured = isAuthConfigured()

  /**
   * A provider sends the browser back here with a token in the URL. Supabase
   * consumes it on client creation, so this just asks who is signed in once the
   * dust settles, and adopts them.
   */
  useEffect(() => {
    if (!configured) {
      setChecking(false)
      return
    }
    let live = true
    void currentAuthUser()
      .then((user) => {
        if (!live || !user) return
        const outcome = signInWithCloudUser(user)
        notify(outcome.message, outcome.awaitingApproval ? 'warn' : 'ok')
        navigate(outcome.awaitingApproval ? '/pending' : '/today')
      })
      .finally(() => live && setChecking(false))
    return () => {
      live = false
    }
  }, [configured, signInWithCloudUser, notify, navigate])

  async function run(action: () => Promise<AuthResult>) {
    setBusy(true)
    setResult(null)
    const outcome = await action()
    setBusy(false)
    setResult(outcome)
    if (outcome.ok && outcome.user) {
      const joined = signInWithCloudUser(outcome.user)
      notify(joined.message, joined.awaitingApproval ? 'warn' : 'ok')
      navigate(joined.awaitingApproval ? '/pending' : '/today')
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'signin') return void run(() => signInWithEmail(email, password))
    if (mode === 'signup') return void run(() => signUpWithEmail(email, password, name))
    if (mode === 'link') return void run(() => signInWithLink(email))
    return void run(() => sendPasswordReset(email))
  }

  if (!configured) {
    return (
      <AuthLayout back="/signin">
        <Brand size={52} />
        <h1 className="h1-lg" style={{ margin: '22px 0 8px', fontSize: 27 }}>
          No accounts yet
        </h1>
        <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 22 }}>
          Email and Google sign-in need a Supabase project connected to this app. A coach sets that up
          once, under Settings → Sync, and then everyone signs in with their own account.
        </p>
        <p className="meta pretty" style={{ marginBottom: 22 }}>
          Until then each device keeps its own accounts, which works but does not share anything.
        </p>
        <Button variant="primary" block onClick={() => navigate('/signin')}>
          Set up on this device
        </Button>
      </AuthLayout>
    )
  }

  const busyOrChecking = busy || checking

  return (
    <AuthLayout back="/signin">
      <Brand size={52} />
      <h1 className="h1-lg" style={{ margin: '22px 0 8px', fontSize: 27 }}>
        {TITLE[mode]}
      </h1>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 22 }}>
        {mode === 'signup'
          ? 'Your account is yours — it works on every device, and a coach adds you to the team once.'
          : 'One account, every device. Your coach decides which team you land on.'}
      </p>

      {mode !== 'reset' && (
        <>
          <div className="stack" style={{ gap: 9, marginBottom: 16 }}>
            <Button block disabled={busyOrChecking} onClick={() => void run(() => signInWithProvider('google'))}>
              Continue with Google
            </Button>
            <Button block disabled={busyOrChecking} onClick={() => void run(() => signInWithProvider('github'))}>
              Continue with GitHub
            </Button>
          </div>
          <div className="rule-label">or</div>
        </>
      )}

      <form onSubmit={onSubmit} className="stack" style={{ gap: 11, marginTop: 16 }}>
        {mode === 'signup' && (
          <Field
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How the team knows you"
            autoComplete="name"
          />
        )}
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          inputMode="email"
        />
        {(mode === 'signin' || mode === 'signup') && (
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            hint={mode === 'signup' ? 'At least eight characters.' : undefined}
          />
        )}

        <Button
          type="submit"
          variant="primary"
          block
          disabled={busyOrChecking || !email.trim() || (mode === 'signup' && !name.trim())}
        >
          {busy
            ? 'Working…'
            : mode === 'signin'
              ? 'Sign in'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'link'
                  ? 'Email me a link'
                  : 'Email me a reset link'}
        </Button>
      </form>

      {result && !result.ok && (
        <p className="field-error" role="alert" style={{ marginTop: 12 }}>
          {result.message}
        </p>
      )}
      {result?.ok && result.awaitingEmail && (
        <p className="meta pretty" style={{ marginTop: 12, color: 'var(--signal)' }}>
          {result.message}
        </p>
      )}

      <div className="wrap" style={{ marginTop: 20, gap: 14 }}>
        {mode !== 'signin' && (
          <button type="button" className="link-quiet" onClick={() => setMode('signin')}>
            Sign in instead
          </button>
        )}
        {mode !== 'signup' && (
          <button type="button" className="link-quiet" onClick={() => setMode('signup')}>
            Create an account
          </button>
        )}
        {mode !== 'link' && (
          <button type="button" className="link-quiet" onClick={() => setMode('link')}>
            Email me a link
          </button>
        )}
        {mode === 'signin' && (
          <button type="button" className="link-quiet" onClick={() => setMode('reset')}>
            Forgot password
          </button>
        )}
      </div>

      <p className="field-note" style={{ marginTop: 20 }}>
        {looksLikeAuthCallback() && checking
          ? 'Finishing sign-in…'
          : 'Signing in needs a network once. After that this device stays signed in offline.'}
      </p>
    </AuthLayout>
  )
}
