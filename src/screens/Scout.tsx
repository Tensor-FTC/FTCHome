import { useMemo, useState } from 'react'
import { Button, Chip, EmptyState, Field } from '@/components/ui'
import { ScoutingSheet } from '@/components/ScoutingSheet'
import { useStore } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { nextCompetition } from '@/domain/season'
import { today as todayIso } from '@/lib/date'
import type { RankingRow, ScoutingNote } from '@/domain/types'

type Sort = 'rank' | 'rating' | 'shortlist' | 'noted'

const SORTS: { id: Sort; label: string }[] = [
  { id: 'rank', label: 'By rank' },
  { id: 'rating', label: 'By our rating' },
  { id: 'shortlist', label: 'Shortlist' },
  { id: 'noted', label: 'Only scouted' },
]

interface Row {
  teamNumber: string
  teamName: string
  ranking?: RankingRow
  note?: ScoutingNote
}

/**
 * 11 · Scout
 *
 * Scouting for the whole event, not just the next match.
 *
 * The facts on each row — rank, record, OPR — come from FTCScout and are never
 * typed by a student; what a team adds is the judgement no API has. Notes are
 * keyed to the event, so a season of scouting stays separable and the same team
 * can be read differently in November and March.
 *
 * Everything writes through the outbox. Venue wifi is the standard case, not
 * the exception, and a note taken with no signal has to survive the drive home.
 */
export function ScoutScreen() {
  const season = useStore((s) => s.season)
  const loadEvent = useStore((s) => s.loadEvent)
  const busy = useStore((s) => s.scoutBusy)
  const online = useStore((s) => s.online)
  const allow = useCan()

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('rank')
  const [editing, setEditing] = useState<{ teamNumber: string; teamName: string } | null>(null)

  const comp = season.competition
  const eventCode = comp.code || nextCompetition(season, todayIso())?.eventCode || ''
  const suggested = useMemo(() => nextCompetition(season, todayIso())?.eventCode, [season])

  /** Every team at the event, plus any we have a note on that is not in the rankings yet. */
  const rows = useMemo<Row[]>(() => {
    const byNumber = new Map<string, Row>()
    for (const ranking of comp.rankings) {
      byNumber.set(ranking.teamNumber, { teamNumber: ranking.teamNumber, teamName: ranking.teamName, ranking })
    }
    for (const note of season.scouting) {
      if ((note.eventCode ?? '') !== (eventCode ?? '')) continue
      const existing = byNumber.get(note.teamNumber)
      if (existing) existing.note = note
      else byNumber.set(note.teamNumber, { teamNumber: note.teamNumber, teamName: note.teamName, note })
    }
    return [...byNumber.values()]
  }, [comp.rankings, season.scouting, eventCode])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = rows.filter(
      (r) => !q || r.teamNumber.includes(q) || r.teamName.toLowerCase().includes(q),
    )
    if (sort === 'shortlist') out = out.filter((r) => r.note?.wouldPick)
    if (sort === 'noted') out = out.filter((r) => r.note)
    return out.sort((a, b) => {
      if (sort === 'rating' || sort === 'shortlist') {
        const diff = (b.note?.rating ?? 0) - (a.note?.rating ?? 0)
        if (diff) return diff
      }
      return (a.ranking?.rank ?? 9999) - (b.ranking?.rank ?? 9999) || a.teamNumber.localeCompare(b.teamNumber)
    })
  }, [rows, query, sort])

  const noted = rows.filter((r) => r.note).length
  const shortlisted = rows.filter((r) => r.note?.wouldPick).length

  if (comp.source === 'none') {
    return (
      <div className="screen">
        <div className="section" style={{ paddingTop: 10 }}>
          <h1 className="h1">Scout</h1>
          <p className="lede" style={{ marginTop: 4 }}>
            Load a competition and every team at it becomes scoutable.
          </p>
        </div>
        <div className="section">
          <EmptyState
            title="No event loaded"
            body={
              suggested
                ? `Your calendar points at ${suggested}. Pull its rankings and schedule to start scouting.`
                : 'Add a competition to your calendar, or open Live to load an event by code.'
            }
            action={
              suggested && online
                ? { label: busy ? 'Loading…' : `Load ${suggested}`, onClick: () => void loadEvent(suggested) }
                : undefined
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <div className="section-head" style={{ padding: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="h1">Scout</h1>
            <p className="lede" style={{ marginTop: 4 }}>
              {comp.name || comp.code} · {rows.length} teams · {noted} scouted
              {shortlisted ? ` · ${shortlisted} shortlisted` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="section" style={{ paddingTop: 10 }}>
        <Field
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Team number or name…"
          aria-label="Find a team"
          inputMode="search"
          style={{ marginBottom: 10 }}
        />
        <div className="wrap">
          {SORTS.map((s) => (
            <Chip key={s.id} active={sort === s.id} onClick={() => setSort(s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="section">
        {visible.length === 0 ? (
          <div className="card-dashed" style={{ padding: 20, textAlign: 'center' }}>
            <span className="meta">
              {sort === 'shortlist'
                ? 'Nothing shortlisted yet. Mark teams you would pick as you scout them.'
                : 'No team matches that.'}
            </span>
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {visible.map((row) => (
              <ScoutRow
                key={row.teamNumber}
                row={row}
                us={season.team.number}
                editable={allow('scouting.edit')}
                onEdit={() => setEditing({ teamNumber: row.teamNumber, teamName: row.teamName })}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ScoutingSheet
          teamNumber={editing.teamNumber}
          teamName={editing.teamName}
          eventCode={eventCode}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ScoutRow({
  row,
  us,
  editable,
  onEdit,
}: {
  row: Row
  us: string
  editable: boolean
  onEdit: () => void
}) {
  const { ranking, note } = row
  const ours = row.teamNumber === us

  return (
    <div
      className="card"
      style={{
        padding: '12px 14px',
        borderLeft: `3px solid ${ours ? 'var(--signal)' : note?.wouldPick ? 'var(--signal-dim)' : 'transparent'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <span className="num" style={{ font: '600 14px var(--font-mono)', color: 'var(--ink)', flex: 'none' }}>
          {row.teamNumber}
        </span>
        <span
          style={{
            font: '500 12px var(--font-sans)',
            color: '#9ba5a9',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.teamName}
          {ours ? ' · us' : ''}
        </span>
        {note?.rating != null && (
          <span className="num" style={{ font: '600 12px var(--font-mono)', color: 'var(--signal)' }}>
            {note.rating}/5
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        <Micro label="RANK" value={ranking ? String(ranking.rank) : '—'} />
        <Micro label="W-L-T" value={ranking ? `${ranking.wins}-${ranking.losses}-${ranking.ties}` : '—'} />
        <Micro label="OPR" value={ranking?.opr.toFixed(1) ?? note?.opr?.toFixed(1) ?? '—'} />
        <Micro label="AUTO" value={note?.auto?.toFixed(1) ?? '—'} />
      </div>

      {Boolean(note?.tags?.length) && (
        <div className="wrap" style={{ marginTop: 9 }}>
          {note?.tags?.map((tag) => (
            <span key={tag} className="status-pill status-pill-sm is-neutral">
              {tag}
            </span>
          ))}
        </div>
      )}

      {note?.note && (
        <p
          className="pretty"
          style={{
            font: '400 11.5px/1.5 var(--font-sans)',
            color: 'var(--ink-3)',
            borderTop: '1px solid var(--line)',
            marginTop: 9,
            paddingTop: 9,
          }}
        >
          {note.note}
        </p>
      )}

      {editable && (
        <Button size="sm" variant="quiet" style={{ marginTop: 6, paddingLeft: 0 }} onClick={onEdit}>
          {note ? 'Edit note' : 'Add a note'}
        </Button>
      )}
    </div>
  )
}

function Micro({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ font: '500 8.5px var(--font-mono)', letterSpacing: '0.14em', color: 'var(--ink-rail)' }}>
        {label}
      </div>
      <div className="num" style={{ font: '500 12.5px var(--font-mono)', color: 'var(--ink-2)' }}>
        {value}
      </div>
    </div>
  )
}
