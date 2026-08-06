import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase is a *peer*, never a dependency. Nothing in the UI awaits it: reads
 * come from IndexedDB, writes land in the outbox, and this module drains that
 * outbox when there happens to be signal and a configured project.
 *
 * With no env vars set the app is fully functional and single-device — which is
 * the correct default for a team that has not set up a cloud project yet.
 */

const URL_KEY = 'ftc-home.supabase.url'
const ANON_KEY = 'ftc-home.supabase.anonKey'
const SECRET_KEY = 'ftc-home.supabase.teamSecret'

export interface SupabaseConfig {
  url: string
  anonKey: string
  /** Shared per-team sync secret. Row-level security keys on this. */
  teamSecret: string
}

/** Env first (deploy-time), then localStorage (runtime, set in Settings). */
export function readConfig(): SupabaseConfig {
  const env = import.meta.env
  const ls = typeof localStorage !== 'undefined' ? localStorage : null
  return {
    url: (env.VITE_SUPABASE_URL as string) || ls?.getItem(URL_KEY) || '',
    anonKey: (env.VITE_SUPABASE_ANON_KEY as string) || ls?.getItem(ANON_KEY) || '',
    teamSecret: ls?.getItem(SECRET_KEY) || '',
  }
}

export function writeConfig(cfg: Partial<SupabaseConfig>): void {
  if (typeof localStorage === 'undefined') return
  if (cfg.url !== undefined) localStorage.setItem(URL_KEY, cfg.url.trim())
  if (cfg.anonKey !== undefined) localStorage.setItem(ANON_KEY, cfg.anonKey.trim())
  if (cfg.teamSecret !== undefined) localStorage.setItem(SECRET_KEY, cfg.teamSecret.trim())
  client = null
  clientKey = ''
}

const ENROLLED_KEY = 'ftc-home.deviceEnrolled'

/**
 * Whether this device has already been let onto the team.
 *
 * The shared code is a *device enrolment* secret, not a password: it is asked
 * once, when a device first joins a team that has no cloud accounts, and never
 * again. Treating it as a login is what made it look pointless — because it
 * was. Individual identity is a personal password or a real account.
 */
export function isDeviceEnrolled(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(ENROLLED_KEY) === '1'
}

export function markDeviceEnrolled(): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(ENROLLED_KEY, '1')
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey, teamSecret } = readConfig()
  return Boolean(url && anonKey && teamSecret)
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
  if (!cfg.url || !cfg.anonKey || !cfg.teamSecret) return null
  const key = `${cfg.url}|${cfg.anonKey}|${cfg.teamSecret}`
  if (client && clientKey === key) return client
  try {
    const { createClient } = await import('@supabase/supabase-js')
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      // RLS reads this header to scope every row to one team. See
      // supabase/migrations/0001_init.sql.
      global: { headers: { 'x-team-secret': cfg.teamSecret } },
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
  if (!sb) return { ok: false, message: 'Not configured — add a project URL, anon key and team secret.' }
  try {
    const { error } = await sb.from('records').select('id').limit(1)
    if (error) return { ok: false, message: error.message }
    return { ok: true, message: 'Connected. Row-level security accepted the team secret.' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unreachable' }
  }
}
