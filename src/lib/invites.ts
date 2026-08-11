import { getSupabase } from './supabase'
import { hasCloudSession } from './session'

/**
 * Invites.
 *
 * `0003_invites.sql` shipped `create_invite`, `accept_invite` and `my_invites`
 * and nothing called any of them, so the only way onto a team was to ask and
 * wait for somebody to notice. An invite is the other half: a coach who
 * *already* knows who is joining should not have to approve them twice.
 *
 * The code is the whole credential, so it is short-lived, use-limited and
 * checked by the database rather than by this file. Everything here is a thin
 * wrapper — the rules live in the migration, where a modified client cannot
 * reach them.
 */

const PENDING_KEY = 'ftc-home.pendingInvite'

export interface Invite {
  id: string
  code: string
  email: string | null
  role: string
  expiresAt: string
}

export interface InviteResult {
  ok: boolean
  message: string
  invite?: Invite
}

/** Mint a code. Only staff may — the database refuses anybody else. */
export async function createInvite(
  teamNumber: string,
  role: string,
  options: { email?: string; note?: string; maxUses?: number } = {},
): Promise<InviteResult> {
  const sb = await getSupabase()
  if (!sb) return { ok: false, message: 'Connect a Supabase project first — Settings → Sync.' }

  const { data, error } = await sb.rpc('create_invite', {
    p_team_number: teamNumber,
    p_role: role,
    p_email: options.email?.trim() || null,
    p_note: options.note?.trim() || null,
    p_max_uses: options.maxUses ?? 1,
  })
  if (error) return { ok: false, message: error.message }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { ok: false, message: 'The invite was not created.' }
  return {
    ok: true,
    message: 'Invite ready.',
    invite: {
      id: row.id,
      code: row.code,
      email: row.email,
      role: row.role,
      expiresAt: row.expires_at,
    },
  }
}

/**
 * Redeem a code for the signed-in account.
 *
 * Safe to call when there is no code or no session — both are the ordinary
 * case, since this runs on the way into a sync.
 */
export async function acceptInvite(code: string): Promise<{ ok: boolean; message?: string }> {
  if (!code || !hasCloudSession()) return { ok: false }
  const sb = await getSupabase()
  if (!sb) return { ok: false, message: 'Sync client could not be created.' }

  const { error } = await sb.rpc('accept_invite', { p_code: code.trim().toUpperCase() })
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}

/*
 * Somebody types a code *before* signing in — they have to, it is on the join
 * screen — and then leaves for Google and comes back. The code has to survive
 * that round trip, so it is parked in localStorage rather than in React state
 * or a query string, where a provider redirect would drop it.
 */

export function rememberInvite(code: string): void {
  try {
    localStorage.setItem(PENDING_KEY, code.trim().toUpperCase())
  } catch {
    /* Private mode. They can still ask to join the ordinary way. */
  }
}

export function pendingInvite(): string {
  try {
    return localStorage.getItem(PENDING_KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    /* Nothing to clear. */
  }
}

/*
 * The role somebody picked before signing in.
 *
 * Same problem as the invite code: it is chosen on the sign-up form, and then
 * the browser leaves for Google and comes back to a fresh page. React state
 * does not survive that, so it is parked here.
 */

const ROLE_KEY = 'ftc-home.claimedRole'

export function rememberClaimedRole(role: string): void {
  try {
    localStorage.setItem(ROLE_KEY, role)
  } catch {
    /* Private mode. They will be filed as a student and a coach can fix it. */
  }
}

export function claimedRole(): string {
  try {
    return localStorage.getItem(ROLE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearClaimedRole(): void {
  try {
    localStorage.removeItem(ROLE_KEY)
  } catch {
    /* Nothing to clear. */
  }
}
