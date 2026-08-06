import { useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Avatar } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { ROLE_LABEL } from '@/domain/types'
import { isStaff } from '@/domain/permissions'

/**
 * A2 · Who are you
 *
 * Faces, not a dropdown — faster in a loud shop, and it makes the roster
 * visible. Only a coach can add people, so the list is trustworthy; tapping a
 * mentor routes to mentor authentication rather than the student password step.
 */
export function WhoAreYouScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)

  return (
    <AuthLayout back="/signin">
      <div
        className="mono"
        style={{ font: '500 12px var(--font-mono)', color: 'var(--ink-3)', letterSpacing: '0.1em', marginBottom: 18 }}
      >
        {season.team.number} · {season.team.name.toUpperCase()}
      </div>
      <h1 className="h1-lg" style={{ marginBottom: 8 }}>
        Who are you?
      </h1>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 20 }}>
        Pick yourself, then use your own password.
      </p>

      <div className="pick-grid">
        {season.members.map((member) => (
          <button
            key={member.id}
            type="button"
            className="pick"
            onClick={() =>
              navigate(isStaff(member.role) ? '/signin/mentor' : `/signin/member/${member.id}`)
            }
          >
            <Avatar name={member.name} staff={isStaff(member.role)} size="sm" />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', font: '500 12.5px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>
                {member.name}
              </span>
              <span
                style={{
                  display: 'block',
                  font: '500 9.5px/1.6 var(--font-mono)',
                  color: 'var(--ink-4)',
                  letterSpacing: '0.1em',
                }}
              >
                {ROLE_LABEL[member.role].toUpperCase()}
                {member.status === 'invited' ? ' · PENDING' : ''}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="card-quiet card-pad" style={{ marginTop: 16 }}>
        <div style={{ font: '500 12.5px/1.4 var(--font-sans)', color: 'var(--ink-2)' }}>Not listed?</div>
        <div className="meta" style={{ marginTop: 3 }}>
          Only a coach can add members. Ask them to add you, then sign in again.
        </div>
      </div>
    </AuthLayout>
  )
}
