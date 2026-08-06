import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BrandLaunch, Wordmark } from '@/components/Brand'
import { Button } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { isConfigured } from '@/domain/season'

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
  const session = useStore((s) => s.session)
  const season = useStore((s) => s.season)
  const browseAsGuest = useStore((s) => s.browseAsGuest)
  const [replayKey, setReplayKey] = useState(0)
  const [motion, setMotion] = useState(true)

  const team = season.team
  const configured = isConfigured(season)

  useEffect(() => {
    setMotion(!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  }, [])

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
        padding: '48px 24px calc(48px + env(safe-area-inset-bottom))',
        gap: 0,
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
          <>
            <Button variant="primary" size="lg" block onClick={() => navigate('/signin')}>
              Sign in to my team
            </Button>
            <Button block onClick={() => navigate('/signin/mentor')}>
              Mentor or volunteer
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" block onClick={() => navigate('/identity')}>
            Set up my team
          </Button>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            variant="quiet"
            block
            onClick={() => {
              browseAsGuest()
              navigate('/guest')
            }}
          >
            Browse as guest
          </Button>
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
