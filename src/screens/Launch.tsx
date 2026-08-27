import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BrandLaunch, Wordmark } from '@/components/Brand'
import { Button } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { isConfigured } from '@/domain/season'
import { installState, platform } from '@/lib/install'
import { demoSeason, DEMO_EMAIL, DEMO_NAME, DEMO_PASSWORD } from '@/lib/demo'

/**
 * 00 · Launch
 *
 * The mark scales up once on cold start over a soft lime halo, then the tagline
 * and the three entry actions fade in. Only transform and opacity animate, once,
 * on a single element — the launch costs one frame of work rather than a running
 * animation.
 */
export function LaunchScreen() {
  const navigate = useNavigate()
  // iPhone, in a browser tab rather than the installed app.
  const installHint = platform() === 'ios' && installState() === 'manual-ios'
  const session = useStore((s) => s.session)
  const season = useStore((s) => s.season)
  const browseAsGuest = useStore((s) => s.browseAsGuest)
  const replaceSeason = useStore((s) => s.replaceSeason)
  const createFirstAccount = useStore((s) => s.createFirstAccount)
  const notify = useStore((s) => s.notify)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [replayKey, setReplayKey] = useState(0)
  const [motion, setMotion] = useState(true)

  const team = season.team
  const configured = isConfigured(season)

  useEffect(() => {
    setMotion(!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  }, [])

  /**
   * Load a demo season and sign in to it.
   *
   * The account is created here, on the device, exactly like a real first
   * account — so there is no password shipped in the bundle waiting to be
   * found. Everything it creates lives in this browser and is removed by
   * Settings → Data → erase.
   */
  async function tryDemo() {
    setLoadingDemo(true)
    try {
      await replaceSeason(demoSeason())
      await createFirstAccount({
        name: DEMO_NAME,
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        role: 'coach',
      })
      navigate('/today')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not start the demo', 'warn')
      setLoadingDemo(false)
    }
  }

  // Already signed in? Go where the work is.
  if (session.memberId) return <Navigate to="/today" replace />

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'radial-gradient(520px 420px at 50% 38%, #16191C 0%, #08090A 70%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px calc(40px + env(safe-area-inset-bottom))',
        // Five controls now sit under the mark; without a floor here the
        // tagline collides with the first button on a short phone.
        gap: 28,
      }}
    >
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <BrandLaunch key={replayKey} size={132} animate={motion} />
          <div style={{ marginTop: 4 }}>
            <Wordmark animate={motion} />
          </div>
          <div
            style={{
              font: '500 10px/1 var(--font-mono)',
              color: 'var(--ink-rail)',
              letterSpacing: '0.3em',
              marginTop: 16,
              animation: motion ? 'fadeIn .5s ease .78s both' : undefined,
            }}
          >
            ONE PLACE. ALL SEASON.
          </div>
        </div>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          animation: motion ? 'fadeIn .5s ease .92s both' : undefined,
        }}
      >
        {configured ? (
          <Button variant="primary" size="lg" block onClick={() => navigate('/signin')}>
            Sign in
          </Button>
        ) : (
          <>
            {/* Four separate doors rather than one "Set up my team" that had
                to mean all of them. Which one you are is the first thing you
                know about yourself, and the old single button made joining an
                existing team look like it was not supported.

                The fourth is for somebody who is not on a team yet at all —
                previously buried behind a "Browse as guest" link that sounded
                like a lesser version of the app rather than the answer to
                "how do I even start a team?". */}
            <Button variant="primary" size="lg" block onClick={() => navigate('/identity')}>
              Start a new team with FTC Home
            </Button>
            <Button size="lg" block onClick={() => navigate('/join')}>
              Join a team I&rsquo;m on
            </Button>
            <Button size="lg" block onClick={() => navigate('/signin/cloud')}>
              Sign in to my account
            </Button>
            <Button
              size="lg"
              block
              onClick={() => {
                browseAsGuest()
                navigate('/start')
              }}
            >
              Learn how to get started
            </Button>

            {/* Every screen starts genuinely empty on purpose, which is right
                for a real team and wrong for somebody evaluating the app in
                ninety seconds. Opt-in, obvious, and one tap to erase. */}
            <Button variant="quiet" block disabled={loadingDemo} onClick={() => void tryDemo()}>
              {loadingDemo ? 'Loading demo…' : 'Explore a demo season'}
            </Button>
          </>
        )}

        {/*
          * Said here, not in Settings.
          *
          * The install instructions lived behind a sign-in, which is the one
          * place somebody setting up their phone for the first time cannot
          * reach. Shown only on an iPhone that has not installed it yet, so it
          * is never in the way of anybody it does not apply to.
          */}
        {installHint && (
          <p className="meta pretty" style={{ marginTop: 4, marginBottom: 4 }}>
            <strong style={{ color: 'var(--ink-2)' }}>On your iPhone:</strong> tap{' '}
            <strong>Share</strong>, then <strong>Add to Home Screen</strong>, and open it from the
            icon. It works offline that way. Then pick <strong>Join a team I&rsquo;m on</strong> and
            sign in with the same account you use elsewhere.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="quiet"
            aria-label="Replay the launch animation"
            title="Replay"
            style={{ width: 46, flex: 'none', padding: 0 }}
            onClick={() => setReplayKey((k) => k + 1)}
          >
            ↻
          </Button>
        </div>

        <p className="meta" style={{ textAlign: 'center', marginTop: 6, color: 'var(--ink-4)' }}>
          {configured
            ? `${team.number} · ${team.name} · ${[team.city, team.state].filter(Boolean).join(', ')}`
            : 'Real team data from FTCScout. No account needed to look around.'}
        </p>
      </div>
    </div>
  )
}
