import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, EmptyState, Spinner } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { ScoutingSheet } from '@/components/ScoutingSheet'
import { ago, clock } from '@/lib/format'
import { nextCompetition } from '@/domain/season'
import { matchClock } from '@/domain/matchClock'
import { useNow } from '@/lib/useNow'
import { today as todayIso } from '@/lib/date'
import type { Match } from '@/domain/types'

/**
 * 09 · Live event
 *
 * Rank, record, the queue, and the three other robots on the field with our own
 * pit notes beside their stats.
 *
 * Alliance colour appears only here and on the countdown — as a 3px edge on the
 * queue row and a chip on the scouting card. Rank movement is a small lime delta
 * beside the number; the number itself never changes colour.
 */
export function LiveEventScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const allow = useCan()
  const loadEvent = useStore((s) => s.loadEvent)
  const busy = useStore((s) => s.scoutBusy)
  const notify = useStore((s) => s.notify)

  const [editing, setEditing] = useState<{ teamNumber: string; teamName: string } | null>(null)

  const comp = season.competition
  const us = season.team.number
  const alliance = season.settings.alliance

  /**
   * If no event is loaded, pull the one the team's own schedule points at. The
   * screen should have live data without anybody typing an event code.
   */
  const suggested = useMemo(() => nextCompetition(season, todayIso())?.eventCode, [season])

  const now = useNow(1000)
  const mc = useMemo(() => matchClock(season, now), [season, now])

  useEffect(() => {
    if (comp.source === 'none' && suggested && !busy) void loadEvent(suggested)
  }, [comp.source, suggested, busy, loadEvent])

  const ourRanking = comp.rankings.find((r) => r.teamNumber === us)
  const ourMatches = useMemo(
    () => comp.matches.filter((m) => m.red.includes(us) || m.blue.includes(us)),
    [comp.matches, us],
  )
  const upcoming = ourMatches.filter((m) => !m.played)
  const nextMatch = upcoming[0]

  // Prefer the event's official record; fall back to counting played matches
  // only when the team has no ranking row yet (schedule out, no matches played).
  const played = ourMatches.filter((m) => m.played)
  const wins = ourRanking?.wins ?? played.filter((m) => won(m, us)).length
  const losses = ourRanking?.losses ?? played.length - played.filter((m) => won(m, us)).length
  const ties = ourRanking?.ties ?? 0

  /** The other three robots on the field for our next match. */
  const scoutTargets = useMemo(() => {
    if (!nextMatch) return []
    const weAreRed = nextMatch.red.includes(us)
    const partners = (weAreRed ? nextMatch.red : nextMatch.blue).filter((t) => t !== us)
    const opponents = weAreRed ? nextMatch.blue : nextMatch.red
    return [
      ...partners.map((t) => ({ teamNumber: t, partner: true })),
      ...opponents.map((t) => ({ teamNumber: t, partner: false })),
    ]
  }, [nextMatch, us])

  if (comp.source === 'none') {
    return (
      <div className="screen">
        <div className="section" style={{ paddingTop: 24 }}>
          {busy ? (
            <div className="card card-pad" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Spinner />
              <span className="meta">Pulling the event from FTCScout…</span>
            </div>
          ) : (
            <EmptyState
              title="No event loaded"
              body={
                suggested
                  ? `Your schedule points at ${suggested}. Load it to get rankings, the match schedule and results.`
                  : 'Pick an event in Settings to get rankings, the match schedule and results from FTCScout.'
              }
              action={
                suggested
                  ? {
                      label: `Load ${suggested}`,
                      onClick: async () => {
                        const r = await loadEvent(suggested)
                        if (!r.ok) notify(r.message, 'warn')
                      },
                    }
                  : { label: 'Open settings', onClick: () => navigate('/settings') }
              }
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div
        className="section"
        style={{ paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              className={`dot ${comp.ongoing ? 'dot-live' : ''}`}
              style={comp.ongoing ? { animation: 'blink 1.6s steps(1) infinite' } : undefined}
            />
            <span className="label" style={{ color: comp.ongoing ? 'var(--signal)' : 'var(--ink-4)' }}>
              {comp.ongoing ? 'LIVE' : comp.finished ? 'FINAL' : 'UPCOMING'} · {comp.name}
            </span>
          </div>
          <h1 className="h1" style={{ margin: '7px 0 0', fontSize: 22 }}>
            {[comp.venue, comp.city].filter(Boolean).join(' · ') || 'Qualification round'}
          </h1>
          <div className="meta" style={{ marginTop: 4 }}>
            FTCScout · {comp.code} ·{' '}
            {comp.stale ? `cached ${ago(comp.fetchedAt)}` : `updated ${ago(comp.fetchedAt)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              const r = await loadEvent(comp.code)
              notify(r.message, r.ok ? 'ok' : 'warn')
            }}
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate('/comp')}>
            Comp Mode
          </Button>
        </div>
      </div>

      <div className="cols cols-2">
        <div>
          <div className="section">
            <div className="grid-3">
              <div className="card card-pad" style={{ padding: 13, borderRadius: 18 }}>
                <div className="label" style={{ fontSize: 9, letterSpacing: '0.14em' }}>
                  Rank
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 6 }}>
                  <span className="num" style={{ font: '600 27px/1 var(--font-mono)', color: 'var(--ink)' }}>
                    {ourRanking?.rank ?? '—'}
                  </span>
                  {/* No rank delta: FTCScout gives a standing, not a history, and
                      a movement arrow we cannot source would be decoration. */}
                  {ourRanking && (
                    <span className="num" style={{ font: '500 11px var(--font-mono)', color: 'var(--ink-4)' }}>
                      /{comp.rankings.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="card card-pad" style={{ padding: 13, borderRadius: 18 }}>
                <div className="label" style={{ fontSize: 9, letterSpacing: '0.14em' }}>
                  W-L-T
                </div>
                <div className="num" style={{ font: '600 20px/1.35 var(--font-mono)', color: 'var(--ink)', marginTop: 6 }}>
                  {wins}-{losses}-{ties}
                </div>
              </div>
              <div className="card card-pad" style={{ padding: 13, borderRadius: 18 }}>
                <div className="label" style={{ fontSize: 9, letterSpacing: '0.14em' }}>
                  OPR
                </div>
                <div className="num" style={{ font: '600 20px/1.35 var(--font-mono)', color: 'var(--ink)', marginTop: 6 }}>
                  {ourRanking?.opr.toFixed(1) ?? '—'}
                </div>
              </div>
            </div>
          </div>

          {/* ── match queue ─────────────────────────────── */}
          <div className="section">
            <div className="label" style={{ marginBottom: 10 }}>
              Match queue
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {ourMatches.slice(0, 6).map((match) => {
                const weAreRed = match.red.includes(us)
                const isNext = match.id === nextMatch?.id
                const partners = (weAreRed ? match.red : match.blue).filter((t) => t !== us)
                const opponents = weAreRed ? match.blue : match.red
                return (
                  <div
                    key={match.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      padding: '13px 14px',
                      borderRadius: 16,
                      background: isNext ? '#1a1f22' : 'var(--srf-field)',
                    }}
                  >
                    {/* Alliance colour as a 3px edge — never a fill. */}
                    <span
                      style={{
                        width: 3,
                        height: 40,
                        borderRadius: 2,
                        flex: 'none',
                        background: match.played
                          ? '#2a3134'
                          : isNext
                            ? weAreRed
                              ? 'var(--alliance-red)'
                              : 'var(--alliance-blue)'
                            : 'var(--line-3)',
                      }}
                    />
                    <div style={{ width: 52, flex: 'none' }}>
                      <div className="num" style={{ font: '600 13.5px/1.15 var(--font-mono)', color: 'var(--ink-body)' }}>
                        {match.label}
                      </div>
                      <div
                        style={{
                          font: '500 9px/1.6 var(--font-mono)',
                          color: 'var(--ink-4)',
                          letterSpacing: '0.1em',
                        }}
                      >
                        FIELD {match.field}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="num" style={{ font: '500 11.5px/1.4 var(--font-mono)', color: 'var(--ink-2)' }}>
                        with {partners.join(' · ') || '—'}
                      </div>
                      <div className="num" style={{ font: '400 10.5px/1.4 var(--font-mono)', color: '#7c8589' }}>
                        vs {opponents.join(' · ')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none' }}>
                      <div
                        className="num"
                        style={{
                          font: '600 13px var(--font-mono)',
                          color: isNext ? 'var(--signal)' : 'var(--ink-2)',
                        }}
                      >
                        {/* Our score first — "L 367–364" reads as a win otherwise. */}
                        {match.played
                          ? scoreLine(match, us)
                          : mc && mc.match.id === match.id
                            ? mc.overdue
                              ? 'NOW'
                              : `T−${clock(mc.secondsUntil)}`
                            : match.time}
                      </div>
                      <div
                        style={{
                          font: '500 9px/1.6 var(--font-mono)',
                          color: 'var(--ink-4)',
                          letterSpacing: '0.1em',
                        }}
                      >
                        {match.played ? 'FINAL' : isNext ? 'ON DECK' : 'QUEUED'}
                      </div>
                    </div>
                  </div>
                )
              })}
              {ourMatches.length === 0 && (
                <div className="card-dashed" style={{ padding: 18, textAlign: 'center' }}>
                  <span className="meta">No matches for {us} in this schedule.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── scouting ──────────────────────────────────── */}
        <div className="section">
          <div className="label" style={{ marginBottom: 10 }}>
            {nextMatch?.label ?? 'Next match'} · scouting
          </div>
          <div className="stack" style={{ gap: 9 }}>
            {scoutTargets.map((target) => {
              const ranking = comp.rankings.find((r) => r.teamNumber === target.teamNumber)
              const note = season.scouting.find((s) => s.teamNumber === target.teamNumber)
              const chipColor = target.partner
                ? alliance === 'red'
                  ? 'var(--alliance-red)'
                  : 'var(--alliance-blue)'
                : '#2a3134'
              return (
                <div
                  key={target.teamNumber}
                  style={{
                    borderRadius: 18,
                    background: 'var(--srf-field)',
                    padding: '14px 15px',
                    borderLeft: `3px solid ${
                      target.partner
                        ? alliance === 'red'
                          ? 'var(--alliance-red)'
                          : 'var(--alliance-blue)'
                        : alliance === 'red'
                          ? 'var(--alliance-blue)'
                          : 'var(--alliance-red)'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                    <span
                      style={{
                        font: '500 8.5px var(--font-mono)',
                        letterSpacing: '0.14em',
                        padding: '3px 6px',
                        borderRadius: 4,
                        color: 'var(--ink)',
                        background: chipColor,
                      }}
                    >
                      {target.partner ? 'PARTNER' : 'OPPONENT'}
                    </span>
                    <span className="num" style={{ font: '600 14px var(--font-mono)', color: 'var(--ink)' }}>
                      {target.teamNumber}
                    </span>
                    <span style={{ font: '500 12px var(--font-sans)', color: '#9ba5a9', flex: 1, minWidth: 0 }}>
                      {ranking?.teamName ?? note?.teamName ?? ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginBottom: 9 }}>
                    <Micro label="OPR" value={ranking?.opr.toFixed(1) ?? note?.opr?.toFixed(1) ?? '—'} />
                    <Micro label="AUTO" value={note?.auto?.toFixed(1) ?? '—'} />
                    <Micro label="RANK" value={String(ranking?.rank ?? note?.rank ?? '—')} />
                  </div>

                  <div
                    style={{
                      font: '400 11.5px/1.5 var(--font-sans)',
                      color: 'var(--ink-3)',
                      borderTop: '1px solid var(--line)',
                      paddingTop: 9,
                    }}
                  >
                    {note?.note ? (
                      <>
                        <span style={{ color: 'var(--ink-4)' }}>Ours: </span>
                        {note.note}
                      </>
                    ) : (
                      <span style={{ color: 'var(--ink-4)' }}>No pit note yet.</span>
                    )}
                  </div>

                  {allow('scouting.edit') && (
                    <Button
                      size="sm"
                      variant="quiet"
                      style={{ marginTop: 8, paddingLeft: 0 }}
                      onClick={() =>
                        setEditing({
                          teamNumber: target.teamNumber,
                          teamName: ranking?.teamName ?? note?.teamName ?? '',
                        })
                      }
                    >
                      {note?.note ? 'Edit note' : 'Add a pit note'}
                    </Button>
                  )}
                </div>
              )
            })}

            <Link to="/scout">
              <Button size="sm" variant="quiet" block>
                Scout every team at this event
              </Button>
            </Link>

            {scoutTargets.length === 0 && (
              <div className="card-dashed" style={{ padding: 18, textAlign: 'center' }}>
                <span className="meta">No upcoming match to scout.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <ScoutingSheet
          teamNumber={editing.teamNumber}
          teamName={editing.teamName}
          eventCode={comp.code}
          matchLabel={nextMatch?.label}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function Micro({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{ font: '500 8.5px var(--font-mono)', color: 'var(--ink-4)', letterSpacing: '0.12em' }}
      >
        {label}
      </div>
      <div className="num" style={{ font: '500 13px var(--font-mono)', color: '#d6dcde' }}>
        {value}
      </div>
    </div>
  )
}

function won(match: Match, team: string): boolean {
  if (match.redScore == null || match.blueScore == null) return false
  return match.red.includes(team) ? match.redScore > match.blueScore : match.blueScore > match.redScore
}

/** "W 349–246" — always ours first, so the result and the numbers agree. */
function scoreLine(match: Match, team: string): string {
  if (match.redScore == null || match.blueScore == null) return '—'
  const weAreRed = match.red.includes(team)
  const ourScore = weAreRed ? match.redScore : match.blueScore
  const theirScore = weAreRed ? match.blueScore : match.redScore
  const outcome = ourScore === theirScore ? 'T' : ourScore > theirScore ? 'W' : 'L'
  return `${outcome} ${ourScore}–${theirScore}`
}
