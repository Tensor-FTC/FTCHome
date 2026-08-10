/**
 * The signed-in user's access token, cached synchronously.
 *
 * Exists as its own module purely to break an import cycle: `auth.ts` needs
 * `readConfig` from `supabase.ts`, and `supabase.ts` needs to know whether
 * somebody is signed in. Both depend on this instead of each other.
 *
 * `auth.ts` is the only writer — it keeps this in step with Supabase's own
 * `onAuthStateChange`, so a token refresh lands here too.
 */

let accessToken: string | undefined

export function setCloudSession(token: string | undefined): void {
  accessToken = token
}

/**
 * Synchronous on purpose. `isSupabaseConfigured()` is called during render in
 * several screens, and an async check there would either block paint or flip
 * the UI a frame later.
 */
export function hasCloudSession(): boolean {
  return Boolean(accessToken)
}

export function cloudAccessToken(): string | undefined {
  return accessToken
}
