import { getSupabase } from './supabase'
import { hasCloudSession } from './session'
import { acceptInvite, clearPendingInvite, pendingInvite } from './invites'

/**
 * Server-side team membership.
 *
 * The database decides what a signed-in person may sync: `my_teams()` reads
 * `team_members`, and the `records_*_member` policies in 0002_accounts.sql
 * grant nothing to somebody with no row there.
 *
 * Nothing used to write that row. `claim_team()` was in the migration and was
 * never called, so a person who signed in with Google became a coach *on their
 * own device* and stayed a stranger to the database. Every push then came back
 * `new row violates row-level security policy for table "records"`, which reads
 * like a misconfiguration and is really a missing insert.
 *
 * So the local roster and the server's membership table are two halves of one
 * fact and have to be written together. This module owns the server half.
 *
 * None of it applies to the team-secret route: a shared pit laptop with no
 * account syncs on the header alone, and has no `auth.uid()` to record.
 */

export type MembershipStatus = 'invited' | 'requested' | 'active' | 'declined' | 'suspended'

export interface MembershipState {
  /** True when this device may write records for the team. */
  ok: boolean
  status?: MembershipStatus
  /** Set when the team was empty and this caller became its first member. */
  claimed?: boolean
  message?: string
}

/** Roles the request policy will accept. `guest` is deliberately not one. */
const REQUESTABLE = ['student', 'captain', 'parent', 'mentor', 'coach']

/**
 * Make sure the signed-in user has a row on this team, creating one if not.
 *
 * Runs before every push. It is a cheap select in the common case — a person
 * who is already active short-circuits on the first query — and the expensive
 * paths only happen once per account per team.
 */
export async function ensureMembership(
  teamNumber: string,
  displayName: string,
  role = 'student',
): Promise<MembershipState> {
  // The device route authorises on a header; there is no user to enrol.
  if (!hasCloudSession()) return { ok: true }
  if (!teamNumber) return { ok: false, message: 'No team number yet.' }

  const sb = await getSupabase()
  if (!sb) return { ok: false, message: 'Sync client could not be created.' }

  // `team_members_read_own` scopes this to the caller, so no filter on user id
  // is needed — and adding one would mean trusting the client to know its own
  // uid, which it should not have to.
  const { data, error } = await sb
    .from('team_members')
    .select('status')
    .eq('team_number', teamNumber)
    .limit(1)

  if (error) return { ok: false, message: error.message }

  const status = data?.[0]?.status as MembershipStatus | undefined
  if (status === 'active') return { ok: true, status }
  if (status) {
    // Requested, declined or suspended: all mean "not yet", and none of them
    // are fixed by asking again.
    return { ok: false, status, message: waitingMessage(status) }
  }

  return enrol(sb, teamNumber, displayName, role)
}

/**
 * No row yet, so this is either the first person on the team or somebody
 * asking to join an existing one. Try to claim; fall back to a request.
 *
 * Claiming is attempted first because only the database can say whether a team
 * is empty — checking from here would be a race, and `claim_team` already
 * refuses when anybody is active.
 */
async function enrol(
  sb: NonNullable<Awaited<ReturnType<typeof getSupabase>>>,
  teamNumber: string,
  displayName: string,
  role: string,
): Promise<MembershipState> {
  /*
   * An invite first, if one is waiting. Somebody a coach has already named
   * should not land in the approval queue to be named again — that is the
   * entire difference between being invited and asking.
   */
  const code = pendingInvite()
  if (code) {
    const redeemed = await acceptInvite(code)
    // Cleared either way: a code that has expired or been used up will not
    // start working later, and retrying it every sync would be noise.
    clearPendingInvite()
    if (redeemed.ok) return { ok: true, status: 'active' }
  }

  const { error: claimError } = await sb.rpc('claim_team', {
    p_team_number: teamNumber,
    p_display_name: displayName,
  })
  if (!claimError) return { ok: true, status: 'active', claimed: true }

  const { error: requestError } = await sb.from('team_members').insert({
    team_number: teamNumber,
    member_id: `mem-${crypto.randomUUID().replace(/-/g, '')}`,
    role: REQUESTABLE.includes(role) ? role : 'student',
    status: 'requested',
    display_name: displayName,
  })

  // A duplicate means a row appeared between the select and here — two tabs,
  // or a retry. That is the state we wanted, not a failure.
  if (requestError && !isDuplicate(requestError)) {
    return { ok: false, message: requestError.message }
  }
  return { ok: false, status: 'requested', message: waitingMessage('requested') }
}

/**
 * Push a staff decision about somebody else.
 *
 * Approving in the app has to reach the database or the person stays locked
 * out of sync while their device tells them they are on the team. RLS enforces
 * that only staff can do this, so an ordinary member calling it fails
 * harmlessly.
 */
export async function pushMemberDecision(
  teamNumber: string,
  authUserId: string,
  status: MembershipStatus,
  role?: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!hasCloudSession()) return { ok: true }
  const sb = await getSupabase()
  if (!sb) return { ok: false, message: 'Sync client could not be created.' }

  const patch: Record<string, unknown> = { status }
  if (role) patch.role = role
  if (status === 'active') patch.approved_at = new Date().toISOString()

  const { error } = await sb
    .from('team_members')
    .update(patch)
    .eq('team_number', teamNumber)
    .eq('user_id', authUserId)

  return error ? { ok: false, message: error.message } : { ok: true }
}

function isDuplicate(error: { code?: string; message?: string }): boolean {
  return error.code === '23505' || Boolean(error.message?.includes('duplicate key'))
}

function waitingMessage(status: MembershipStatus): string {
  if (status === 'requested' || status === 'invited')
    return 'Waiting for somebody on the team to accept you. Everything is saved on this device meanwhile.'
  if (status === 'declined') return 'This team declined the request.'
  return 'This account is suspended on this team.'
}
