import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { clock } from '@/lib/format'

/**
 * The signature element: a match countdown that persists on every screen during
 * an event, docked above the tab bar.
 *
 * Three states. Alliance colour is a 4px edge at rest — it survives being seen
 * fifty times an hour — and becomes a full fill only under a minute, which is
 * the single place in the app a saturated alliance surface is allowed.
 *
 * The clock element never unmounts between states, so the digits keep ticking
 * through the expand transition.
 */
export function Countdown() {
  const settings = useStore((s) => s.season.settings)
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()

  const seconds = settings.matchSeconds
  const urgent = seconds < 60
  const alliance = settings.alliance === 'red' ? 'RED' : 'BLUE'
  const time = clock(seconds)

  if (urgent) {
    return (
      <div className="cd">
        <div className="cd-urgent" role="status" aria-live="assertive">
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  font: '600 10px var(--font-mono)',
                  color: '#fff',
                  letterSpacing: '0.2em',
                  opacity: 0.85,
                }}
              >
                GO TO FIELD {settings.matchField} NOW · {alliance}
              </div>
              <div
                className="num"
                style={{ font: '700 44px/1 var(--font-mono)', color: '#fff', letterSpacing: '-0.02em' }}
              >
                {time}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/comp')}
              style={{
                height: 52,
                padding: '0 17px',
                borderRadius: 11,
                border: '2px solid rgba(255,255,255,.85)',
                background: 'transparent',
                color: '#fff',
                font: '700 12.5px var(--font-sans)',
                letterSpacing: '0.04em',
              }}
            >
              Comp Mode
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (expanded) {
    return (
      <div className="cd">
        <div className="cd-expanded">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded={true}
            style={{ width: '100%', padding: '0 0 12px', display: 'flex', alignItems: 'center', gap: 11 }}
          >
            <span className="cd-edge" style={{ height: 30 }} />
            <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  font: '500 9px var(--font-mono)',
                  color: 'var(--ink-3)',
                  letterSpacing: '0.16em',
                }}
              >
                MATCH {settings.matchLabel} · FIELD {settings.matchField} · {alliance} ALLIANCE
              </span>
              <span
                className="num"
                style={{ display: 'block', font: '600 30px/1.15 var(--font-mono)', color: 'var(--ink)' }}
              >
                T− {time}
              </span>
            </span>
            <span className="mono" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              ⌄
            </span>
          </button>
          <div className="grid-2" style={{ gap: 8 }}>
            <div
              style={{
                border: '1px solid var(--alliance)',
                borderRadius: 14,
                background: 'var(--alliance-bg)',
                padding: '10px 11px',
              }}
            >
              <div className="label" style={{ fontSize: 8.5, marginBottom: 5 }}>
                With
              </div>
              <div className="num" style={{ font: '600 15px var(--font-mono)', color: 'var(--ink)' }}>
                {settings.partner}
              </div>
            </div>
            <div style={{ borderRadius: 14, background: 'var(--srf-inset)', padding: '10px 11px' }}>
              <div className="label" style={{ fontSize: 8.5, marginBottom: 5 }}>
                Against
              </div>
              <div className="num" style={{ font: '600 15px var(--font-mono)', color: 'var(--ink)' }}>
                {settings.opponents.join(' · ')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/comp')}
            style={{
              width: '100%',
              height: 44,
              marginTop: 9,
              borderRadius: 10,
              border: '1px solid var(--line-3)',
              background: '#1b2023',
              color: 'var(--ink)',
              font: '600 12.5px var(--font-sans)',
            }}
          >
            Competition Mode
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="cd">
      <button
        type="button"
        className="cd-compact"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        aria-label={`Match ${settings.matchLabel}, field ${settings.matchField}, ${alliance} alliance, T minus ${time}. Open for details.`}
      >
        <span className="cd-edge" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              font: '500 9px var(--font-mono)',
              color: 'var(--ink-3)',
              letterSpacing: '0.16em',
            }}
          >
            {settings.matchLabel} · FIELD {settings.matchField} · {alliance}
          </span>
          <span
            className="num"
            style={{ display: 'block', font: '600 20px/1.2 var(--font-mono)', color: 'var(--ink)' }}
          >
            T− {time}
          </span>
        </span>
        <span className="mono" style={{ fontSize: 13, color: 'var(--ink-3)' }} aria-hidden="true">
          ⌃
        </span>
      </button>
    </div>
  )
}
