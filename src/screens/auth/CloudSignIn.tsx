import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Brand } from '@/components/Brand'
import { Button, Chip, Field } from '@/components/ui'
import { ROLE_LABEL, type Role } from '@/domain/types'
import { claimedRole, clearClaimedRole, rememberClaimedRole } from '@/lib/invites'
import { useStore } from '@/store/useStore'
import { ProviderButton } from '@/components/ProviderButton'
import {
  currentAuthUser,
  OAUTH_PROVIDERS,
  isAuthConfigured,
  looksLikeAuthCallback,
  sendPasswordReset,
  signInWithEmail,
  signInWithLink,
  signInWithProvider,
  signUpWithEmail,
  verifyEmailCode,
  type AuthResult,
} from '@/lib/auth'

/**
 * Read the parked role and forget it in one go.
 *
 * Once used it must not linger: signing out and back in months later should
 * not silently re-apply a claim from a different day.
 */
function takeClaimedRole(): Role | undefined {
  const stored = claimedRole()
  clearClaimedRole()
  return (stored || undefined) as Role | undefined
}

type Mode = 'signin' | 'signup' | 'link' | 'reset'

const MODES: Mode[] = ['signin', 'signup', 'link', 'reset']

/**
 * Which form to open on.
 *
 * Somebody who has just finished naming their team does not have an account
 * yet, so showing them a *sign in* form asks for a password they have never
 * set. The screens that know the person is new say so with `?mode=signup`;
 * anything else opens on sign-in, which is the right guess for a returning
 * person and the only one worth defaulting to.
 */
function initialMode(raw: string | null): Mode {
  return MODES.includes(raw as Mode) ? (raw as Mode) : 'signin'
}

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
 * link, Google, GitHub or Microsoft. All of it is Supabase Auth, so the credentials live
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
  const authUserId = useStore((s) => s.session.authUserId)
  const notify = useStore((s) => s.notify)

  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(() => initialMode(params.get('mode')))
  const [name, setName] = useState('')
  // Everybody used to be filed as a student, so a mentor joining had to be
  // found and corrected by hand — and nothing ever asked them.
  const [role, setRole] = useState<Role>('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AuthResult | null>(null)
  const [checking, setChecking] = useState(true)
  // Shown once a link has been sent: on an installed iPhone app the link opens
  // Safari instead, so the code is the only route that finishes here.
  const [code, setCode] = useState('')

  const configured = isAuthConfigured()

  /**
   * Someone who is already signed in should not be shown a sign-in form.
   *
   * `CloudSessionBridge` in App.tsx owns adopting a provider callback, since
   * providers return to the app's base URL rather than to this screen. This
   * only covers arriving here directly with a live session — so it skips an
   * account already bound to this device rather than adopting it twice.
   */
  useEffect(() => {
    if (!configured) {
      setChecking(false)
      return
    }
    let live = true
    void currentAuthUser()
      .then((user) => {
        if (!live || !user || user.id === authUserId) return
        const outcome = signInWithCloudUser(user, takeClaimedRole())
        notify(outcome.message, outcome.awaitingApproval ? 'warn' : 'ok')
        navigate(outcome.awaitingApproval ? '/pending' : '/today', { replace: true })
      })
      .finally(() => live && setChecking(false))
    return () => {
      live = false
    }
  }, [configured, authUserId, signInWithCloudUser, notify, navigate])

  async function run(action: () => Promise<AuthResult>) {
    // Parked before the provider takes the browser away, since React state
    // does not survive the round trip.
    if (mode === 'signup') rememberClaimedRole(role)
    setBusy(true)
    setResult(null)
    const outcome = await action()
    setBusy(false)
    setResult(outcome)
    if (outcome.ok && outcome.user) {
      const joined = signInWithCloudUser(outcome.user, takeClaimedRole())
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
          Email, Google, GitHub and Microsoft sign-in need a Supabase project connected to this app. A coach sets that up
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
            {OAUTH_PROVIDERS.map((p) => (
              <ProviderButton
                key={p}
                provider={p}
                disabled={busyOrChecking}
                onClick={() => void run(() => signInWithProvider(p))}
              />
            ))}
          </div>
          <div className="rule-label">or</div>
        </>
      )}

      <form onSubmit={onSubmit} className="stack" style={{ gap: 11, marginTop: 16 }}>
        {mode === 'signup' && (
          <>
            <Field
              label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How the team knows you"
              autoComplete="name"
            />
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                You are the team&rsquo;s
              </div>
              <div className="wrap">
                {(['student', 'captain', 'mentor', 'coach', 'parent'] as Role[]).map((r) => (
                  <Chip key={r} active={role === r} onClick={() => setRole(r)}>
                    {ROLE_LABEL[r]}
                  </Chip>
                ))}
              </div>
              <p className="field-note" style={{ marginTop: 6 }}>
                What you tell the team you are. Whoever accepts you can change it.
              </p>
            </div>
          </>
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
        <>
          <p className="meta pretty" style={{ marginTop: 12, color: 'var(--signal)' }}>
            {result.message}
          </p>
          <div className="stack" style={{ gap: 9, marginTop: 12 }}>
            <Field
              label="Or paste the code from the email"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              mono
              hint="On an iPhone the link opens Safari instead of this app, so the code is the reliable way in."
            />
            <Button
              block
              disabled={busyOrChecking || code.length < 6}
              onClick={() => void run(() => verifyEmailCode(email, code))}
            >
              Sign in with the code
            </Button>
          </div>
        </>
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
