import type { Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js'
import { readConfig } from './supabase'
import type { AuthProvider } from '@/domain/types'

/**
 * Real accounts, when a team wants them.
 *
 * Two things are deliberately kept apart here:
 *
 *  - **Identity** — who you are. Email and password, an email link, Google or
 *    GitHub, all through Supabase Auth. Needs the project URL and anon key, and
 *    needs the network at the moment you sign in.
 *  - **Belonging** — which team you are on and what you may do there. That is
 *    the roster, and a coach decides it. Signing in proves who you are and
 *    nothing else; see `requestToJoin` in the store.
 *
 * A team with no Supabase project still gets accounts — they are just local to
 * one device, with the password hashed on it. There is no shared team secret in
 * either path: one string everybody knows protects nothing that individual
 * passwords and a coach's approval do not already cover.
 */

export const OAUTH_PROVIDERS = ['google', 'github'] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

export interface AuthUser {
  id: string
  email: string
  name?: string
  avatarUrl?: string
  provider: AuthProvider
}

export interface AuthResult {
  ok: boolean
  message: string
  user?: AuthUser
  /** True when the user must go and click a link before anything happens. */
  awaitingEmail?: boolean
}

/**
 * Auth needs only the project URL and anon key — not the team secret, which is
 * a *sync* credential. A team can therefore have real accounts before anybody
 * has run the sync migration, which is the order people actually do it in.
 */
export function isAuthConfigured(): boolean {
  const { url, anonKey } = readConfig()
  return Boolean(url && anonKey)
}

let authClient: SupabaseClient | null = null
let authKey = ''

/**
 * A client scoped to auth only. The sync client sends a team-secret header on
 * every request; mixing that into sign-in would leak a team credential into
 * requests that have nothing to do with a team.
 */
async function getAuthClient(): Promise<SupabaseClient | null> {
  const { url, anonKey } = readConfig()
  if (!url || !anonKey) return null
  const key = `${url}|${anonKey}`
  if (authClient && authKey === key) return authClient
  const { createClient } = await import('@supabase/supabase-js')
  authClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  authKey = key
  return authClient
}

function toUser(session: SupabaseSession | null, fallback: AuthProvider = 'password'): AuthUser | undefined {
  const u = session?.user
  if (!u?.id) return undefined
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const provider = (u.app_metadata?.provider as string) ?? fallback
  return {
    id: u.id,
    email: u.email ?? '',
    name: typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : undefined,
    avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined,
    provider: (['google', 'github', 'magic-link'] as string[]).includes(provider)
      ? (provider as AuthProvider)
      : 'password',
  }
}

const NOT_CONFIGURED: AuthResult = {
  ok: false,
  message: 'No Supabase project is connected yet, so cloud accounts are unavailable. Settings → Sync.',
}

/** Whoever is signed in on this device right now, if anyone. */
export async function currentAuthUser(): Promise<AuthUser | null> {
  const client = await getAuthClient()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return toUser(data.session) ?? null
}

export async function signUpWithEmail(email: string, password: string, name: string): Promise<AuthResult> {
  const client = await getAuthClient()
  if (!client) return NOT_CONFIGURED
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo() },
  })
  if (error) return { ok: false, message: error.message }
  // With email confirmation on — the sensible setting — there is no session yet.
  if (!data.session) {
    return { ok: true, awaitingEmail: true, message: `Check ${email} for a link to confirm the account.` }
  }
  return { ok: true, message: 'Account created.', user: toUser(data.session) }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const client = await getAuthClient()
  if (!client) return NOT_CONFIGURED
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Signed in.', user: toUser(data.session) }
}

/** No password at all: a link in the inbox. Kinder for parents and students. */
export async function signInWithLink(email: string): Promise<AuthResult> {
  const client = await getAuthClient()
  if (!client) return NOT_CONFIGURED
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo() },
  })
  if (error) return { ok: false, message: error.message }
  return { ok: true, awaitingEmail: true, message: `Sent a sign-in link to ${email}.` }
}

export async function signInWithProvider(provider: OAuthProvider): Promise<AuthResult> {
  const client = await getAuthClient()
  if (!client) return NOT_CONFIGURED
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectTo() },
  })
  // On success the browser is already navigating away; nothing after this runs.
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Redirecting…' }
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const client = await getAuthClient()
  if (!client) return NOT_CONFIGURED
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() })
  if (error) return { ok: false, message: error.message }
  return { ok: true, awaitingEmail: true, message: `Sent a reset link to ${email}.` }
}

export async function signOutOfCloud(): Promise<void> {
  const client = await getAuthClient()
  await client?.auth.signOut()
}

/**
 * Where a provider sends the browser back to.
 *
 * The app is often served from a subpath (GitHub Pages), so this has to be the
 * deployed base rather than the origin, or the round trip lands on a 404.
 */
function redirectTo(): string {
  if (typeof globalThis.location === 'undefined') return ''
  const base = import.meta.env.BASE_URL || '/'
  return `${globalThis.location.origin}${base}`.replace(/\/+$/, '/')
}

/**
 * Whether the URL we were opened with is a provider coming back.
 *
 * Supabase strips its own hash once `detectSessionInUrl` has consumed it, so
 * this is only used to decide whether to wait for that before deciding a person
 * is signed out.
 */
export function looksLikeAuthCallback(): boolean {
  if (typeof globalThis.location === 'undefined') return false
  const { hash, search } = globalThis.location
  return /access_token=|error_description=|[?&]code=/.test(hash + search)
}
