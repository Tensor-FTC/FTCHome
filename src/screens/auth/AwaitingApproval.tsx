import { useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Brand } from '@/components/Brand'
import { Button, Field, TextArea } from '@/components/ui'
import { useState } from 'react'
import { useStore, currentMember } from '@/store/useStore'
import { coaches, staff } from '@/domain/staffing'
import { ROLE_LABEL, type Role } from '@/domain/types'

const ASKABLE: Role[] = ['student', 'captain', 'parent', 'mentor', 'coach']

/**
 * A7 · Waiting to be let in
 *
 * Where somebody lands when they have signed in but nobody has put them on the
 * team yet. They can say who they are and what they do, and that is all — the
 * app behind this is not theirs to see until a coach says so.
 *
 * Shown as a normal state rather than an error. Most people here are a new
 * student on the first Tuesday of the season, not an intruder.
 */
export function AwaitingApprovalScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const me = useStore(currentMember)
  const session = useStore((s) => s.session)
  const updateMember = useStore((s) => s.updateMember)
  const signOut = useStore((s) => s.signOut)
  const notify = useStore((s) => s.notify)

  const [name, setName] = useState(me?.name ?? '')
  const [role, setRole] = useState<Role>(me?.role ?? 'student')
  const [note, setNote] = useState(me?.requestNote ?? '')

  // Already approved — a coach accepted while this tab sat open.
  if (me && me.status === 'active' && !session.awaitingApproval) {
    navigate('/today', { replace: true })
  }

  const deciders = coaches(season.members).length ? coaches(season.members) : staff(season.members)

  if (me?.status === 'declined') {
    return (
      <AuthLayout>
        <Brand size={52} />
        <h1 className="h1-lg" style={{ margin: '22px 0 8px', fontSize: 27 }}>
          Not this team
        </h1>
        <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 22 }}>
          A coach reviewed your request and did not accept it. If that looks like a mistake, the person
          to ask is your coach — nothing here can override them.
        </p>
        <Button
          block
          onClick={() => {
            signOut()
            navigate('/')
          }}
        >
          Sign out
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Brand size={52} />
      <h1 className="h1-lg" style={{ margin: '22px 0 8px', fontSize: 27 }}>
        Waiting for a coach
      </h1>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 8 }}>
        You are signed in as <strong style={{ color: 'var(--ink-2)' }}>{session.email || name}</strong>.
        {season.team.number ? ` Asking to join ${season.team.number} ${season.team.name}.` : ''}
      </p>
      <p className="meta pretty" style={{ marginBottom: 22 }}>
        {deciders.length
          ? `${deciders.map((c) => c.name).join(' or ')} will see this on the roster. Nudging them in person is usually faster.`
          : 'Nobody on this team can accept requests yet. A coach has to sign in first.'}
      </p>

      <div className="stack" style={{ gap: 11 }}>
        <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <span className="label" style={{ display: 'block', marginBottom: 7 }}>
            What are you on the team?
          </span>
          <div className="wrap">
            {ASKABLE.map((r) => (
              <button
                key={r}
                type="button"
                className="chip"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="field-note">A coach confirms this — asking for coach does not make you one.</p>
        </div>
        <TextArea
          label="Anything they should know"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Which subteam, who invited you, your last name if there are two of you."
        />
        <Button
          variant="primary"
          block
          disabled={!name.trim()}
          onClick={() => {
            if (!me) return
            updateMember(me.id, { name: name.trim(), role, requestNote: note.trim() || undefined })
            notify('Request updated')
          }}
        >
          Update my request
        </Button>
        <Button
          block
          onClick={() => {
            signOut()
            navigate('/')
          }}
        >
          Sign out
        </Button>
      </div>
    </AuthLayout>
  )
}
