import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Meter } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { money } from '@/lib/format'

/**
 * 01 · Guest onboarding hub
 *
 * Real answers before any account: your regional partner, what year one costs,
 * what is due next, and events near you.
 *
 * No signup wall. The one save prompt is a card at the bottom that emails a link
 * — it never blocks scroll. Deadlines get amber, not red: nothing has gone wrong
 * yet.
 */

const PARTNERS: Record<string, { name: string; region: string; city: string; initials: string; site: string }> = {
  ON: { name: 'FIRST Robotics Canada', region: 'Ontario regional partner', city: 'Mississauga', initials: 'ON', site: 'firstroboticscanada.org' },
  BC: { name: 'FIRST Robotics Canada', region: 'BC regional partner', city: 'Vancouver', initials: 'BC', site: 'firstroboticscanada.org' },
  CA: { name: 'FIRST Robotics Canada', region: 'National partner', city: 'Mississauga', initials: 'CA', site: 'firstroboticscanada.org' },
  US: { name: 'FIRST Headquarters', region: 'Program delivery partner', city: 'Manchester, NH', initials: 'US', site: 'firstinspires.org' },
}

const COST_BREAKDOWN = [
  { label: 'Kit', value: 2660, tone: 'signal' as const },
  { label: 'Registration', value: 1650, tone: 'dim' as const },
  { label: 'Travel', value: 2030, tone: 'pressure' as const },
]

export function GuestOnboardingScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const notify = useStore((s) => s.notify)

  const [region, setRegion] = useState<keyof typeof PARTNERS>('ON')
  const [postal, setPostal] = useState('L5N')
  const [email, setEmail] = useState('')

  const partner = PARTNERS[region]
  const yearOne = COST_BREAKDOWN.reduce((sum, c) => sum + c.value, 0)

  const upcoming = season.events
    .filter((e) => e.type === 'comp' || e.type === 'dead')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)

  return (
    <div className="auth-shell" style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="auth-card" style={{ width: '100%', maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <span
            className="label"
            style={{
              color: 'var(--signal)',
              padding: '5px 8px',
              border: '1px solid var(--signal-line)',
              borderRadius: 5,
              background: '#171e10',
            }}
          >
            GUEST · NO ACCOUNT
          </span>
          <Button size="sm" variant="quiet" onClick={() => navigate('/')}>
            Back
          </Button>
        </div>

        <h1 className="h1-lg" style={{ fontSize: 25, marginBottom: 6 }}>
          Starting a team in {region === 'US' ? 'the US' : region === 'ON' ? 'Ontario' : region}
        </h1>
        <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 20 }}>
          Everything below is public data. Nothing is saved unless you ask.
        </p>

        <div style={{ display: 'flex', gap: 9, marginBottom: 16, flexWrap: 'wrap' }}>
          {(Object.keys(PARTNERS) as (keyof typeof PARTNERS)[]).map((key) => (
            <Button key={key} size="sm" variant={region === key ? 'primary' : 'default'} onClick={() => setRegion(key)}>
              {key}
            </Button>
          ))}
        </div>

        {/* ── partner ──────────────────────────────────── */}
        <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ padding: '13px 15px', borderBottom: '1px solid #22282b' }}>
            <span className="label">Your program delivery partner</span>
          </div>
          <div style={{ padding: 15, display: 'flex', gap: 13, alignItems: 'flex-start' }}>
            <span
              style={{
                width: 44,
                height: 44,
                flex: 'none',
                borderRadius: 10,
                background: '#1d2427',
                border: '1px solid var(--line-2)',
                display: 'grid',
                placeItems: 'center',
                font: '600 13px var(--font-mono)',
                color: 'var(--signal)',
              }}
            >
              {partner.initials}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '600 14.5px/1.25 var(--font-sans)', color: 'var(--ink)' }}>{partner.name}</div>
              <div className="lede" style={{ marginTop: 2 }}>
                {partner.region} · {partner.city}
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
                <a href={`https://${partner.site}`} target="_blank" rel="noreferrer noopener">
                  <Button size="sm" variant="primary">
                    Visit {partner.site}
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── cost + deadline ──────────────────────────── */}
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div className="card card-pad" style={{ padding: 14 }}>
            <div className="label" style={{ marginBottom: 9 }}>
              Year one cost
            </div>
            <div className="num" style={{ font: '600 26px/1 var(--font-mono)', color: 'var(--ink)' }}>
              {money(yearOne)}
            </div>
            <div className="meta" style={{ marginTop: 5 }}>
              Median rookie
            </div>
            <div style={{ marginTop: 11 }}>
              <Meter
                small
                label="Cost split"
                segments={COST_BREAKDOWN.map((c) => ({ value: c.value, of: yearOne, tone: c.tone }))}
              />
            </div>
            <div className="meta" style={{ marginTop: 6 }}>
              {COST_BREAKDOWN.map((c) => `${c.label} ${Math.round((c.value / yearOne) * 100)}%`).join(' · ')}
            </div>
          </div>

          <div className="card card-pad" style={{ padding: 14 }}>
            <div className="label" style={{ marginBottom: 9 }}>
              Next deadline
            </div>
            {/* Amber, not red — nothing has gone wrong yet. */}
            <div className="num" style={{ font: '600 26px/1 var(--font-mono)', color: 'var(--pressure)' }}>
              {upcoming[0] ? new Date(`${upcoming[0].date}T12:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
            </div>
            <div className="meta" style={{ marginTop: 5 }}>
              {upcoming[0]?.title ?? 'Season registration'}
            </div>
            {upcoming[1] && (
              <div className="meta" style={{ marginTop: 11 }}>
                Then: {upcoming[1].title}
                <br />
                <span className="num" style={{ font: '500 11px var(--font-mono)', color: 'var(--ink-2)' }}>
                  {new Date(`${upcoming[1].date}T12:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── events ───────────────────────────────────── */}
        <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
          <div
            style={{ padding: '13px 15px', borderBottom: '1px solid #22282b', display: 'flex', gap: 10, alignItems: 'center' }}
          >
            <span className="label" style={{ flex: 1 }}>
              Events near
            </span>
            <input
              className="field"
              style={{ width: 110, height: 32, font: '500 12px var(--font-mono)' }}
              value={postal}
              onChange={(e) => setPostal(e.target.value.toUpperCase())}
              aria-label="Postal or ZIP code"
            />
          </div>
          {upcoming.map((event) => (
            <div
              key={event.id}
              style={{
                padding: '12px 15px',
                borderBottom: '1px solid var(--line-soft)',
                display: 'flex',
                gap: 13,
                alignItems: 'center',
              }}
            >
              <div style={{ width: 42, flex: 'none', textAlign: 'center' }}>
                <div className="num" style={{ font: '600 15px/1 var(--font-mono)', color: 'var(--ink)' }}>
                  {new Date(`${event.date}T12:00`).getDate()}
                </div>
                <div
                  style={{ font: '500 9px/1.6 var(--font-mono)', color: 'var(--ink-4)', letterSpacing: '0.1em' }}
                >
                  {new Date(`${event.date}T12:00`).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{event.title}</div>
                <div className="meta">{event.location ?? 'Location TBC'}</div>
              </div>
              <span
                className="label"
                style={{ padding: '4px 7px', border: '1px solid var(--line-2)', borderRadius: 5, color: 'var(--ink-3)' }}
              >
                {event.type === 'comp' ? 'QUAL' : 'DEADLINE'}
              </span>
            </div>
          ))}
        </div>

        {/* ── save prompt ──────────────────────────────── */}
        <div
          style={{ borderRadius: 20, background: '#171c10', padding: '14px 15px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>Keep this?</div>
            <div className="meta" style={{ marginTop: 2 }}>
              Emails you a link. No account made.
            </div>
          </div>
          <Field
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@example.org"
            aria-label="Email"
            style={{ width: 200, flex: 'none', height: 40 }}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={!email.includes('@')}
            onClick={() => {
              // No account, no server round-trip: hand it to the user's own mail client.
              const body = [
                `FTC Home — starting a team in ${region}`,
                '',
                `Partner: ${partner.name}, ${partner.city} (${partner.site})`,
                `Year one cost: ${money(yearOne)}`,
                ...COST_BREAKDOWN.map((c) => `  ${c.label}: ${money(c.value)}`),
                '',
                'Upcoming:',
                ...upcoming.map((e) => `  ${e.date} — ${e.title}`),
              ].join('\n')
              globalThis.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Starting an FTC team')}&body=${encodeURIComponent(body)}`
              notify('Opened your mail app with the summary')
            }}
          >
            Save
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 9, marginTop: 20, flexWrap: 'wrap' }}>
          <Button block onClick={() => navigate('/identity')}>
            I have a team number
          </Button>
          <Button block variant="primary" onClick={() => navigate('/register')}>
            Register a team
          </Button>
        </div>
      </div>
    </div>
  )
}
