import { useId } from 'react'

export type StatusTone = 'signal' | 'pressure' | 'neutral' | 'dim'

export interface StatusOption<T extends string> {
  value: T
  label: string
  tone: StatusTone
}

const TONE_CLASS: Record<StatusTone, string> = {
  signal: 'is-signal',
  pressure: 'is-pressure',
  neutral: 'is-neutral',
  dim: 'is-dim',
}

/**
 * A status you can change where you read it.
 *
 * Every record that has a state — a sponsor that goes from pledged to received,
 * a task that gets blocked, a purchase that gets held — is edited in place
 * rather than through a detail screen. Teams update these standing at a bench,
 * and a status you have to navigate to is a status that stays wrong.
 *
 * It is a real `<select>`, so it keeps keyboard and screen-reader behaviour and
 * gets the platform's own picker on a phone. Without permission it renders as a
 * plain pill: same shape, no affordance, nothing to tap that will fail.
 */
export function StatusPicker<T extends string>({
  value,
  options,
  onChange,
  label,
  editable = true,
  size = 'md',
}: {
  value: T
  options: StatusOption<T>[]
  onChange: (next: T) => void
  /** Describes *what* is changing, e.g. "Status of Cut channel". */
  label: string
  editable?: boolean
  size?: 'sm' | 'md'
}) {
  const id = useId()
  const current = options.find((o) => o.value === value) ?? options[0]
  const classes = `status-pill ${TONE_CLASS[current?.tone ?? 'neutral']}${size === 'sm' ? ' status-pill-sm' : ''}`

  if (!editable) {
    return (
      <span className={classes}>
        <i aria-hidden="true" />
        {current?.label ?? value}
      </span>
    )
  }

  return (
    <span className={`${classes} is-editable`}>
      <i aria-hidden="true" />
      {/* The visible label. The select above it is transparent, so this is what reads. */}
      <span>{current?.label ?? value}</span>
      <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="status-pill-caret">
        ▾
      </span>
    </span>
  )
}
