import { useState, type FormEvent } from 'react'
import { Avatar, Button, Chip, Field, IconButton, LockedValue, Sheet, TextArea } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { ROLE_LABEL, SUBTEAM_LABEL, type Member, type Role, type Subteam } from '@/domain/types'
import { download, rosterCsv } from '@/lib/exporters'

const ADDABLE_ROLES: Role[] = ['student', 'captain', 'mentor', 'coach', 'parent']

/**
 * R1 · Roster
 *
 * Who is on the team, what they do, and who is still pending.
 *
 * Medical records show as a real value for mentors and as a dashed withheld chip
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
  const [subteam, setSubteam] = useState<Subteam | ''>('')
  const [editing, setEditing] = useState<Member | null>(null)

  const manage = allow('roster.manage')
  const readMedical = allow('roster.readContact')
  const pending = season.members.filter((m) => m.pending).length

  function onAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    addMember(trimmed, newRole, subteam || undefined)
    setName('')
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
                  rosterCsv(season, readMedical),
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
              Coach tools on. You can add members, set roles and read medical records.
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
              <div className="wrap" style={{ marginBottom: 11 }}>
                <Chip active={subteam === ''} onClick={() => setSubteam('')}>
                  No subteam
                </Chip>
                {(Object.keys(SUBTEAM_LABEL) as Subteam[]).map((s) => (
                  <Chip key={s} active={subteam === s} onClick={() => setSubteam(s)}>
                    {SUBTEAM_LABEL[s]}
                  </Chip>
                ))}
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

        <div className="section">
          {season.members.map((member) => (
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
                  {member.subteam ? ` · ${SUBTEAM_LABEL[member.subteam].toUpperCase()}` : ''}
                  {member.pending ? ' · INVITE PENDING' : ''}
                </div>
              </div>

              {readMedical ? (
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
                  {member.medical ? 'MEDICAL ON FILE' : 'NO RECORD'}
                </button>
              ) : (
                <LockedValue shape="•••• ••" title="Mentors and the listed guardian only" />
              )}

              {manage && member.role !== 'coach' && (
                <IconButton label={`Remove ${member.name}`} small onClick={() => removeMember(member.id)}>
                  ×
                </IconButton>
              )}
            </div>
          ))}

          {!readMedical && (
            <p className="meta" style={{ marginTop: 14 }}>
              Medical and contact records are visible to mentors and the listed guardian only. Your captain
              can&rsquo;t see them either.
            </p>
          )}
        </div>
      </div>

      {editing && readMedical && (
        <MemberSheet
          member={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateMember(editing.id, patch)
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
  onClose,
  onSave,
}: {
  member: Member
  onClose: () => void
  onSave: (patch: Partial<Member>) => void
}) {
  const [role, setRole] = useState<Role>(member.role)
  const [subteam, setSubteam] = useState<Subteam | ''>(member.subteam ?? '')
  const [email, setEmail] = useState(member.contact?.email ?? '')
  const [phone, setPhone] = useState(member.contact?.phone ?? '')
  const [allergies, setAllergies] = useState(member.medical?.allergies ?? '')
  const [notes, setNotes] = useState(member.medical?.notes ?? '')
  const [guardian, setGuardian] = useState(member.medical?.guardian ?? '')
  const [guardianPhone, setGuardianPhone] = useState(member.medical?.guardianPhone ?? '')

  return (
    <Sheet
      title={member.name}
      subtitle="Mentor-only record. Nothing here is visible to students."
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          block
          onClick={() =>
            onSave({
              role,
              subteam: subteam || undefined,
              contact: { email, phone },
              medical: { allergies, notes, guardian, guardianPhone },
            })
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
              <Chip key={r} active={role === r} onClick={() => setRole(r)}>
                {ROLE_LABEL[r]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            Subteam
          </div>
          <div className="wrap">
            <Chip active={subteam === ''} onClick={() => setSubteam('')}>
              None
            </Chip>
            {(Object.keys(SUBTEAM_LABEL) as Subteam[]).map((s) => (
              <Chip key={s} active={subteam === s} onClick={() => setSubteam(s)}>
                {SUBTEAM_LABEL[s]}
              </Chip>
            ))}
          </div>
        </div>

        <Field label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        <Field label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
        <Field label="Guardian" value={guardian} onChange={(e) => setGuardian(e.target.value)} />
        <Field label="Guardian phone" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} type="tel" />
        <Field label="Allergies" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
        <TextArea label="Medical notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  )
}
