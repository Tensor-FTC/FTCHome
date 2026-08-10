import type { SupabaseClient } from '@supabase/supabase-js'
import { cloudAccessToken, hasCloudSession } from './session'

/**
 * Supabase is a *peer*, never a dependency. Nothing in the UI awaits it: reads
 * come from IndexedDB, writes land in the outbox, and this module drains that
 * outbox when there happens to be signal and a configured project.
 *
 * With no env vars set the app is fully functional and single-device — which is
 * the correct default for a team that has not set up a cloud project yet.
 */

const URL_KEY = 'ftc-home.supabase.url'
// Storage key keeps its original name on purpose: renaming it would silently
// drop the saved key on every device that has already connected a project.
// The value it holds is a publishable key.
const PUBLISHABLE_KEY = 'ftc-home.supabase.anonKey'
const SECRET_KEY = 'ftc-home.supabase.teamSecret'

export interface SupabaseConfig {
  url: string
  /**
   * Supabase's browser-safe key. Modern projects issue `sb_publishable_…`;
   * older ones issue a legacy `anon` JWT starting `eyJ…`. Both are accepted —
   * they go in the same argument slot and neither is validated here.
   *
   * The `sb_secret_…` key (which replaced `service_role`) must NEVER reach
   * this field. It bypasses row-level security and this value ships to the
   * browser.
   */
  publishableKey: string
  /** Shared per-team sync secret. Row-level security keys on this. */
  teamSecret: string
}

/** Env first (deploy-time), then localStorage (runtime, set in Settings). */
export function readConfig(): SupabaseConfig {
  const env = import.meta.env
  const ls = typeof localStorage !== 'undefined' ? localStorage : null
  return {
    url: (env.VITE_SUPABASE_URL as string) || ls?.getItem(URL_KEY) || '',
    publishableKey:
      (env.VITE_SUPABASE_PUBLISHABLE_KEY as string) ||
      ls?.getItem(PUBLISHABLE_KEY) ||
      '',
    teamSecret: ls?.getItem(SECRET_KEY) || '',
  }
}

export function writeConfig(cfg: Partial<SupabaseConfig>): void {
  if (typeof localStorage === 'undefined') return
  if (cfg.url !== undefined) localStorage.setItem(URL_KEY, cfg.url.trim())
  if (cfg.publishableKey !== undefined)
    localStorage.setItem(PUBLISHABLE_KEY, cfg.publishableKey.trim())
  if (cfg.teamSecret !== undefined) localStorage.setItem(SECRET_KEY, cfg.teamSecret.trim())
  client = null
  clientKey = ''
}

/**
 * There are two ways to be authorised for a team's rows, and either is enough.
 *
 *   • **Team secret** — proves a *device* syncs for this team. Works with
 *     nobody signed in, which is what makes a shared pit laptop possible.
 *   • **An account** — proves a *person*, and only counts once a coach has
 *     made them `active`. See the `records_*_member` policies in
 *     0002_accounts.sql.
 *
 * Requiring the secret even when signed in (which this used to do) meant a
 * student who had been approved by their coach still silently never synced
 * until somebody read a UUID out to them. The database always allowed it; the
 * client was the thing saying no.
 */
export function isSupabaseConfigured(): boolean {
  const { url, publishableKey, teamSecret } = readConfig()
  return Boolean(url && publishableKey && (teamSecret || hasCloudSession()))
}

let client: SupabaseClient | null = null
let clientKey = ''

/**
 * Loaded on demand. The client is ~120 KB of JavaScript that a team running
 * single-device never executes, and the spec's hardware constraint is not
 * rhetorical — this keeps it out of the first paint.
 */
export async function getSupabase(): Promise<SupabaseClient | null> {
  const cfg = readConfig()
  if (!cfg.url || !cfg.publishableKey) return null

  const token = cloudAccessToken()
  // Neither route available: no team secret and nobody signed in.
  if (!cfg.teamSecret && !token) return null

  // The token is part of the key so a refresh rebuilds the client rather than
  // leaving a stale Bearer header on every request.
  const key = `${cfg.url}|${cfg.publishableKey}|${cfg.teamSecret}|${token ?? ''}`
  if (client && clientKey === key) return client

  try {
    const { createClient } = await import('@supabase/supabase-js')
    client = createClient(cfg.url, cfg.publishableKey, {
      // This client never manages a session of its own — auth.ts owns that.
      // The token is injected below instead, so the two cannot fight over
      // storage or refresh timers.
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          // Device route: RLS reads this to scope rows to one team.
          // See supabase/migrations/0001_init.sql.
          ...(cfg.teamSecret ? { 'x-team-secret': cfg.teamSecret } : {}),
          // Account route: makes auth.uid() resolve, so my_teams() can match.
          // Without this the signed-in policies in 0002 never fire.
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    })
    clientKey = key
    return client
  } catch {
    client = null
    return null
  }
}

/** Round-trips one cheap query so Settings can show a real verdict, not a guess. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const sb = await getSupabase()
  if (!sb)
    return {
      ok: false,
      message: 'Not configured — add a project URL, publishable key and team secret.',
    }
  try {
    const { error } = await sb.from('records').select('id').limit(1)
    if (error) return { ok: false, message: error.message }
    return { ok: true, message: 'Connected. Row-level security accepted the team secret.' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unreachable' }
  }
}
