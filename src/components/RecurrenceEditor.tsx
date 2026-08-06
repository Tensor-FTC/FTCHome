import { Field, Select, Toggle } from '@/components/ui'
import { describeRecurrence } from '@/domain/recurrence'
import type { Recurrence } from '@/domain/types'
import { addDays, fromIso } from '@/lib/date'

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type Ending = 'count' | 'until' | 'never'

function endingOf(r: Recurrence): Ending {
  return r.count ? 'count' : r.until ? 'until' : 'never'
}

/**
 * The repeat rule, in the terms a coach uses: "every week on Tuesday and
 * Thursday, for 8 sessions". Frequency, days and ending are all visible at
 * once — a repeat you cannot see the end of is how a team ends up with build
 * sessions scheduled into July.
 */
export function RecurrenceEditor({
  value,
  onChange,
  startDate,
}: {
  value: Recurrence | undefined
  onChange: (next: Recurrence | undefined) => void
  startDate: string
}) {
  const on = Boolean(value)
  const rule: Recurrence = value ?? { freq: 'weekly', interval: 1, count: 8 }
  const ending = endingOf(rule)
  const startDay = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? fromIso(startDate).getDay() : 0
  const days = rule.days?.length ? rule.days : [startDay]

  const set = (patch: Partial<Recurrence>) => onChange({ ...rule, ...patch })

  function toggleDay(d: number) {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b)
    // A weekly rule with no day selected can never fire; keep at least one.
    set({ days: next.length ? next : [d] })
  }

  function setEnding(next: Ending) {
    if (next === 'count') set({ count: rule.count ?? 8, until: undefined })
    else if (next === 'until') set({ until: rule.until ?? addDays(startDate, 7 * 8), count: undefined })
    else set({ count: undefined, until: undefined })
  }

  return (
    <div className="stack" style={{ gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="lede">Repeats</span>
        <Toggle
          checked={on}
          onChange={(next) => onChange(next ? { freq: 'weekly', interval: 1, days: [startDay], count: 8 } : undefined)}
          label="Repeats"
        />
      </div>

      {on && (
        <>
          <div className="field-row field-row-tight">
            <Select
              label="How often"
              value={`${rule.freq}-${rule.interval}`}
              onChange={(e) => {
                const [freq, interval] = e.target.value.split('-')
                set({ freq: freq as Recurrence['freq'], interval: Number(interval) })
              }}
            >
              <option value="weekly-1">Every week</option>
              <option value="weekly-2">Every 2 weeks</option>
              <option value="weekly-3">Every 3 weeks</option>
              <option value="monthly-1">Every month</option>
            </Select>

            <Select label="Ends" value={ending} onChange={(e) => setEnding(e.target.value as Ending)}>
              <option value="count">After a number of times</option>
              <option value="until">On a date</option>
              <option value="never">Keeps going</option>
            </Select>

            {ending === 'count' && (
              <Field
                label="How many"
                type="number"
                min={1}
                max={200}
                mono
                value={rule.count ?? 8}
                onChange={(e) => set({ count: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })}
              />
            )}
            {ending === 'until' && (
              <Field
                label="Last day"
                type="date"
                mono
                value={rule.until ?? ''}
                onChange={(e) => set({ until: e.target.value })}
              />
            )}
          </div>

          {rule.freq === 'weekly' && (
            <div>
              <span className="label" style={{ display: 'block', marginBottom: 7 }}>
                On these days
              </span>
              <div className="dow">
                {DOW.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={days.includes(i)}
                    aria-label={DOW_FULL[i]}
                    onClick={() => toggleDay(i)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="meta">{describeRecurrence({ ...rule, days: rule.freq === 'weekly' ? days : undefined })}</p>
        </>
      )}
    </div>
  )
}
