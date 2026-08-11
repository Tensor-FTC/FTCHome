import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Chip, EmptyState, Field, Select } from '@/components/ui'
import { StatusPicker } from '@/components/StatusPicker'
import { useStore, type ArchivableKind } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { useArchive } from '@/domain/useArchive'
import { APPROVAL_STATUS, TASK_STATUS } from '@/domain/status'
import { EVENT_TYPE_LABEL } from '@/domain/types'
import { longStamp } from '@/lib/date'
import { bytes, money } from '@/lib/format'

type Bucket = 'events' | 'tasks' | 'media' | 'weekly' | 'approvals' | 'scouting'

const BUCKET_LABEL: Record<Bucket, string> = {
  events: 'Calendar',
  tasks: 'Tasks',
  media: 'Build log',
  weekly: 'Weekly',
  approvals: 'Purchases',
  scouting: 'Scouting',
}

const WINDOWS = [
  { days: 7, label: 'Older than a week' },
  { days: 14, label: 'Older than two weeks' },
  { days: 30, label: 'Older than a month' },
  { days: 90, label: 'Older than three months' },
  { days: 0, label: 'Never archive' },
]

/**
 * 12 · Archive
 *
 * Where the season's history goes. Nothing here was deleted or moved — the
 * working screens show a recent window and this shows everything behind it, so
 * widening the window in Settings brings it all straight back.
 *
 * Kept read-mostly on purpose: statuses can still be corrected, because finding
 * a task you closed by mistake in November is exactly why you came here.
 */
export function ArchiveScreen() {
  const { archived, cutoff, count } = useArchive()
  const season = useStore((s) => s.season)
  const updateTask = useStore((s) => s.updateTask)
  const decideApproval = useStore((s) => s.decideApproval)
  const updateSettings = useStore((s) => s.updateSettings)
  const me = useStore((s) => s.session.memberId)
  const allow = useCan()
  const [bucket, setBucket] = useState<Bucket | 'all'>('all')
  const [query, setQuery] = useState('')
  const policy = season.settings.policy

  const q = query.trim().toLowerCase()
  const match = (...fields: (string | undefined)[]) => !q || fields.some((f) => f?.toLowerCase().includes(q))

  const counts = useMemo(
    () =>
      ({
        events: archived.events.length,
        tasks: archived.tasks.length,
        media: archived.media.length,
        weekly: archived.weekly.length,
        approvals: archived.approvals.length,
        scouting: archived.scouting.length,
      }) as Record<Bucket, number>,
    [archived],
  )

  const show = (b: Bucket) => bucket === 'all' || bucket === b

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <h1 className="h1">Archive</h1>
        <p className="lede" style={{ marginTop: 4 }}>
          Everything finished before {longStamp(cutoff)}. Nothing was deleted — this is the same season,
          just the part the working screens stop showing.
        </p>
      </div>

      {allow('policy.manage') && (
        <div className="section">
          <div className="card-quiet card-pad">
            <Select
              label="Move things to the archive when they are"
              value={String(policy.archiveAfterDays)}
              onChange={(e) =>
                updateSettings({ policy: { ...policy, archiveAfterDays: Number(e.target.value) } })
              }
            >
              {WINDOWS.map((w) => (
                <option key={w.days} value={w.days}>
                  {w.label}
                </option>
              ))}
            </Select>
            <p className="field-note">
              This only changes what the app shows first. Widen it and everything comes back.
            </p>
          </div>
        </div>
      )}

      {count === 0 ? (
        <div className="section">
          <EmptyState
            title="Nothing archived yet"
            body="Once meetings, finished tasks and build photos pass the cutoff they collect here instead of crowding the screens you use every day."
          />
        </div>
      ) : (
        <>
          <div className="section" style={{ paddingTop: 4 }}>
            <Field
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the archive…"
              aria-label="Search the archive"
              style={{ marginBottom: 10 }}
            />
            <div className="wrap">
              <Chip active={bucket === 'all'} onClick={() => setBucket('all')}>
                All · {count}
              </Chip>
              {(Object.keys(BUCKET_LABEL) as Bucket[])
                .filter((b) => counts[b] > 0)
                .map((b) => (
                  <Chip key={b} active={bucket === b} onClick={() => setBucket(b)}>
                    {BUCKET_LABEL[b]} · {counts[b]}
                  </Chip>
                ))}
            </div>
          </div>

          <div className="cols cols-2">
            <div>
              {show('events') && archived.events.length > 0 && (
                <Group label={`Calendar · ${archived.events.length}`}>
                  {archived.events
                    .filter((e) => match(e.title, e.location, e.notes))
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((e) => (
                      <Link key={e.id} to={`/events/${e.id}`} className="row" style={{ color: 'inherit' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '500 12.5px/1.35 var(--font-sans)', color: 'var(--ink-body)' }}>
                            {e.title}
                          </div>
                          <div className="meta-mono">
                            {longStamp(e.date)} · {EVENT_TYPE_LABEL[e.type].toLowerCase()}
                          </div>
                        </div>
                        <Restore kind="event" id={e.id} />
                      </Link>
                    ))}
                </Group>
              )}

              {show('tasks') && archived.tasks.length > 0 && (
                <Group label={`Tasks · ${archived.tasks.length}`}>
                  {archived.tasks
                    .filter((t) => match(t.name, t.subteam, t.notes))
                    .sort((a, b) => (b.doneAt ?? b.due).localeCompare(a.doneAt ?? a.due))
                    .map((t) => (
                      <div key={t.id} className="row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '500 12.5px/1.35 var(--font-sans)', color: 'var(--ink-2)' }}>
                            {t.name}
                          </div>
                          <div className="meta-mono">
                            {t.doneAt ? `done ${longStamp(t.doneAt.slice(0, 10))}` : longStamp(t.due)}
                            {t.subteam ? ` · ${t.subteam}` : ''}
                          </div>
                        </div>
                        <StatusPicker
                          size="sm"
                          value={t.status}
                          options={TASK_STATUS}
                          editable={allow('tasks.create')}
                          label={`Status of ${t.name}`}
                          onChange={(status) => updateTask(t.id, { status })}
                        />
                        <Restore kind="task" id={t.id} />
                      </div>
                    ))}
                </Group>
              )}

              {show('approvals') && archived.approvals.length > 0 && (
                <Group label={`Purchases · ${archived.approvals.length}`}>
                  {archived.approvals
                    .filter((a) => match(a.title, a.note))
                    .sort((a, b) => (b.decidedAt ?? b.requestedAt).localeCompare(a.decidedAt ?? a.requestedAt))
                    .map((a) => (
                      <div key={a.id} className="row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '500 12.5px/1.35 var(--font-sans)', color: 'var(--ink-2)' }}>
                            {a.title}
                          </div>
                          <div className="meta-mono">{longStamp(a.requestedAt.slice(0, 10))}</div>
                        </div>
                        {allow('approvals.viewAmounts') && (
                          <span className="num" style={{ font: '500 12px var(--font-mono)', color: 'var(--ink-3)' }}>
                            {money(a.amount)}
                          </span>
                        )}
                        <StatusPicker
                          size="sm"
                          value={a.state}
                          options={APPROVAL_STATUS}
                          editable={allow('approvals.decide')}
                          label={`Status of ${a.title}`}
                          onChange={(state) => me && decideApproval(a.id, state, me)}
                        />
                        <Restore kind="approval" id={a.id} />
                      </div>
                    ))}
                </Group>
              )}
            </div>

            <div>
              {show('media') && archived.media.length > 0 && (
                <Group label={`Build log · ${archived.media.length}`}>
                  {archived.media
                    .filter((m) => match(m.name, m.caption, m.author))
                    .sort((a, b) => b.day.localeCompare(a.day))
                    .map((m) => (
                      <div key={m.id} className="row">
                        <span className="label" style={{ width: 46, flex: 'none' }}>
                          {m.kind}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '500 12.5px/1.35 var(--font-sans)', color: 'var(--ink-2)' }}>
                            {m.name || m.caption || 'Untitled'}
                          </div>
                          <div className="meta-mono">
                            {longStamp(m.day)} · {bytes(m.size)}
                          </div>
                        </div>
                        <Restore kind="media" id={m.id} />
                      </div>
                    ))}
                </Group>
              )}

              {show('weekly') && archived.weekly.length > 0 && (
                <Group label={`Weekly · ${archived.weekly.length}`}>
                  {archived.weekly
                    .filter((w) => match(w.summary, w.author))
                    .sort((a, b) => b.week - a.week)
                    .map((w) => (
                      <Link key={w.id} to={`/weekly/${w.id}`} className="row" style={{ color: 'inherit' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '500 12.5px/1.35 var(--font-sans)', color: 'var(--ink-2)' }}>
                            Week {w.week}
                          </div>
                          <div className="meta-mono">
                            {longStamp(w.from)} – {longStamp(w.to)}
                          </div>
                        </div>
                      </Link>
                    ))}
                </Group>
              )}

              {show('scouting') && archived.scouting.length > 0 && (
                <Group label={`Scouting · ${archived.scouting.length}`}>
                  {archived.scouting
                    .filter((n) => match(n.teamNumber, n.teamName, n.note))
                    .map((n) => (
                      <div key={n.id} className="row">
                        <span className="num" style={{ width: 48, flex: 'none', font: '600 12px var(--font-mono)' }}>
                          {n.teamNumber}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: '500 12.5px/1.35 var(--font-sans)', color: 'var(--ink-2)' }}>
                            {n.teamName}
                          </div>
                          <div className="meta">{n.note}</div>
                        </div>
                        {n.eventCode && <span className="label">{n.eventCode}</span>}
                      </div>
                    ))}
                </Group>
              )}
            </div>
          </div>
        </>
      )}

      <div className="section">
        <Link to="/settings">
          <Button variant="quiet" size="sm">
            Export or back up the whole season
          </Button>
        </Link>
      </div>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="label" style={{ marginBottom: 9 }}>
        {label}
      </div>
      <div className="card" style={{ overflow: 'hidden', padding: '0 14px' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * Bring one record back out.
 *
 * Sets `keepCurrent` rather than clearing a flag, because most things in here
 * were never filed by hand — they fell past the date cutoff, and "un-archive"
 * has to mean "hold this out from now on" or the next render puts it straight
 * back.
 */
function Restore({ kind, id }: { kind: ArchivableKind; id: string }) {
  const setArchived = useStore((s) => s.setArchived)
  const notify = useStore((s) => s.notify)
  return (
    <Button
      size="sm"
      variant="quiet"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setArchived(kind, id, false)
        notify('Brought back')
      }}
    >
      Bring back
    </Button>
  )
}
