import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { useCan } from '@/domain/useCan'

/**
 * First-run guidance on Today.
 *
 * A checklist rather than a tour, because it is driven by the actual state of
 * the season: each step ticks itself off when the thing genuinely exists, and
 * the whole card disappears once the team is running. Nothing to dismiss and
 * re-find, and no fake progress.
 *
 * A step the signed-in person cannot do is shown *with the reason*, not hidden.
 * Silently dropping it meant a student and a coach saw different lists with no
 * explanation, and "why does my screen say 3 of 5 and yours says 5 of 5" is a
 * worse question than one line of text answers.
 *
 * Each step can also be put aside. Some of them are genuinely not going to
 * happen — a team with no sponsors is not going to set a fundraising goal — and
 * without a way to say so the card stayed on Today forever.
 */
/** Stable identity so the memo does not re-run every render. */
const EMPTY: string[] = []

export function GettingStarted() {
  const season = useStore((s) => s.season)
  const allow = useCan()
  const role = useStore((s) => s.session.role)
  const dismissed = useStore((s) => s.session.onboardingDismissed)
  const dismissOnboarding = useStore((s) => s.dismissOnboarding)
  const snoozeStep = useStore((s) => s.snoozeOnboardingStep)
  const snoozed = useStore((s) => s.session.snoozedOnboardingSteps) ?? EMPTY
  const navigate = useNavigate()

  const steps = useMemo(() => {
    const all = [
      {
        id: 'members',
        label: 'Add the rest of the team',
        hint: 'They set their own password the first time they sign in.',
        done: season.members.length > 1,
        to: '/roster',
        allowed: allow('roster.manage'),
        blocked: 'Only a coach or mentor can add people.',
      },
      {
        id: 'meeting',
        label: 'Put your build sessions on the calendar',
        hint: 'Competitions come from FTCScout automatically — these are the ones only you know.',
        done: season.events.some((e) => e.source !== 'ftc-scout'),
        to: '/calendar/edit',
        allowed: allow('calendar.edit'),
        blocked: 'Ask a captain or coach to add meetings.',
      },
      {
        id: 'task',
        label: 'Assign the first task',
        hint: 'Anything with a name and an owner. Today shows what is yours and what is late.',
        done: season.tasks.length > 0,
        to: '/today',
        allowed: allow('tasks.create'),
        blocked: 'Parents can see tasks but not create them.',
      },
      {
        id: 'budget',
        label: 'Set a fundraising goal',
        hint: 'Then log sponsors as they commit, so progress is visible to the whole team.',
        done: season.team.goal > 0 || season.sponsors.length > 0,
        to: '/budget',
        allowed: allow('budget.edit'),
        blocked: 'Only a coach or mentor can edit the budget.',
      },
      {
        id: 'media',
        label: 'Add a build photo',
        hint: 'One per build day is enough — the weekly page and the notebook both pull from it.',
        done: season.media.length > 0,
        to: '/build',
        allowed: allow('media.upload'),
        blocked: 'Sign in as a team member to add photos.',
      },
    ]
    return all.filter((s) => !snoozed.includes(s.id))
  }, [season, role, snoozed])

  const doneCount = steps.filter((s) => s.done).length
  // A blocked step counts as settled: this person is never going to tick it,
  // and leaving it outstanding would keep the card up for them forever.
  const settled = steps.filter((s) => s.done || !s.allowed).length
  const complete = steps.length === 0 || settled === steps.length

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
            <li key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <button
                type="button"
                disabled={!step.allowed}
                onClick={() => navigate(step.to)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 6px',
                  borderRadius: 8,
                  opacity: step.done || !step.allowed ? 0.55 : 1,
                  cursor: step.allowed ? 'pointer' : 'default',
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
                    borderStyle: !step.done && !step.allowed ? 'dashed' : 'solid',
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
                      {/* Say why rather than leaving a step that does nothing
                          when tapped and never explains itself. */}
                      {step.allowed ? step.hint : step.blocked}
                    </span>
                  )}
                </span>
              </button>
              {!step.done && step.allowed && (
                <button
                  type="button"
                  onClick={() => snoozeStep(step.id)}
                  className="meta"
                  style={{ flex: 'none', padding: '8px 4px', color: 'var(--ink-4)' }}
                >
                  Do later
                </button>
              )}
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
