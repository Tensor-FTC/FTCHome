import { useMemo } from 'react'
import { Button, Check, Chip } from '@/components/ui'
import { useStore, partsTotals } from '@/store/useStore'
import { groupsOf, PARTS_TIERS } from '@/domain/parts'
import { money } from '@/lib/format'
import { download, partsCsv } from '@/lib/exporters'

/**
 * 02 · Starter parts list
 *
 * Tiered and grouped. Toggle what you own; the sticky header shows only what you
 * still have to buy, so the number is on screen while you toggle.
 *
 * Owned rows dim and strike rather than disappear — the list stays a complete
 * bill of materials for export.
 */
export function PartsScreen() {
  const season = useStore((s) => s.season)
  const setTier = useStore((s) => s.setPartsTier)
  const togglePart = useStore((s) => s.togglePart)
  const resetParts = useStore((s) => s.resetParts)

  const { need, all, haveCount, allCount, tier, owned } = partsTotals(season)
  const groups = useMemo(() => groupsOf(tier), [tier])

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 12 }}>
        <h1 className="h1" style={{ fontSize: 23 }}>
          Starter parts
        </h1>
        <p className="lede" style={{ margin: '3px 0 14px' }}>
          Toggle what you already have. Subtotal is what you still need to buy.
        </p>
        <div style={{ display: 'flex', gap: 5 }}>
          {PARTS_TIERS.map((t) => (
            <Chip
              key={t.id}
              active={tier.id === t.id}
              onClick={() => setTier(t.id)}
              style={{ flex: 1, height: 36, justifyContent: 'center' }}
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* The subtotal bar is sticky at the top of the scroll. */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: '#0f1315',
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

      {groups.map((group) => {
        const items = tier.items.filter((i) => i.group === group)
        const subtotal = items.filter((i) => !owned[i.id]).reduce((sum, i) => sum + i.qty * i.unit, 0)
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

            {items.map((item) => {
              const have = Boolean(owned[item.id])
              return (
                <div
                  key={item.id}
                  style={{
                    padding: '11px var(--gutter)',
                    borderBottom: '1px solid var(--line-soft)',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    background: have ? '#0e1113' : 'transparent',
                    opacity: have ? 0.55 : 1,
                  }}
                >
                  <Check
                    large
                    checked={have}
                    onChange={() => togglePart(item.id)}
                    label={`${have ? 'Unmark' : 'Mark'} ${item.name} as owned`}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        font: '500 13px/1.3 var(--font-sans)',
                        color: 'var(--ink-body)',
                        textDecoration: have ? 'line-through' : 'none',
                      }}
                    >
                      {item.name}
                    </div>
                    <div className="meta-mono" style={{ letterSpacing: '0.02em' }}>
                      {item.partNumber} · {item.vendor}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none', whiteSpace: 'nowrap' }}>
                    <div className="num" style={{ font: '500 13px/1.2 var(--font-mono)', color: '#d6dcde' }}>
                      {money(item.qty * item.unit)}
                    </div>
                    <div className="meta-mono">
                      {item.qty} × {money(item.unit)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      <div className="section" style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <Button
          block
          onClick={() =>
            download(`ftc-parts-${tier.id}.csv`, partsCsv(season), 'text/csv;charset=utf-8')
          }
        >
          Export CSV
        </Button>
        <Button block onClick={resetParts}>
          Clear this tier
        </Button>
      </div>
    </div>
  )
}
