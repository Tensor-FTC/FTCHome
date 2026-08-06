import { NavLink, useLocation } from 'react-router-dom'
import { Brand } from './Brand'
import { useStore, currentMember } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { ROLE_LABEL } from '@/domain/types'

/**
 * Five destinations on the phone; the same five plus team management in the
 * 240px desktop rail. Anything a student uses daily is in the five.
 */
export const TABS = [
  { to: '/today', label: 'Today', shape: 'square' },
  { to: '/calendar', label: 'Calendar', shape: 'square' },
  { to: '/weekly', label: 'Weekly', shape: 'square' },
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
  return (
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
    </nav>
  )
}

const MANAGE = [
  { to: '/roster', label: 'Roster' },
  { to: '/budget', label: 'Budget & sponsors' },
  { to: '/calendar/edit', label: 'Edit calendar', capability: 'calendar.edit' as const },
  { to: '/parts', label: 'Parts' },
]

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
      {item('/help', 'How this works')}
      {item('/states', 'States & sync')}
      {item('/settings', 'Settings')}

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
