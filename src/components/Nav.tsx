import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Brand } from './Brand'
import { Sheet } from './ui'
import { useStore, currentMember } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { ROLE_LABEL } from '@/domain/types'

/**
 * Four daily destinations on the phone, plus More; the same four plus the rest
 * of the app in the 240px desktop rail.
 *
 * Everything used to be five tabs with no fifth door, which meant Budget,
 * Roster, Parts, Weekly, Plan, Scout and Archive existed on desktop and were
 * simply unreachable on a phone — the device most of the team actually uses.
 */
export const TABS = [
  { to: '/today', label: 'Today', shape: 'square' },
  { to: '/calendar', label: 'Calendar', shape: 'square' },
  { to: '/build', label: 'Build', shape: 'square' },
  { to: '/live', label: 'Live', shape: 'circle' },
] as const

function Glyph({ shape, active }: { shape: 'square' | 'circle'; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 15,
        height: 15,
        border: `1.7px solid ${active ? 'var(--signal)' : 'var(--ink-4)'}`,
        borderRadius: shape === 'circle' ? '50%' : 4,
        display: 'block',
      }}
    />
  )
}

export function TabBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const allow = useCan()
  const [more, setMore] = useState(false)

  // Anything not in the four daily tabs is reachable here, so the phone has
  // the whole app rather than a subset of it.
  const rest = [...MANAGE.filter((m) => !m.capability || allow(m.capability)), ...APP_LINKS]
  const onRest = rest.some((r) => pathname === r.to || pathname.startsWith(`${r.to}/`))

  return (
    <>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => {
          const active = pathname === tab.to || pathname.startsWith(`${tab.to}/`)
          return (
            <NavLink key={tab.to} to={tab.to} className="tab" aria-current={active ? 'page' : undefined}>
              <span className="tab-icon">
                <Glyph shape={tab.shape} active={active} />
              </span>
              <span>{tab.label}</span>
            </NavLink>
          )
        })}

        <button
          type="button"
          className="tab"
          aria-expanded={more}
          aria-current={onRest ? 'page' : undefined}
          onClick={() => setMore(true)}
        >
          <span className="tab-icon">
            <MoreGlyph active={more || onRest} />
          </span>
          <span>More</span>
        </button>
      </nav>

      {more && (
        <Sheet title="Everything else" onClose={() => setMore(false)}>
          <div className="stack" style={{ gap: 2 }}>
            {rest.map((r) => (
              <button
                key={r.to}
                type="button"
                className="sheet-row"
                onClick={() => {
                  setMore(false)
                  navigate(r.to)
                }}
              >
                <span>{r.label}</span>
                <span aria-hidden="true" style={{ color: 'var(--ink-4)' }}>›</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

/** Three dots, drawn rather than shipped as an icon font. */
function MoreGlyph({ active }: { active: boolean }) {
  const c = active ? 'var(--signal)' : 'var(--ink-4)'
  return (
    <span aria-hidden="true" style={{ display: 'flex', gap: 2.5, alignItems: 'center', height: 15 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: c, display: 'block' }} />
      ))}
    </span>
  )
}

const MANAGE = [
  { to: '/chat', label: 'Chat' },
  { to: '/weekly', label: 'Weekly' },
  { to: '/roster', label: 'Roster' },
  { to: '/budget', label: 'Budget & sponsors' },
  { to: '/calendar/edit', label: 'Plan', capability: 'calendar.edit' as const },
  { to: '/parts', label: 'Parts' },
  { to: '/scout', label: 'Scout' },
  { to: '/archive', label: 'Archive' },
]

const APP_LINKS = [
  { to: '/help', label: 'How this works' },
  { to: '/states', label: 'States & sync' },
  { to: '/settings', label: 'Settings' },
] as const

export function Rail() {
  const { pathname } = useLocation()
  const allow = useCan()
  const season = useStore((s) => s.season)
  const session = useStore((s) => s.session)
  const member = useStore(currentMember)

  const item = (to: string, label: string) => {
    const active = pathname === to || (to !== '/' && pathname.startsWith(`${to}/`) && to !== '/calendar')
    return (
      <NavLink key={to} to={to} className="rail-item" aria-current={active ? 'page' : undefined}>
        {label}
      </NavLink>
    )
  }

  return (
    <nav className="rail" aria-label="Main">
      <div className="rail-brand">
        <Brand size={34} />
        <div>
          <div style={{ font: '600 13.5px/1.1 var(--font-sans)', color: 'var(--ink)' }}>FTC Home</div>
          <div
            className="num"
            style={{ font: '500 9px/1.5 var(--font-mono)', color: 'var(--ink-rail)', letterSpacing: '0.14em' }}
          >
            TEAM {season.team.number}
          </div>
        </div>
      </div>

      {TABS.map((t) => item(t.to, t.label))}

      <div className="rail-group">Season management</div>
      {MANAGE.filter((m) => !m.capability || allow(m.capability)).map((m) => item(m.to, m.label))}

      <div className="rail-group">App</div>
      {APP_LINKS.map((a) => item(a.to, a.label))}

      <div style={{ flex: 1 }} />
      <div className="divider" style={{ margin: '12px 0' }} />
      <NavLink to="/settings" className="rail-item" style={{ gap: 10 }}>
        <span
          className="avatar avatar-sm"
          style={{ borderRadius: 8, background: 'var(--signal-deep)', color: 'var(--signal)' }}
        >
          {member ? member.name.slice(0, 1) : session.guest ? 'G' : '?'}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', font: '500 12.5px var(--font-sans)', color: 'var(--ink-2)' }}>
            {member?.name ?? 'Guest'}
          </span>
          <span
            style={{
              display: 'block',
              font: '500 9px var(--font-mono)',
              color: 'var(--ink-4)',
              letterSpacing: '0.12em',
            }}
          >
            {ROLE_LABEL[session.role].toUpperCase()}
          </span>
        </span>
      </NavLink>
    </nav>
  )
}
