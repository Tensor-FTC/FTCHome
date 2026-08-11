import { useState, type FormEvent } from 'react'
import { Avatar, Button, Chip, Field, IconButton, LockedValue, Sheet } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { isLastStaff, staffingIssues } from '@/domain/staffing'
import { subteamLabel } from '@/domain/subteams'
import { SubteamPicker } from '@/components/SubteamPicker'
import { can, CAPABILITY_LABEL, GRANTABLE, type Capability } from '@/domain/permissions'
import {
  AUTH_PROVIDER_LABEL,
  MEMBER_STATUS_LABEL,
  ROLE_LABEL,
  type Member,
  type Role,
} from '@/domain/types'
import { download, rosterCsv } from '@/lib/exporters'

const ADDABLE_ROLES: Role[] = ['student', 'captain', 'mentor', 'coach', 'parent']

/**
 * R1 · Roster
 *
 * Who is on the team, what they do, and who is still pending.
 *
 * Contact details show as a real value for staff and as a dashed withheld chip
 * for everyone else — same row, same position, visibly gated. Pending invites
 * stay in the list so a coach can see who never signed in.
 */
export function RosterScreen() {
  const season = useStore((s) => s.season)
  const allow = useCan()
  const addMember = useStore((s) => s.addMember)
  const updateMember = useStore((s) => s.updateMember)
  const removeMember = useStore((s) => s.removeMember)
  const notify = useStore((s) => s.notify)

  const [name, setName] = useState('')
  const [newRole, setNewRole] = useState<Role>('student')
  const [subteams, setSubteams] = useState<string[]>([])
  const [editing, setEditing] = useState<Member | null>(null)

  const manage = allow('roster.manage')
  const canApprove = allow('members.approve')
  const canGrant = allow('members.grant')
  const requests = season.members.filter((m) => m.status === 'requested')
  const readContact = allow('roster.readContact')
  const pending = season.members.filter((m) => m.status === 'invited').length
  const approveMember = useStore((s) => s.approveMember)
  const declineMember = useStore((s) => s.declineMember)
  const setGrants = useStore((s) => s.setGrants)
  const issues = staffingIssues(season)

  function onAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    addMember(trimmed, newRole, subteams)
    setName('')
    setSubteams([])
    notify(`${trimmed} added — they set their own password on first sign-in`)
  }

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <div className="section-head" style={{ padding: 0 }}>
          <div>
            <h1 className="h1">Roster</h1>
            <div className="lede" style={{ marginTop: 4 }}>
              {season.members.length} members · {pending} invites pending
            </div>
          </div>
          {allow('season.export') && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() =>
                download(
                  `ftc-${season.team.number}-roster.csv`,
                  rosterCsv(season, readContact),
                  'text/csv;charset=utf-8',
                )
              }
            >
              Export CSV
            </Button>
          )}
        </div>
      </div>

      <div className="section">
        {manage ? (
          <div
            style={{
              borderRadius: 18,
              background: '#1a1e14',
              padding: '13px 15px',
              display: 'flex',
              gap: 11,
              alignItems: 'center',
            }}
          >
            <span className="dot dot-live" />
            <span style={{ flex: 1, font: '400 12px/1.5 var(--font-sans)', color: '#d5e3ae' }}>
              Coach tools on. You can add members, set roles and read contact details.
            </span>
          </div>
        ) : (
          <div className="status-strip" style={{ borderRadius: 18 }}>
            <span className="dot" />
            <span style={{ flex: 1 }}>Read-only. Coaches add and remove members.</span>
          </div>
        )}
      </div>

      <div className="cols cols-2">
        {manage && (
          <form onSubmit={onAdd} className="section">
            <div className="card-quiet card-pad">
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
                  <Chip key={r} active={newRole === r} onClick={() => setNewRole(r)}>
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
              <p className="field-note">
                Adding someone creates an invite, not an account. They get the team code and set their own
                password the first time they sign in.
              </p>
            </div>
          </form>
        )}

        {canApprove && requests.length > 0 && (
          <div className="section">
            <div className="label" style={{ marginBottom: 9, color: 'var(--signal)' }}>
              Asking to join · {requests.length}
            </div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {requests.map((request) => (
                <JoinRequest
                  key={request.id}
                  member={request}
                  onAccept={(role) => {
                    approveMember(request.id, role)
                    notify(`${request.name} is on the team`)
                  }}
                  onDecline={() => {
                    declineMember(request.id)
                    notify(`Declined ${request.name}`)
                  }}
                />
              ))}
            </div>
            <p className="field-note">
              Signing in proves who somebody is, not that they are on your team. Nothing is visible to
              them until you accept.
            </p>
          </div>
        )}

        {issues.length > 0 && (
          <div className="section">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className={issue.severity === 'blocking' ? 'card-signal card-pad' : 'card-quiet card-pad'}
                style={{ marginBottom: 9 }}
              >
                <div
                  className="label"
                  style={{ color: issue.severity === 'blocking' ? 'var(--signal)' : 'var(--ink-3)' }}
                >
                  {issue.title}
                </div>
                <p className="meta pretty" style={{ marginTop: 6 }}>
                  {issue.detail}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="section">
          {season.members
            .filter((m) => m.status !== 'requested' && m.status !== 'declined')
            .map((member) => (
            <div key={member.id} className="row">
              <Avatar name={member.name} staff={member.role === 'coach' || member.role === 'mentor'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{member.name}</div>
                <div
                  style={{
                    font: '500 9.5px/1.6 var(--font-mono)',
                    color: 'var(--ink-4)',
                    letterSpacing: '0.1em',
                  }}
                >
                  {ROLE_LABEL[member.role].toUpperCase()}
                  {member.subteams?.length ? ` · ${member.subteams.map((s) => subteamLabel(season, s).toUpperCase()).join(' · ')}` : ''}
                  {member.status === 'active' ? '' : ` · ${MEMBER_STATUS_LABEL[member.status].toUpperCase()}`}
                </div>
              </div>

              {readContact ? (
                <button
                  type="button"
                  className="label"
                  onClick={() => setEditing(member)}
                  style={{
                    flex: 'none',
                    color: 'var(--ink-3)',
                    padding: '5px 9px',
                    borderRadius: 999,
                    border: '1px solid #2a3134',
                  }}
                >
                  {member.contact?.phone || member.contact?.email ? 'CONTACT ON FILE' : 'NO CONTACT'}
                </button>
              ) : (
                <LockedValue shape="•••• ••" title="Coaches and mentors only" />
              )}

              {manage && !isLastStaff(season.members, member.id) && (
                <IconButton label={`Remove ${member.name}`} small onClick={() => removeMember(member.id)}>
                  ×
                </IconButton>
              )}
            </div>
            ))}

          {!readContact && (
            <p className="meta" style={{ marginTop: 14 }}>
              Contact details are visible to coaches and mentors only. Your captain can&rsquo;t see them
              either.
            </p>
          )}
        </div>
      </div>

      {editing && readContact && (
        <MemberSheet
          member={editing}
          lockRole={isLastStaff(season.members, editing.id)}
          canGrant={canGrant}
          onClose={() => setEditing(null)}
          onSave={(patch, grants) => {
            updateMember(editing.id, patch)
            if (grants) setGrants(editing.id, grants)
            setEditing(null)
            notify(`${editing.name} updated`)
          }}
        />
      )}
    </div>
  )
}

function MemberSheet({
  member,
  lockRole,
  canGrant,
  onClose,
  onSave,
}: {
  member: Member
  /** True when this is the only adult left — demoting them locks the team out. */
  lockRole: boolean
  /** Only a coach hands out individual capabilities. */
  canGrant: boolean
  onClose: () => void
  onSave: (patch: Partial<Member>, grants?: Capability[]) => void
}) {
  const [role, setRole] = useState<Role>(member.role)
  const [grants, setGrantsDraft] = useState<Capability[]>(member.grants ?? [])
  const [picked, setPicked] = useState<string[]>(member.subteams ?? [])
  const [email, setEmail] = useState(member.contact?.email ?? '')
  const [phone, setPhone] = useState(member.contact?.phone ?? '')
  const [guardian, setGuardian] = useState(member.contact?.guardian ?? '')
  const [guardianPhone, setGuardianPhone] = useState(member.contact?.guardianPhone ?? '')

  return (
    <Sheet
      title={member.name}
      subtitle="Staff-only record. Nothing here is visible to students."
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          block
          onClick={() =>
            onSave(
              {
                role,
                subteams: picked,
                contact: { email, phone, guardian, guardianPhone },
              },
              canGrant ? grants : undefined,
            )
          }
        >
          Save
        </Button>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            Role
          </div>
          <div className="wrap">
            {ADDABLE_ROLES.map((r) => (
              <Chip
                key={r}
                active={role === r}
                onClick={() => !lockRole && setRole(r)}
                disabled={lockRole && r !== member.role}
              >
                {ROLE_LABEL[r]}
              </Chip>
            ))}
          </div>
          {lockRole && (
            <p className="field-note">
              {member.name} is the only coach or mentor on this team. Add another adult before changing
              this role, or nobody will be able to approve spending.
            </p>
          )}
        </div>

        {canGrant && (
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              Also allowed to
            </div>
            <p className="meta pretty" style={{ marginBottom: 9 }}>
              On top of what a {ROLE_LABEL[role].toLowerCase()} can already do. This is how a trusted
              captain gets the budget, or a treasurer parent gets to approve spending, without pretending
              they are a coach.
            </p>
            <div className="wrap">
              {GRANTABLE.filter((c) => !can(role, c)).map((c) => (
                <Chip
                  key={c}
                  active={grants.includes(c)}
                  onClick={() =>
                    setGrantsDraft((g) => (g.includes(c) ? g.filter((x) => x !== c) : [...g, c]))
                  }
                >
                  {CAPABILITY_LABEL[c] ?? c}
                </Chip>
              ))}
            </div>
            <p className="field-note">
              Handing out coach powers and changing team settings are never grantable — they would let a
              granted account grant itself everything else.
            </p>
          </div>
        )}

        <SubteamPicker value={picked} onChange={setPicked} />

        <Field label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        <Field label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
        <Field label="Guardian" value={guardian} onChange={(e) => setGuardian(e.target.value)} />
        <Field label="Guardian phone" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} type="tel" />
      </div>
    </Sheet>
  )
}


/**
 * One person asking to be let in.
 *
 * The role they picked is shown as their *claim*, editable before accepting,
 * because "I'm a coach" typed into a box is not evidence and the person
 * accepting is the one who knows.
 */
function JoinRequest({
  member,
  onAccept,
  onDecline,
}: {
  member: Member
  onAccept: (role: Role) => void
  onDecline: () => void
}) {
  const [role, setRole] = useState<Role>(member.role)

  return (
    <div style={{ padding: '14px 15px', borderBottom: '1px solid var(--line-soft)' }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <Avatar name={member.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: '500 13px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>{member.name}</div>
          <div className="meta-mono">
            {member.email ?? member.username}
            {member.authProvider ? ` · ${AUTH_PROVIDER_LABEL[member.authProvider].toLowerCase()}` : ''}
          </div>
          {member.requestNote && (
            <p className="meta pretty" style={{ marginTop: 6 }}>
              &ldquo;{member.requestNote}&rdquo;
            </p>
          )}
        </div>
      </div>

      <div className="wrap" style={{ marginTop: 11 }}>
        {(['student', 'captain', 'parent', 'mentor', 'coach'] as Role[]).map((r) => (
          <Chip key={r} active={role === r} onClick={() => setRole(r)}>
            {ROLE_LABEL[r]}
          </Chip>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
        <Button variant="primary" size="sm" block onClick={() => onAccept(role)}>
          Accept as {ROLE_LABEL[role].toLowerCase()}
        </Button>
        <Button size="sm" onClick={onDecline}>
          Decline
        </Button>
      </div>
    </div>
  )
}
