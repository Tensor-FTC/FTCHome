import { useState } from 'react'
import { Button, Chip, Field, Sheet, TextArea, Toggle } from '@/components/ui'
import { useStore, currentMember } from '@/store/useStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { SCOUT_TAGS, type ScoutingNote } from '@/domain/types'

/**
 * One team's scouting record, edited in a sheet.
 *
 * Written standing up, usually one-handed, often between matches. So the
 * quick judgements — rating, would-pick, what they actually do — are taps, and
 * the only typing is the sentence that a tap cannot express. Everything saves
 * to the outbox, so a note taken on venue wifi that never worked still reaches
 * the rest of the team when someone gets signal.
 */
export function ScoutingSheet({
  teamNumber,
  teamName,
  eventCode,
  matchLabel,
  onClose,
}: {
  teamNumber: string
  teamName: string
  eventCode?: string
  matchLabel?: string
  onClose: () => void
}) {
  const existing = useStore((s) =>
    s.season.scouting.find((n) => n.teamNumber === teamNumber && (n.eventCode ?? '') === (eventCode ?? '')),
  )
  const upsertScouting = useStore((s) => s.upsertScouting)
  const removeScouting = useStore((s) => s.removeScouting)
  const notify = useStore((s) => s.notify)
  const me = useStore(currentMember)
  const online = useStore((s) => s.online)
  const cloudReady = isSupabaseConfigured()

  const [note, setNote] = useState(existing?.note ?? '')
  const [tags, setTags] = useState<string[]>(existing?.tags ?? [])
  const [rating, setRating] = useState<number | undefined>(existing?.rating)
  const [wouldPick, setWouldPick] = useState(Boolean(existing?.wouldPick))
  const [auto, setAuto] = useState(existing?.auto != null ? String(existing.auto) : '')

  function toggleTag(tag: string) {
    setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]))
  }

  function save() {
    const record: Omit<ScoutingNote, 'id' | 'updatedAt'> & { id?: string } = {
      id: existing?.id,
      teamNumber,
      teamName,
      note: note.trim(),
      tags,
      rating,
      wouldPick,
      auto: auto.trim() ? Number(auto) : undefined,
      eventCode,
      matchLabel: matchLabel ?? existing?.matchLabel,
      authorId: me?.id,
      takenAt: new Date().toISOString(),
    }
    upsertScouting(record)
    notify(online || !cloudReady ? `Saved note on ${teamNumber}` : `Note on ${teamNumber} queued to sync`)
    onClose()
  }

  return (
    <Sheet
      title={`${teamNumber} · scouting`}
      subtitle={[teamName, matchLabel].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 9 }}>
          {existing && (
            <Button
              onClick={() => {
                removeScouting(existing.id)
                notify(`Removed note on ${teamNumber}`)
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="primary" block onClick={save}>
            Save note
          </Button>
        </div>
      }
    >
      <div className="stack" style={{ gap: 13 }}>
        <div>
          <span className="label" style={{ display: 'block', marginBottom: 7 }}>
            How they look
          </span>
          <div className="wrap">
            {[1, 2, 3, 4, 5].map((n) => (
              <Chip
                key={n}
                className="chip-mono"
                active={rating === n}
                onClick={() => setRating(rating === n ? undefined : n)}
              >
                {n}
              </Chip>
            ))}
            <span className="meta" style={{ alignSelf: 'center', marginLeft: 4 }}>
              {rating ? `${rating} of 5` : 'no call yet'}
            </span>
          </div>
        </div>

        <div>
          <span className="label" style={{ display: 'block', marginBottom: 7 }}>
            What they do
          </span>
          <div className="wrap">
            {SCOUT_TAGS.map((tag) => (
              <Chip key={tag} active={tags.includes(tag)} onClick={() => toggleTag(tag)}>
                {tag}
              </Chip>
            ))}
          </div>
        </div>

        <TextArea
          label="Anything else"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Cycle speed, endgame, anything that changes how we play them."
        />

        <div className="field-row">
          <Field
            label="Auto average"
            value={auto}
            onChange={(e) => setAuto(e.target.value)}
            inputMode="decimal"
            placeholder="22.0"
            mono
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span className="lede">
            Shortlist for alliance selection
            <span className="meta" style={{ display: 'block' }}>
              Collects on the Scout screen so the captain has one list to read.
            </span>
          </span>
          <Toggle checked={wouldPick} onChange={setWouldPick} label="Would pick" />
        </div>
      </div>
    </Sheet>
  )
}
