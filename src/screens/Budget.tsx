import { useState, type FormEvent } from 'react'
import { Avatar, Button, Chip, Field, IconButton, LockedValue, Meter, SectionLabel } from '@/components/ui'
import { useStore, budgetTotals, currentMember } from '@/store/useStore'
import { can } from '@/domain/permissions'
import { money, pct } from '@/lib/format'
import { budgetCsv, download } from '@/lib/exporters'
import type { SponsorState } from '@/domain/types'

/**
 * B1 · Budget & sponsors
 *
 * What was raised, who gave it, and what it is allocated to. Mentors edit;
 * students read.
 *
 * Received and pledged are different bars on one meter, because a pledge that
 * has not arrived cannot buy motors. Allocation caps turn amber past 90% — the
 * same pressure colour used for deadlines, so overspend and lateness read alike.
 */
export function BudgetScreen() {
  const season = useStore((s) => s.season)
  const role = useStore((s) => s.session.role)
  const me = useStore(currentMember)
  const addSponsor = useStore((s) => s.addSponsor)
  const removeSponsor = useStore((s) => s.removeSponsor)
  const setGoal = useStore((s) => s.setGoal)
  const updateAllocation = useStore((s) => s.updateAllocation)
  const addApproval = useStore((s) => s.addApproval)
  const decideApproval = useStore((s) => s.decideApproval)
  const notify = useStore((s) => s.notify)

  const totals = budgetTotals(season)
  const editable = can(role, 'budget.edit')
  const seeAmounts = can(role, 'budget.viewAmounts')

  const [goalDraft, setGoalDraft] = useState(String(season.team.goal))
  const [spName, setSpName] = useState('')
  const [spAmount, setSpAmount] = useState('')
  const [spTier, setSpTier] = useState('BRONZE')
  const [spState, setSpState] = useState<SponsorState>('Pledged')
  const [reqTitle, setReqTitle] = useState('')
  const [reqAmount, setReqAmount] = useState('')
  const [reqAllocation, setReqAllocation] = useState(season.allocations[0]?.id ?? '')

  if (!seeAmounts) {
    return (
      <div className="screen">
        <div className="section" style={{ paddingTop: 10 }}>
          <h1 className="h1">Budget &amp; sponsors</h1>
          <p className="lede" style={{ marginTop: 4 }}>
            Progress is public. Figures are not.
          </p>
        </div>
        <div className="section">
          <div className="card-hero">
            <div className="label">Raised of goal</div>
            <div style={{ marginTop: 10 }}>
              <LockedValue shape="$•,••• / $•,•••" title="Mentors, coaches and students only" />
            </div>
            <div style={{ marginTop: 13 }}>
              <Meter
                label={`${pct(totals.raised, totals.goal)} percent of goal`}
                segments={[{ value: totals.raised, of: totals.goal }]}
              />
            </div>
            <div className="meta" style={{ marginTop: 10 }}>
              {pct(totals.raised, totals.goal)}% of the season goal is committed.
            </div>
          </div>
        </div>
        <div className="section">
          <div className="card-quiet card-pad">
            <div className="label" style={{ marginBottom: 8 }}>
              Why this is withheld
            </div>
            <p className="meta pretty">
              Sponsor amounts and allocation figures are visible to mentors and team members. Parents see
              the progress bar so they know how the season is going without seeing what any individual
              family gave.
            </p>
          </div>
        </div>
      </div>
    )
  }

  function onAddSponsor(e: FormEvent) {
    e.preventDefault()
    const name = spName.trim()
    const amount = Number(String(spAmount).replace(/[^0-9.]/g, ''))
    if (!name || !amount) return
    addSponsor({ name, tier: spTier, amount, state: spState, loggedAt: new Date().toISOString() })
    setSpName('')
    setSpAmount('')
    notify(`${name} logged`)
  }

  function onRequest(e: FormEvent) {
    e.preventDefault()
    const title = reqTitle.trim()
    const amount = Number(String(reqAmount).replace(/[^0-9.]/g, ''))
    if (!title || !amount || !me) return
    addApproval({
      title,
      amount,
      requestedById: me.id,
      requestedAt: new Date().toISOString(),
      state: 'pending',
      allocationId: reqAllocation || undefined,
    })
    setReqTitle('')
    setReqAmount('')
    notify('Sent for mentor approval')
  }

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <div className="section-head" style={{ padding: 0 }}>
          <div>
            <h1 className="h1">Budget &amp; sponsors</h1>
            <p className="lede" style={{ marginTop: 4 }}>
              {editable
                ? 'You can set the goal, log sponsors and see every figure.'
                : 'Read-only. Coaches log sponsors and set the goal.'}
            </p>
          </div>
          {can(role, 'season.export') && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => download(`ftc-${season.team.number}-budget.csv`, budgetCsv(season), 'text/csv;charset=utf-8')}
            >
              Export CSV
            </Button>
          )}
        </div>
      </div>

      <div className="cols cols-2">
        <div>
          {/* ── meter ────────────────────────────────────── */}
          <div className="section">
            <div className="card-hero">
              <div className="label">Raised of goal</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 8, flexWrap: 'wrap' }}>
                <span className="num" style={{ font: '600 32px/1 var(--font-mono)', color: 'var(--signal)' }}>
                  {money(totals.raised)}
                </span>
                <span className="num" style={{ font: '500 15px var(--font-mono)', color: 'var(--ink-4)' }}>
                  / {money(totals.goal)}
                </span>
              </div>
              <div style={{ marginTop: 13 }}>
                <Meter
                  label={`${money(totals.received)} received, ${money(totals.pledged)} pledged`}
                  segments={[
                    { value: totals.received, of: totals.goal },
                    { value: totals.pledged, of: totals.goal, tone: 'dim' },
                  ]}
                />
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                <span className="meta">Received {money(totals.received)}</span>
                <span className="meta">Pledged {money(totals.pledged)}</span>
                <span className="meta">Gap {money(totals.gap)}</span>
              </div>
            </div>
          </div>

          {editable && (
            <div className="section">
              <div className="card-quiet card-pad">
                <div className="label" style={{ marginBottom: 11 }}>
                  Season goal
                </div>
                <Field
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  onBlur={() => setGoal(Number(goalDraft.replace(/[^0-9]/g, '')) || 0)}
                  inputMode="numeric"
                  mono
                  big
                  hint="Mentors set the goal. Students see progress against it."
                />
              </div>
            </div>
          )}

          {/* ── allocation ───────────────────────────────── */}
          <div className="section">
            <SectionLabel aside={<span className="meta">{money(totals.spent)} committed</span>}>
              Allocation
            </SectionLabel>
            <div className="card card-pad">
              {season.allocations.map((a) => {
                const over = a.spent / a.cap > 0.9
                return (
                  <div key={a.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
                      <span style={{ font: '500 12px var(--font-sans)', color: '#d6dcde' }}>{a.name}</span>
                      <span className="num" style={{ font: '500 11.5px var(--font-mono)', color: over ? 'var(--pressure)' : 'var(--ink-3)' }}>
                        {money(a.spent)} / {money(a.cap)}
                      </span>
                    </div>
                    <Meter
                      small
                      label={`${a.name}, ${pct(a.spent, a.cap)} percent of cap`}
                      segments={[{ value: a.spent, of: a.cap, tone: over ? 'pressure' : 'signal' }]}
                    />
                    {editable && (
                      <input
                        className="field"
                        style={{ height: 32, marginTop: 6, font: '500 11.5px var(--font-mono)' }}
                        defaultValue={String(a.cap)}
                        aria-label={`${a.name} cap`}
                        inputMode="numeric"
                        onBlur={(e) => updateAllocation(a.id, { cap: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div>
          {/* ── approvals ────────────────────────────────── */}
          <div className="section">
            <div className="label" style={{ marginBottom: 9 }}>
              Purchase requests
            </div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {season.approvals.length === 0 && (
                <div style={{ padding: 15 }}>
                  <span className="meta">Nothing requested yet.</span>
                </div>
              )}
              {season.approvals.map((a) => {
                const requester = season.members.find((m) => m.id === a.requestedById)
                return (
                  <div key={a.id} style={{ padding: '13px 15px', borderBottom: '1px solid var(--line-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{a.title}</div>
                        <div className="meta" style={{ marginTop: 2 }}>
                          {requester?.name ?? 'someone'} ·{' '}
                          <span
                            style={{
                              color:
                                a.state === 'approved'
                                  ? 'var(--signal)'
                                  : a.state === 'pending'
                                    ? 'var(--pressure)'
                                    : 'var(--ink-4)',
                            }}
                          >
                            {a.state}
                          </span>
                        </div>
                      </div>
                      {can(role, 'approvals.viewAmounts') ? (
                        <span className="num" style={{ font: '600 15px var(--font-mono)', color: 'var(--ink)' }}>
                          {money(a.amount, { cents: true })}
                        </span>
                      ) : (
                        <LockedValue />
                      )}
                    </div>
                    {a.state === 'pending' && can(role, 'approvals.decide') && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                        <Button variant="primary" size="sm" block onClick={() => me && decideApproval(a.id, 'approved', me.id)}>
                          Approve
                        </Button>
                        <Button size="sm" block onClick={() => me && decideApproval(a.id, 'held', me.id)}>
                          Hold
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {can(role, 'approvals.request') && !can(role, 'approvals.decide') && (
              <form onSubmit={onRequest} className="card-quiet card-pad" style={{ marginTop: 12 }}>
                <div className="label" style={{ marginBottom: 11 }}>
                  Request a purchase
                </div>
                <Field
                  value={reqTitle}
                  onChange={(e) => setReqTitle(e.target.value)}
                  placeholder="What and why"
                  style={{ marginBottom: 9 }}
                />
                <div style={{ display: 'flex', gap: 9, marginBottom: 11 }}>
                  <Field
                    value={reqAmount}
                    onChange={(e) => setReqAmount(e.target.value)}
                    placeholder="412.80"
                    inputMode="decimal"
                    mono
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <select
                    className="field"
                    style={{ width: 150, flex: 'none' }}
                    value={reqAllocation}
                    onChange={(e) => setReqAllocation(e.target.value)}
                    aria-label="Allocation"
                  >
                    {season.allocations.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="primary" block disabled={!reqTitle.trim() || !reqAmount.trim()}>
                  Send to a mentor
                </Button>
              </form>
            )}
          </div>

          {/* ── sponsors ─────────────────────────────────── */}
          <div className="section">
            <SectionLabel
              aside={
                <span className="num" style={{ font: '500 10.5px var(--font-mono)', color: 'var(--ink-3)' }}>
                  {money(totals.raised)}
                </span>
              }
            >
              Sponsors · {season.sponsors.length}
            </SectionLabel>

            {season.sponsors.map((s) => (
              <div key={s.id} className="row" style={{ padding: '12px 0' }}>
                <Avatar name={s.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{s.name}</div>
                  <div
                    style={{
                      font: '500 9.5px/1.6 var(--font-mono)',
                      color: 'var(--ink-4)',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {s.tier}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none', whiteSpace: 'nowrap' }}>
                  <div className="num" style={{ font: '600 14px/1.2 var(--font-mono)', color: 'var(--ink-body)' }}>
                    {money(s.amount)}
                  </div>
                  <div
                    style={{
                      font: '500 9px var(--font-mono)',
                      letterSpacing: '0.12em',
                      marginTop: 2,
                      color: s.state === 'Received' ? 'var(--signal)' : 'var(--pressure)',
                    }}
                  >
                    {s.state.toUpperCase()}
                  </div>
                </div>
                {editable && (
                  <IconButton label={`Remove ${s.name}`} small onClick={() => removeSponsor(s.id)}>
                    ×
                  </IconButton>
                )}
              </div>
            ))}

            {editable && (
              <form onSubmit={onAddSponsor} className="card-quiet card-pad" style={{ marginTop: 16 }}>
                <div className="label" style={{ marginBottom: 11 }}>
                  Add a sponsor
                </div>
                <Field
                  value={spName}
                  onChange={(e) => setSpName(e.target.value)}
                  placeholder="Company or family name"
                  style={{ marginBottom: 9 }}
                />
                <div style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
                  <Field
                    value={spAmount}
                    onChange={(e) => setSpAmount(e.target.value)}
                    placeholder="1500"
                    inputMode="numeric"
                    mono
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <Field
                    value={spTier}
                    onChange={(e) => setSpTier(e.target.value)}
                    placeholder="GOLD · TOOLING"
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </div>
                <div className="wrap" style={{ marginBottom: 11 }}>
                  {(['Pledged', 'Received'] as SponsorState[]).map((s) => (
                    <Chip key={s} active={spState === s} onClick={() => setSpState(s)}>
                      {s}
                    </Chip>
                  ))}
                </div>
                <Button type="submit" variant="primary" block disabled={!spName.trim() || !spAmount.trim()}>
                  Add sponsor
                </Button>
                <p className="field-note">
                  Tiers are free text on purpose — write what the sponsor agreed to, not what the app
                  decided.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
