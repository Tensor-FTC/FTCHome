import { useState } from 'react'
import { Button, Chip, Field } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { allSubteams, subteamId } from '@/domain/subteams'

/**
 * Pick any number of subteams, and invent one if none of them fit.
 *
 * Two things this exists to get right. Most students are on more than one
 * subteam by February, and a single choice meant the roster was quietly wrong
 * about half of them. And every team has a group the built-in list has never
 * heard of — CAD, pit crew, fundraising — which used to have nowhere to go.
 *
 * A subteam somebody adds is written to the season, so it syncs and shows up
 * for everybody rather than living on one device.
 */
export function SubteamPicker({
  value,
  onChange,
  label = 'Subteams',
  allowCreate = true,
}: {
  value: string[]
  onChange: (next: string[]) => void
  label?: string
  allowCreate?: boolean
}) {
  const season = useStore((s) => s.season)
  const addSubteam = useStore((s) => s.addSubteam)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  const options = allSubteams(season)

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  }

  function create() {
    const name = draft.trim()
    if (!name) return
    const id = subteamId(name)
    if (!id) return
    addSubteam(name)
    // Selecting it too — nobody types a new subteam they did not want to join.
    if (!value.includes(id)) onChange([...value, id])
    setDraft('')
    setAdding(false)
  }

  return (
    <div>
      <div className="label" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div className="wrap">
        {options.map((s) => (
          <Chip key={s.id} active={value.includes(s.id)} onClick={() => toggle(s.id)}>
            {s.label}
          </Chip>
        ))}
        {allowCreate && !adding && (
          <Chip onClick={() => setAdding(true)}>+ Add one</Chip>
        )}
      </div>

      {adding && (
        <div style={{ display: 'flex', gap: 9, marginTop: 9, alignItems: 'flex-end' }}>
          <Field
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Pit crew"
            aria-label="New subteam name"
            autoFocus
            style={{ flex: 1, minWidth: 0 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                create()
              }
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={create}>
            Add
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      )}

      <p className="field-note">
        Pick as many as apply.{' '}
        {allowCreate ? 'Anything you add here shows up for the whole team.' : ''}
      </p>
    </div>
  )
}
