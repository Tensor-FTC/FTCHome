import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Field, Sheet, TextArea } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { can } from '@/domain/permissions'
import { clock } from '@/lib/format'
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
  const role = useStore((s) => s.session.role)
  const upsertScouting = useStore((s) => s.upsertScouting)

  const [editing, setEditing] = useState<{ teamNumber: string; teamName: string } | null>(null)

  const comp = season.competition
  const us = season.team.number
  const alliance = season.settings.alliance

  const ourRanking = comp.rankings.find((r) => r.teamNumber === us)
  const ourMatches = useMemo(
    () => comp.matches.filter((m) => m.red.includes(us) || m.blue.includes(us)),
    [comp.matches, us],
  )
  const upcoming = ourMatches.filter((m) => !m.played)
  const nextMatch = upcoming[0]

  const played = ourMatches.filter((m) => m.played)
  const wins = played.filter((m) => won(m, us)).length
  const losses = played.length - wins

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

  return (
    <div className="screen">
      <div
        className="section"
        style={{ paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="dot dot-live" style={{ animation: 'blink 1.6s steps(1) infinite' }} />
            <span
              className="label"
              style={{ color: 'var(--signal)' }}
            >
              LIVE · {comp.name}
            </span>
          </div>
          <h1 className="h1" style={{ margin: '7px 0 0', fontSize: 22 }}>
            Qualification round
          </h1>
          {comp.source === 'sample' && (
            <div className="meta" style={{ marginTop: 4 }}>
              Sample event data. Add a FIRST API key in Settings for live results.
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate('/comp')}>
          Comp Mode
        </Button>
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
                  {ourRanking && ourRanking.rank <= 8 && (
                    <span className="num" style={{ font: '500 11px var(--font-mono)', color: 'var(--signal)' }}>
                      ▲
                    </span>
                  )}
                </div>
              </div>
              <div className="card card-pad" style={{ padding: 13, borderRadius: 18 }}>
                <div className="label" style={{ fontSize: 9, letterSpacing: '0.14em' }}>
                  W-L-T
                </div>
                <div className="num" style={{ font: '600 20px/1.35 var(--font-mono)', color: 'var(--ink)', marginTop: 6 }}>
                  {wins}-{losses}-0
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
                        {match.played
                          ? `${won(match, us) ? 'W' : 'L'} ${match.redScore}–${match.blueScore}`
                          : isNext
                            ? `T−${clock(season.settings.matchSeconds)}`
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

                  {can(role, 'scouting.edit') && (
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
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            upsertScouting({ teamNumber: editing.teamNumber, teamName: editing.teamName, ...patch })
            setEditing(null)
          }}
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

function ScoutingSheet({
  teamNumber,
  teamName,
  onClose,
  onSave,
}: {
  teamNumber: string
  teamName: string
  onClose: () => void
  onSave: (patch: { note: string; auto?: number }) => void
}) {
  const existing = useStore((s) => s.season.scouting.find((x) => x.teamNumber === teamNumber))
  const [note, setNote] = useState(existing?.note ?? '')
  const [auto, setAuto] = useState(existing?.auto != null ? String(existing.auto) : '')

  return (
    <Sheet
      title={`${teamNumber} · pit note`}
      subtitle={teamName}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          block
          onClick={() => onSave({ note: note.trim(), auto: auto.trim() ? Number(auto) : undefined })}
        >
          Save note
        </Button>
      }
    >
      <div className="stack" style={{ gap: 11 }}>
        <TextArea
          label="What we saw"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Cycle speed, endgame, anything that changes how we play them."
          hint="Pit notes sit under the stats on the same card, so scouting data and our own observation are read together."
        />
        <Field
          label="Auto average"
          value={auto}
          onChange={(e) => setAuto(e.target.value)}
          inputMode="decimal"
          placeholder="22.0"
          mono
        />
      </div>
    </Sheet>
  )
}

function won(match: Match, team: string): boolean {
  if (match.redScore == null || match.blueScore == null) return false
  return match.red.includes(team) ? match.redScore > match.blueScore : match.blueScore > match.redScore
}
