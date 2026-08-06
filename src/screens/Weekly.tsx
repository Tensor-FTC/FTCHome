import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Chip, EmptyState, IconButton, LockedValue, Meter, SectionLabel, TextArea } from '@/components/ui'
import { MediaThumb } from '@/components/MediaThumb'
import { isDone } from '@/domain/tasks'
import { useStore, budgetTotals, currentMember } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { useArchive } from '@/domain/useArchive'
import { SUBTEAM_LABEL, type Subteam } from '@/domain/types'
import { range } from '@/lib/date'
import { download, weeklyMarkdown } from '@/lib/exporters'
import { money, pct } from '@/lib/format'

/**
 * 07 · Weekly dashboard
 *
 * Auto-generated blocks interleaved with what students post. Published once a
 * week, readable by parents and sponsors.
 *
 * Two rules hold the layout together: text never sits on user photos — captions
 * live in a solid plate below the image, which is structural rather than
 * stylistic, so an unpredictable upload cannot break contrast — and auto blocks
 * look different from human blocks on purpose.
 */
export function WeeklyScreen() {
  const { weekId } = useParams()
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const allow = useCan()
  const { current } = useArchive()
  const me = useStore(currentMember)
  const upsertWeekly = useStore((s) => s.upsertWeekly)
  const publishWeekly = useStore((s) => s.publishWeekly)
  const addShoutout = useStore((s) => s.addShoutout)
  const removeShoutout = useStore((s) => s.removeShoutout)

  const reports = useMemo(() => [...current.weekly].sort((a, b) => b.week - a.week), [current.weekly])
  const report = reports.find((r) => r.id === weekId) ?? reports[0]

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [shoutWho, setShoutWho] = useState('')
  const [shoutText, setShoutText] = useState('')

  const budget = budgetTotals(season)
  const canEdit = allow('weekly.edit')

  // Attendance and subteam progress are derived, never typed in — that is what
  // makes them "auto" blocks the eye can trust.
  const subteams = useMemo(() => {
    const groups = new Map<Subteam, { done: number; total: number }>()
    for (const task of season.tasks) {
      if (!task.subteam) continue
      const entry = groups.get(task.subteam) ?? { done: 0, total: 0 }
      entry.total++
      if (isDone(task)) entry.done++
      groups.set(task.subteam, entry)
    }
    return [...groups.entries()].map(([id, v]) => ({ id, ...v }))
  }, [season.tasks])

  const attendance = useMemo(() => {
    const meets = season.events.filter((e) => e.type === 'meet')
    if (!meets.length || !season.members.length) return 0
    const going = season.rsvps.filter((r) => meets.some((m) => m.id === r.eventId) && r.status === 'going').length
    return pct(going, meets.length * season.members.length)
  }, [season.events, season.rsvps, season.members.length])

  // A week's dashboard shows that week's media. Anything explicitly pinned to
  // the report wins, so a captain can feature an older shot deliberately.
  const weekMedia = useMemo(() => {
    const pinned = report?.mediaIds.map((id) => season.media.find((m) => m.id === id)).filter(Boolean) ?? []
    const inRange = report
      ? season.media.filter((m) => m.day >= report.from && m.day <= report.to && !report.mediaIds.includes(m.id))
      : []
    return [...pinned, ...inRange].filter((m): m is NonNullable<typeof m> => Boolean(m)).slice(0, 6)
  }, [season.media, report])

  if (!report) {
    return (
      <div className="screen">
        <div className="section" style={{ paddingTop: 24 }}>
          <EmptyState
            title="No week yet"
            body="Your first dashboard builds itself once there's a meeting on the calendar."
            action={allow('calendar.edit') ? { label: 'Add first meeting', onClick: () => navigate('/calendar/edit') } : undefined}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <div className="label">
          {report.published
            ? `Published · ${report.reads} reads`
            : 'Draft · not visible to parents or sponsors'}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="h1-lg" style={{ margin: '6px 0 4px' }}>
              Week {report.week}
            </h1>
            <div className="lede">
              {range(report.from, report.to)} · {season.events.filter((e) => e.date >= report.from && e.date <= report.to).length} sessions
            </div>
          </div>
          <div className="wrap">
            {reports.map((r) => (
              <Chip key={r.id} active={r.id === report.id} onClick={() => navigate(`/weekly/${r.id}`)}>
                W{r.week}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <div className="weekly-grid">
        {/* ── hero media · spans both columns ─────────────── */}
        <div className="section weekly-span">
          {weekMedia[0] ? (
            <div className="card" style={{ overflow: 'hidden' }}>
              <MediaThumb item={weekMedia[0]} height={186} />
              {/* Caption plate: solid, below the media, at every width. */}
              <div style={{ padding: '12px 14px', background: 'var(--srf-0)', borderTop: '1px solid #22282b' }}>
                <div className="body" style={{ fontSize: 12 }}>
                  {weekMedia[0].caption || weekMedia[0].name}
                </div>
                <div className="meta-mono" style={{ marginTop: 3 }}>
                  — {weekMedia[0].author}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="No photo this week"
              body="A build photo is the one thing parents and sponsors actually open."
              action={allow('media.upload') ? { label: 'Add to the build log', onClick: () => navigate('/build') } : undefined}
            />
          )}
        </div>

        {/* ── auto block: subteam progress ────────────────── */}
        <div className="section">
          <div className="label" style={{ marginBottom: 10 }}>
            Subteam progress · auto
          </div>
          <div className="card card-pad">
            {subteams.length === 0 ? (
              <span className="meta">No tasks tagged to a subteam yet.</span>
            ) : (
              subteams.map((t) => (
                <div key={t.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ font: '500 12px var(--font-sans)', color: '#d6dcde' }}>{SUBTEAM_LABEL[t.id]}</span>
                    <span className="num" style={{ font: '500 11.5px var(--font-mono)', color: 'var(--ink-3)' }}>
                      {t.done}/{t.total}
                    </span>
                  </div>
                  <Meter
                    small
                    label={`${SUBTEAM_LABEL[t.id]} ${t.done} of ${t.total}`}
                    segments={[{ value: t.done, of: t.total, tone: t.done / t.total < 0.6 ? 'pressure' : 'signal' }]}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── auto block: numbers ─────────────────────────── */}
        <div className="section">
          <div className="label" style={{ marginBottom: 10 }}>
            This week · auto
          </div>
          <div className="grid-2">
            <div className="card card-pad" style={{ padding: 14 }}>
              <div className="label" style={{ marginBottom: 8 }}>
                Attendance
              </div>
              <div className="num" style={{ font: '600 24px/1 var(--font-mono)', color: 'var(--ink)' }}>
                {attendance}%
              </div>
              <div className="meta" style={{ marginTop: 4 }}>
                across {season.events.filter((e) => e.type === 'meet').length} build sessions
              </div>
            </div>
            <div className="card card-pad" style={{ padding: 14 }}>
              <div className="label" style={{ marginBottom: 8 }}>
                Budget left
              </div>
              {/* The parent-gated block: masked, not removed. */}
              {allow('budget.viewAmounts') ? (
                <>
                  <div className="num" style={{ font: '600 24px/1 var(--font-mono)', color: 'var(--ink)' }}>
                    {money(budget.left)}
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    of {money(budget.raised)} raised
                  </div>
                </>
              ) : (
                <>
                  <LockedValue shape="$•,•••" title="Mentors and students only" />
                  <div className="meta" style={{ marginTop: 8 }}>
                    Mentors only
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── media grid ──────────────────────────────────── */}
        {weekMedia.length > 1 && (
          <div className="section weekly-span">
            <div className="label" style={{ marginBottom: 10 }}>
              Media · {weekMedia.length} added
            </div>
            <div className="grid-2">
              {weekMedia.slice(1).map((item) => (
                <div key={item.id} className="card" style={{ overflow: 'hidden', borderRadius: 12 }}>
                  <MediaThumb item={item} height={96} />
                  <div style={{ padding: '9px 11px', font: '400 11px/1.4 var(--font-sans)', color: '#b7c0c3' }}>
                    {item.caption || item.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── human block: shoutouts ──────────────────────── */}
        <div className="section">
          <div className="card-quiet card-pad">
            <SectionLabel>Shoutouts</SectionLabel>
            <div className="stack" style={{ gap: 9 }}>
              {report.shoutouts.length === 0 && <span className="meta">Nobody called out yet this week.</span>}
              {report.shoutouts.map((s) => (
                <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className="body" style={{ flex: 1, fontSize: 12.5 }}>
                    <span style={{ color: 'var(--signal)', fontWeight: 600 }}>{s.who}</span> {s.text}
                  </span>
                  {canEdit && (
                    <IconButton label={`Remove shoutout for ${s.who}`} small onClick={() => removeShoutout(report.id, s.id)}>
                      ×
                    </IconButton>
                  )}
                </div>
              ))}
            </div>

            {canEdit && (
              <form
                style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!shoutWho.trim() || !shoutText.trim()) return
                  addShoutout(report.id, shoutWho.trim(), shoutText.trim())
                  setShoutWho('')
                  setShoutText('')
                }}
              >
                <input
                  className="field"
                  style={{ width: 120, flex: 'none', height: 38 }}
                  value={shoutWho}
                  onChange={(e) => setShoutWho(e.target.value)}
                  placeholder="Who"
                  aria-label="Shoutout name"
                />
                <input
                  className="field"
                  style={{ flex: 1, minWidth: 140, height: 38 }}
                  value={shoutText}
                  onChange={(e) => setShoutText(e.target.value)}
                  placeholder="did what"
                  aria-label="Shoutout text"
                />
                <Button type="submit" size="sm" variant="primary" disabled={!shoutWho.trim() || !shoutText.trim()}>
                  Add
                </Button>
              </form>
            )}
          </div>
        </div>

        {/* ── human block: week in review ─────────────────── */}
        <div className="section">
          <div style={{ borderLeft: '2px solid var(--line-2)', padding: '2px 0 2px 14px' }}>
            <SectionLabel
              aside={
                canEdit ? (
                  <Button
                    size="sm"
                    variant="quiet"
                    onClick={() => {
                      setDraft(report.summary)
                      setEditing((v) => !v)
                    }}
                  >
                    {editing ? 'Cancel' : 'Write'}
                  </Button>
                ) : undefined
              }
            >
              Week in review
            </SectionLabel>

            {editing ? (
              <div className="stack" style={{ gap: 9 }}>
                <TextArea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="What actually happened, and what it means for next week."
                  aria-label="Week summary"
                />
                <Button
                  variant="primary"
                  onClick={() => {
                    upsertWeekly({ ...report, summary: draft, author: me?.name ?? report.author })
                    setEditing(false)
                  }}
                >
                  Save
                </Button>
              </div>
            ) : report.summary ? (
              <>
                <p className="body pretty" style={{ margin: 0 }}>
                  {report.summary}
                </p>
                <div className="meta-mono" style={{ marginTop: 8 }}>
                  — {report.author}
                </div>
              </>
            ) : (
              <p className="meta">
                Nothing written yet. {canEdit ? 'Write is the button above.' : 'Your captain writes this one.'}
              </p>
            )}
          </div>
        </div>

        <div className="section weekly-span">
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {allow('weekly.publish') && !report.published && (
              <Button variant="primary" onClick={() => publishWeekly(report.id)} disabled={!report.summary}>
                Publish week {report.week}
              </Button>
            )}
            <Button
              variant="quiet"
              onClick={() =>
                download(`week-${report.week}.md`, weeklyMarkdown(season, report.id), 'text/markdown;charset=utf-8')
              }
            >
              Export as markdown
            </Button>
            <Button variant="quiet" onClick={() => globalThis.print()}>
              Print
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
