import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { can } from '@/domain/permissions'
import { EVENT_TYPE_LABEL, ROLE_LABEL } from '@/domain/types'
import { longStamp } from '@/lib/date'
import { money } from '@/lib/format'

interface Hit {
  id: string
  kind: string
  title: string
  sub: string
  to: string
}

/**
 * Search across the season. Ctrl/Cmd-K, or the button in the desktop top bar.
 *
 * The thing it actually solves: a season accumulates a few hundred records
 * across nine screens, and "which screen was the library demo on" is a worse
 * question than it sounds when you are standing in a shop. Everything is
 * already in memory, so this is a filter, not a query.
 */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const season = useStore((s) => s.season)
  const role = useStore((s) => s.session.role)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      // Focus after paint, or mobile Safari drops the keyboard.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: Hit[] = []
    const match = (...fields: (string | undefined)[]) =>
      fields.some((f) => f?.toLowerCase().includes(q))

    for (const e of season.events) {
      if (match(e.title, e.location, e.notes)) {
        out.push({
          id: e.id,
          kind: EVENT_TYPE_LABEL[e.type],
          title: e.title,
          sub: `${longStamp(e.date)}${e.location ? ` · ${e.location}` : ''}`,
          to: `/events/${e.id}`,
        })
      }
    }

    for (const t of season.tasks) {
      if (match(t.name, t.subteam, t.blockedBy)) {
        const who = season.members.find((m) => m.id === t.assigneeId)
        out.push({
          id: t.id,
          kind: t.done ? 'Task · done' : 'Task',
          title: t.name,
          sub: [t.subteam, who?.name].filter(Boolean).join(' · ') || 'unassigned',
          to: '/today',
        })
      }
    }

    for (const m of season.members) {
      if (match(m.name, m.username, m.subteam)) {
        out.push({
          id: m.id,
          kind: ROLE_LABEL[m.role],
          title: m.name,
          sub: m.username,
          to: '/roster',
        })
      }
    }

    // Sponsor amounts follow the same gate as the Budget screen.
    if (can(role, 'budget.viewAmounts')) {
      for (const s of season.sponsors) {
        if (match(s.name, s.tier)) {
          out.push({ id: s.id, kind: 'Sponsor', title: s.name, sub: `${money(s.amount)} · ${s.state}`, to: '/budget' })
        }
      }
    }

    for (const item of season.media) {
      if (match(item.name, item.caption, item.author)) {
        out.push({ id: item.id, kind: item.kind, title: item.name || item.caption, sub: longStamp(item.day), to: '/build' })
      }
    }

    for (const note of season.scouting) {
      if (match(note.teamNumber, note.teamName, note.note)) {
        out.push({ id: note.id, kind: 'Pit note', title: `${note.teamNumber} ${note.teamName}`, sub: note.note, to: '/live' })
      }
    }

    return out.slice(0, 12)
  }, [query, season, role])

  useEffect(() => {
    setCursor(0)
  }, [query])

  if (!open) return null

  function go(hit: Hit) {
    navigate(hit.to)
    onClose()
  }

  return (
    <div className="sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet palette" role="dialog" aria-modal="true" aria-label="Search the season">
        <input
          ref={inputRef}
          className="field field-lg"
          style={{ font: '400 16px var(--font-sans)', letterSpacing: 0 }}
          value={query}
          placeholder="Search events, tasks, people, sponsors, media…"
          aria-label="Search the season"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return onClose()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(c + 1, hits.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(c - 1, 0))
            }
            if (e.key === 'Enter' && hits[cursor]) {
              e.preventDefault()
              go(hits[cursor])
            }
          }}
        />

        <div style={{ marginTop: 12 }}>
          {query && hits.length === 0 && (
            <p className="meta" style={{ padding: '12px 4px' }}>
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          )}
          {!query && (
            <p className="meta" style={{ padding: '12px 4px' }}>
              Type to search. <span className="mono">↑↓</span> to move, <span className="mono">↵</span> to open,{' '}
              <span className="mono">Esc</span> to close.
            </p>
          )}
          {hits.map((hit, i) => (
            <button
              key={`${hit.kind}-${hit.id}`}
              type="button"
              className="palette-hit"
              aria-selected={i === cursor}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(hit)}
            >
              <span className="label" style={{ width: 88, flex: 'none', textAlign: 'left' }}>
                {hit.kind}
              </span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ display: 'block', font: '500 13px var(--font-sans)', color: 'var(--ink-body)' }}>
                  {hit.title}
                </span>
                <span
                  style={{
                    display: 'block',
                    font: '400 11px var(--font-sans)',
                    color: 'var(--ink-4)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {hit.sub}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Ctrl/Cmd-K anywhere, without stealing the shortcut from a focused text field. */
export function useSearchHotkey(onOpen: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpen()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onOpen])
}
