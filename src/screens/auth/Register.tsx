import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Avatar, Button, Chip, Field, IconButton } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { ROLE_LABEL, type Role, type Subteam, SUBTEAM_LABEL } from '@/domain/types'
import { buildEmptySeason } from '@/domain/seed'
import { lookupTeam } from '@/lib/ftcEvents'
import { hasApiKey } from '@/lib/ftcEvents'

const ADDABLE_ROLES: Role[] = ['student', 'captain', 'mentor', 'coach', 'parent']

/**
 * A5 · Register — coach only
 *
 * A brand-new team has exactly one member: the coach who registered it. The
 * empty state is the point — there is no invented roster and no sample data to
 * delete later. Each added person is an invite, not an account; they receive the
 * team code and set their own password on first sign-in.
 */
export function RegisterScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const replaceSeason = useStore((s) => s.replaceSeason)
  const addMember = useStore((s) => s.addMember)
  const removeMember = useStore((s) => s.removeMember)
  const notify = useStore((s) => s.notify)

  const [step, setStep] = useState<'team' | 'roster'>('team')
  const [number, setNumber] = useState('')
  const [teamName, setTeamName] = useState('')
  const [coachName, setCoachName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [memberName, setMemberName] = useState('')
  const [memberRole, setMemberRole] = useState<Role>('student')
  const [memberSubteam, setMemberSubteam] = useState<Subteam | ''>('')

  const coach = season.members.find((m) => m.role === 'coach')
  const invited = season.members.filter((m) => m.pending)

  async function createTeam(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!/^\d{1,6}$/.test(number.trim())) {
      setError('Team numbers are digits only')
      return
    }
    if (!coachName.trim()) {
      setError('A team starts with its coach — put your name in')
      return
    }

    setBusy(true)
    // If a live registry key is present, confirm the number against FIRST so a
    // typo does not become the team's identity for a season.
    let resolvedName = teamName.trim()
    let region = ''
    let rookieYear = new Date().getFullYear()
    if (hasApiKey()) {
      const found = await lookupTeam(season.settings.ftcSeason, number.trim())
      if (found) {
        resolvedName = resolvedName || found.name
        region = found.region
        rookieYear = found.rookieYear
      }
    }
    if (!resolvedName) resolvedName = `Team ${number.trim()}`

    const fresh = buildEmptySeason(number.trim(), resolvedName, coachName.trim())
    fresh.team.region = region
    fresh.team.rookieYear = rookieYear
    await replaceSeason(fresh)
    setBusy(false)
    setStep('roster')
    notify(`Team ${number.trim()} registered`)
  }

  function onAddMember(e: FormEvent) {
    e.preventDefault()
    const name = memberName.trim()
    if (!name) return
    addMember(name, memberRole, memberSubteam || undefined)
    setMemberName('')
  }

  if (step === 'team') {
    return (
      <AuthLayout back="/signin">
        <h1 className="h1-lg" style={{ marginBottom: 8 }}>
          Register a team
        </h1>
        <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 22 }}>
          This replaces whatever season is on this device. Export a backup first if you need it.
        </p>

        <form onSubmit={createTeam} className="stack" style={{ gap: 11 }}>
          <Field
            label="Team number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            inputMode="numeric"
            placeholder="11138"
            big
            mono
            error={error}
          />
          <Field
            label="Team name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder={hasApiKey() ? 'looked up from FIRST if left blank' : 'Robo Eclipse'}
          />
          <Field
            label="Head coach"
            value={coachName}
            onChange={(e) => setCoachName(e.target.value)}
            placeholder="D. Moreau"
            autoComplete="name"
          />
          <Button type="submit" variant="primary" size="lg" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? 'Creating…' : 'Create team'}
          </Button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="auth-badge auth-badge-signal">
        <span className="dot dot-live" />
        <span className="auth-badge-text">TEAM {season.team.number} REGISTERED</span>
      </div>

      <h1 className="h1-lg" style={{ marginBottom: 8 }}>
        You&rsquo;re the only member
      </h1>
      <p className="body" style={{ color: 'var(--ink-3)', marginBottom: 20 }}>
        A new team starts with its coach. Add people and they&rsquo;ll get the team code plus their own
        password.
      </p>

      {coach && (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={coach.name} staff />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: '500 14px/1.3 var(--font-sans)', color: 'var(--ink)' }}>{coach.name}</div>
              <div
                style={{
                  font: '500 10px/1.6 var(--font-mono)',
                  color: 'var(--ink-3)',
                  letterSpacing: '0.1em',
                }}
              >
                HEAD COACH · YOU
              </div>
            </div>
            <span
              className="label"
              style={{
                color: 'var(--signal)',
                padding: '5px 9px',
                borderRadius: 999,
                background: 'var(--signal-deep)',
              }}
            >
              OWNER
            </span>
          </div>
        </div>
      )}

      <form onSubmit={onAddMember} className="card-quiet card-pad" style={{ marginBottom: 14 }}>
        <div className="label" style={{ marginBottom: 11 }}>
          Add a member
        </div>
        <Field
          value={memberName}
          onChange={(e) => setMemberName(e.target.value)}
          placeholder="Full name"
          style={{ marginBottom: 9 }}
        />
        <div className="wrap" style={{ marginBottom: 9 }}>
          {ADDABLE_ROLES.map((role) => (
            <Chip key={role} active={memberRole === role} onClick={() => setMemberRole(role)}>
              {ROLE_LABEL[role]}
            </Chip>
          ))}
        </div>
        <div className="wrap" style={{ marginBottom: 11 }}>
          <Chip active={memberSubteam === ''} onClick={() => setMemberSubteam('')}>
            No subteam
          </Chip>
          {(Object.keys(SUBTEAM_LABEL) as Subteam[]).map((s) => (
            <Chip key={s} active={memberSubteam === s} onClick={() => setMemberSubteam(s)}>
              {SUBTEAM_LABEL[s]}
            </Chip>
          ))}
        </div>
        <Button type="submit" variant="primary" block disabled={!memberName.trim()}>
          Add member
        </Button>
      </form>

      <div className="label" style={{ marginBottom: 9 }}>
        Added · {invited.length}
      </div>

      {invited.length === 0 ? (
        <div
          className="card-dashed"
          style={{ padding: 20, textAlign: 'center', font: '400 12px/1.5 var(--font-sans)', color: 'var(--ink-4)' }}
        >
          No one yet. Add your captain first.
        </div>
      ) : (
        <div>
          {invited.map((m) => (
            <div key={m.id} className="row">
              <Avatar name={m.name} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{m.name}</div>
                <div
                  style={{
                    font: '500 9.5px/1.6 var(--font-mono)',
                    color: 'var(--ink-4)',
                    letterSpacing: '0.1em',
                  }}
                >
                  {ROLE_LABEL[m.role].toUpperCase()} · INVITE PENDING
                </div>
              </div>
              <IconButton label={`Remove ${m.name}`} small onClick={() => removeMember(m.id)}>
                ×
              </IconButton>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        block
        style={{ marginTop: 18 }}
        onClick={() => navigate('/signin')}
      >
        Done — sign in
      </Button>
    </AuthLayout>
  )
}
