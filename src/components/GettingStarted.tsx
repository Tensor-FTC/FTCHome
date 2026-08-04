import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { can } from '@/domain/permissions'

/**
 * First-run guidance on Today.
 *
 * A checklist rather than a tour, because it is driven by the actual state of
 * the season: each step ticks itself off when the thing genuinely exists, and
 * the whole card disappears once the team is running. Nothing to dismiss and
 * re-find, and no fake progress.
 *
 * Steps are filtered by what the signed-in role may actually do — telling a
 * student to log a sponsor they cannot log is worse than saying nothing.
 */
export function GettingStarted() {
  const season = useStore((s) => s.season)
  const role = useStore((s) => s.session.role)
  const dismissed = useStore((s) => s.session.onboardingDismissed)
  const dismissOnboarding = useStore((s) => s.dismissOnboarding)
  const navigate = useNavigate()

  const steps = useMemo(() => {
    const all = [
      {
        id: 'members',
        label: 'Add the rest of the team',
        hint: 'They get the team code and set their own password.',
        done: season.members.length > 1,
        to: '/roster',
        allowed: can(role, 'roster.manage'),
      },
      {
        id: 'meeting',
        label: 'Put your build sessions on the calendar',
        hint: 'Competitions come from FTCScout automatically — these are the ones only you know.',
        done: season.events.some((e) => e.source !== 'ftc-scout'),
        to: '/calendar/edit',
        allowed: can(role, 'calendar.edit'),
      },
      {
        id: 'task',
        label: 'Assign the first task',
        hint: 'Anything with a name and an owner. Today shows what is yours and what is late.',
        done: season.tasks.length > 0,
        to: '/today',
        allowed: can(role, 'tasks.create'),
      },
      {
        id: 'budget',
        label: 'Set a fundraising goal',
        hint: 'Then log sponsors as they commit, so progress is visible to the whole team.',
        done: season.team.goal > 0 || season.sponsors.length > 0,
        to: '/budget',
        allowed: can(role, 'budget.edit'),
      },
      {
        id: 'media',
        label: 'Add a build photo',
        hint: 'One per build day is enough — the weekly page and the notebook both pull from it.',
        done: season.media.length > 0,
        to: '/build',
        allowed: can(role, 'media.upload'),
      },
    ]
    return all.filter((s) => s.allowed)
  }, [season, role])

  const doneCount = steps.filter((s) => s.done).length
  const complete = steps.length === 0 || doneCount === steps.length

  // Once the team is genuinely up and running, this stops appearing on its own.
  if (complete || dismissed) return null

  const next = steps.find((s) => !s.done)

  return (
    <div className="section">
      <div className="card-signal card-pad" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div className="label" style={{ color: 'var(--signal)' }}>
              Getting started · {doneCount} of {steps.length}
            </div>
            <p className="body pretty" style={{ color: 'var(--ink-2)', marginTop: 6 }}>
              {season.team.number ? (
                <>
                  {season.team.number} {season.team.name} is linked, so your competitions and results are
                  already here. The rest is what only your team knows.
                </>
              ) : (
                'Link your team to pull in your real competitions and results.'
              )}
            </p>
          </div>
          <IconButton label="Hide getting started" small onClick={dismissOnboarding}>
            ×
          </IconButton>
        </div>

        <ol style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {steps.map((step) => (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => navigate(step.to)}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 6px',
                  borderRadius: 8,
                  opacity: step.done ? 0.55 : 1,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    flex: 'none',
                    marginTop: 1,
                    borderRadius: 5,
                    border: `1px solid ${step.done ? 'var(--signal)' : 'var(--line-3)'}`,
                    background: step.done ? 'var(--signal)' : 'transparent',
                    color: 'var(--signal-ink)',
                    display: 'grid',
                    placeItems: 'center',
                    font: '600 10px var(--font-mono)',
                  }}
                >
                  {step.done ? '✓' : ''}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      font: '500 12.5px var(--font-sans)',
                      color: 'var(--ink-body)',
                      textDecoration: step.done ? 'line-through' : 'none',
                    }}
                  >
                    {step.label}
                  </span>
                  {!step.done && (
                    <span className="meta" style={{ display: 'block', marginTop: 2 }}>
                      {step.hint}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
          {next && (
            <Button size="sm" variant="primary" onClick={() => navigate(next.to)}>
              {next.label}
            </Button>
          )}
          <Link to="/help">
            <Button size="sm" variant="quiet">
              How this works
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
