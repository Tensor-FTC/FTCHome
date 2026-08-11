import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Button, Check, Chip, EmptyState, Field, IconButton } from '@/components/ui'
import { useStore, partsTotals } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { money } from '@/lib/format'
import { download, parseParts, partsCsv } from '@/lib/exporters'

/**
 * Parts — the team's own bill of materials.
 *
 * There is deliberately no bundled catalogue. Vendor prices change constantly,
 * no API publishes them, and a shipped starter list would be wrong within a
 * season — so this starts empty and holds what the team is actually buying.
 *
 * The subtotal is what you still have to buy: owned rows dim and strike rather
 * than disappear, so the list stays a complete BOM for export.
 */
export function PartsScreen() {
  const season = useStore((s) => s.season)
  const allow = useCan()
  const addPart = useStore((s) => s.addPart)
  const togglePart = useStore((s) => s.togglePart)
  const removePart = useStore((s) => s.removePart)
  const importParts = useStore((s) => s.importParts)
  const notify = useStore((s) => s.notify)

  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [vendor, setVendor] = useState('')
  const [category, setCategory] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('')
  const [filter, setFilter] = useState<'all' | 'needed' | 'owned'>('all')

  const editable = allow('budget.edit') || allow('tasks.create')
  const { need, all, haveCount, allCount } = partsTotals(season)

  /** Categories come from what the team has actually typed, not a fixed taxonomy. */
  const categories = useMemo(
    () => [...new Set(season.parts.map((p) => p.category).filter(Boolean))].sort(),
    [season.parts],
  )

  const visible = useMemo(
    () =>
      season.parts.filter((p) =>
        filter === 'all' ? true : filter === 'owned' ? p.owned : !p.owned,
      ),
    [season.parts, filter],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, typeof visible>()
    for (const part of visible) {
      const key = part.category || 'Uncategorised'
      map.set(key, [...(map.get(key) ?? []), part])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [visible])

  function onAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    addPart({
      name: trimmed,
      partNumber: partNumber.trim(),
      vendor: vendor.trim(),
      category: category.trim() || 'Uncategorised',
      qty: Math.max(1, Math.round(Number(qty) || 1)),
      unit: Number(String(unit).replace(/[^0-9.]/g, '')) || 0,
      owned: false,
    })
    setName('')
    setPartNumber('')
    setUnit('')
  }

  async function onImport(file: File | undefined) {
    if (!file) return
    try {
      const rows = parseParts(await file.text())
      if (!rows.length) {
        notify('No parts found in that file', 'warn')
        return
      }
      const count = importParts(rows)
      notify(`Imported ${count} ${count === 1 ? 'part' : 'parts'}`)
    } catch {
      notify('Could not read that CSV', 'warn')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 12 }}>
        <div className="section-head" style={{ padding: 0 }}>
          <div>
            <h1 className="h1" style={{ fontSize: 23 }}>
              Parts
            </h1>
            <p className="lede" style={{ marginTop: 3 }}>
              What you&rsquo;re buying this season. Tick what you already have.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => void onImport(e.target.files?.[0])}
            />
            {editable && (
              <Button size="sm" variant="quiet" onClick={() => fileRef.current?.click()}>
                Import CSV
              </Button>
            )}
            {season.parts.length > 0 && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() =>
                  download(`ftc-${season.team.number || 'team'}-parts.csv`, partsCsv(season), 'text/csv;charset=utf-8')
                }
              >
                Export CSV
              </Button>
            )}
          </div>
        </div>
      </div>

      {season.parts.length === 0 ? (
        <div className="section">
          <EmptyState
            title="No parts yet"
            body="Add what you need to buy, or import a CSV exported from a vendor cart. The subtotal tracks what's still outstanding."
            action={editable ? { label: 'Import a CSV', onClick: () => fileRef.current?.click() } : undefined}
          />
        </div>
      ) : (
        <>
          {/* Sticky subtotal: the number stays on screen while you tick items off. */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 20,
              background: 'var(--srf-app)',
              borderTop: '1px solid var(--line)',
              borderBottom: '1px solid var(--line)',
              padding: '12px var(--gutter)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 14,
            }}
          >
            <div>
              <div className="label" style={{ fontSize: 9 }}>
                Still needed
              </div>
              <div className="num" style={{ font: '600 27px/1.1 var(--font-mono)', color: 'var(--signal)' }}>
                {money(need)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="label" style={{ fontSize: 9 }}>
                Have / total
              </div>
              <div className="num" style={{ font: '500 15px/1.6 var(--font-mono)', color: '#9ba5a9' }}>
                {haveCount} / {allCount} · {money(all)}
              </div>
            </div>
          </div>

          <div className="section" style={{ paddingTop: 12 }}>
            <div className="wrap">
              {(['all', 'needed', 'owned'] as const).map((f) => (
                <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'needed' ? 'Still needed' : 'Owned'}
                </Chip>
              ))}
            </div>
          </div>

          {grouped.map(([group, items]) => {
            const subtotal = items.filter((i) => !i.owned).reduce((sum, i) => sum + i.qty * i.unit, 0)
            return (
              <div key={group}>
                <div
                  style={{
                    padding: '14px var(--gutter) 7px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span className="label">{group}</span>
                  <span className="num" style={{ font: '500 11px var(--font-mono)', color: 'var(--ink-rail)' }}>
                    {money(subtotal)}
                  </span>
                </div>

                {items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '11px var(--gutter)',
                      borderBottom: '1px solid var(--line-soft)',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      background: item.owned ? '#0e1113' : 'transparent',
                      opacity: item.owned ? 0.55 : 1,
                    }}
                  >
                    <Check
                      large
                      checked={item.owned}
                      onChange={() => togglePart(item.id)}
                      label={`${item.owned ? 'Unmark' : 'Mark'} ${item.name} as owned`}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          font: '500 13px/1.3 var(--font-sans)',
                          color: 'var(--ink-body)',
                          textDecoration: item.owned ? 'line-through' : 'none',
                        }}
                      >
                        {item.name}
                      </div>
                      {(item.partNumber || item.vendor) && (
                        <div className="meta-mono" style={{ letterSpacing: '0.02em' }}>
                          {[item.partNumber, item.vendor].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flex: 'none', whiteSpace: 'nowrap' }}>
                      <div className="num" style={{ font: '500 13px/1.2 var(--font-mono)', color: '#d6dcde' }}>
                        {money(item.qty * item.unit)}
                      </div>
                      <div className="meta-mono">
                        {item.qty} × {money(item.unit)}
                      </div>
                    </div>
                    {editable && (
                      <IconButton label={`Remove ${item.name}`} small onClick={() => removePart(item.id)}>
                        ×
                      </IconButton>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </>
      )}

      {editable && (
        <form onSubmit={onAdd} className="section">
          <div className="card-quiet card-pad">
            <div className="label" style={{ marginBottom: 11 }}>
              Add a part
            </div>
            <Field
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What is it?"
              aria-label="Part name"
              style={{ marginBottom: 9 }}
            />
            <div style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
              <Field
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="Part number"
                aria-label="Part number"
                mono
                style={{ flex: 1, minWidth: 0 }}
              />
              <Field
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Vendor"
                aria-label="Vendor"
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
              <Field
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
                aria-label="Quantity"
                placeholder="Qty"
                mono
                style={{ width: 90, flex: 'none' }}
              />
              <Field
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                inputMode="decimal"
                aria-label="Unit price"
                placeholder="Unit price"
                mono
                style={{ flex: 1, minWidth: 0 }}
              />
              <Field
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category"
                aria-label="Category"
                list="part-categories"
                style={{ flex: 1, minWidth: 0 }}
              />
              <datalist id="part-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <Button type="submit" variant="primary" block disabled={!name.trim()}>
              Add part
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
