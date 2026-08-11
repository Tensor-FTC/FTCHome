import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Avatar, Button, Chip, Field, IconButton } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { isConfigured } from '@/domain/season'
import { ROLE_LABEL, SUBTEAM_LABEL, type Role } from '@/domain/types'
import { SubteamPicker } from '@/components/SubteamPicker'

const ADDABLE_ROLES: Role[] = ['student', 'captain', 'mentor', 'coach', 'parent']

/**
 * A5 · Build the roster — step 2 of setup.
 *
 * The team's *identity* came from FTCScout in step 1. Who is actually on it is
 * the one thing no API knows, so it is entered here and starts genuinely empty.
 * There is no invented roster and no sample data to delete later.
 *
 * Each person added is an invite, not an account — they set their own
 * password the first time they sign in.
 */
export function RegisterScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const addMember = useStore((s) => s.addMember)
  const removeMember = useStore((s) => s.removeMember)

  const [name, setName] = useState('')
  // Students start teams. Defaulting to coach made the common case wrong and
  // implied an adult had to be present before anything could happen.
  const [role, setRole] = useState<Role>('student')
  const [subteams, setSubteams] = useState<string[]>([])

  // A team must be looked up before it can have a roster.
  if (!isConfigured(season)) return <Navigate to="/identity" replace />

  const team = season.team

  function onAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    addMember(trimmed, role, subteams)
    setName('')
    setSubteams([])
  }

  return (
    <AuthLayout>
      <div className="auth-badge auth-badge-signal">
        <span className="dot dot-live" />
        <span className="auth-badge-text">
          {team.number} · {team.name.toUpperCase()}
        </span>
      </div>

      <div className="label-lg" style={{ marginBottom: 10 }}>
        Set up · step 2 of 2
      </div>
      <h1 className="h1-lg" style={{ marginBottom: 8 }}>
        Who&rsquo;s on the team?
      </h1>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 6 }}>
        {[team.city, team.state].filter(Boolean).join(', ')}
        {team.rookieYear ? ` · rookie ${team.rookieYear}` : ''}
        {team.schoolName ? ` · ${team.schoolName}` : ''}
      </p>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 20 }}>
        Optional — you can skip this and invite people by email once you are in. Anyone added here
        sets their own password the first time they sign in.
      </p>

      <form onSubmit={onAdd} className="card-quiet card-pad" style={{ marginBottom: 14 }}>
        <div className="label" style={{ marginBottom: 11 }}>
          Add a member
        </div>
        <Field
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          aria-label="Full name"
          style={{ marginBottom: 9 }}
        />
        <div className="wrap" style={{ marginBottom: 9 }}>
          {ADDABLE_ROLES.map((r) => (
            <Chip key={r} active={role === r} onClick={() => setRole(r)}>
              {ROLE_LABEL[r]}
            </Chip>
          ))}
        </div>
        <div style={{ marginBottom: 11 }}>
          <SubteamPicker value={subteams} onChange={setSubteams} />
        </div>
        <Button type="submit" variant="primary" block disabled={!name.trim()}>
          Add member
        </Button>
      </form>

      <div className="label" style={{ marginBottom: 9 }}>
        Roster · {season.members.length}
      </div>

      {season.members.length === 0 ? (
        <div
          className="card-dashed"
          style={{ padding: 20, textAlign: 'center', font: '400 12px/1.5 var(--font-sans)', color: 'var(--ink-4)' }}
        >
          Nobody yet — that is fine. Invite people by email once you are in.
        </div>
      ) : (
        season.members.map((m) => (
          <div key={m.id} className="row">
            <Avatar name={m.name} staff={m.role === 'coach' || m.role === 'mentor'} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{m.name}</div>
              <div
                style={{ font: '500 9.5px/1.6 var(--font-mono)', color: 'var(--ink-4)', letterSpacing: '0.1em' }}
              >
                {ROLE_LABEL[m.role].toUpperCase()}
                {m.subteams?.length ? ` · ${m.subteams.map((s) => (SUBTEAM_LABEL[s] ?? s).toUpperCase()).join(' · ')}` : ''}
              </div>
            </div>
            <IconButton label={`Remove ${m.name}`} small onClick={() => removeMember(m.id)}>
              ×
            </IconButton>
          </div>
        ))
      )}

      <Button
        variant="primary"
        size="lg"
        block
        style={{ marginTop: 18 }}
        onClick={() => navigate('/signin')}
      >
        {season.members.length ? 'Done — create my account' : 'Skip — create my account'}
      </Button>

      <Button variant="quiet" block style={{ marginTop: 8 }} onClick={() => navigate('/identity')}>
        Wrong team? Look up another number
      </Button>
    </AuthLayout>
  )
}
