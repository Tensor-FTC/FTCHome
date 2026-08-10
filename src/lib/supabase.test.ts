import { beforeEach, describe, expect, it } from 'vitest'
import { isSupabaseConfigured, writeConfig } from './supabase'
import { setCloudSession } from './session'

/**
 * Either route is enough to sync: a team secret on the device, or an approved
 * account. Requiring both meant a student whose coach had already accepted
 * them still silently never synced — the database allowed it, the client did
 * not.
 */
describe('isSupabaseConfigured', () => {
  beforeEach(() => {
    localStorage.clear()
    setCloudSession(undefined)
  })

  it('is false with nothing set', () => {
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('is false with a project but neither a secret nor a session', () => {
    writeConfig({ url: 'https://x.supabase.co', publishableKey: 'sb_publishable_x', teamSecret: '' })
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('is true on the device route — team secret, nobody signed in', () => {
    writeConfig({
      url: 'https://x.supabase.co',
      publishableKey: 'sb_publishable_x',
      teamSecret: 'secret-uuid',
    })
    expect(isSupabaseConfigured()).toBe(true)
  })

  it('is true on the account route — signed in, no team secret', () => {
    writeConfig({ url: 'https://x.supabase.co', publishableKey: 'sb_publishable_x', teamSecret: '' })
    setCloudSession('jwt-access-token')
    expect(isSupabaseConfigured()).toBe(true)
  })

  it('still needs a project even when signed in', () => {
    setCloudSession('jwt-access-token')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('drops back to unconfigured on sign-out when there is no team secret', () => {
    writeConfig({ url: 'https://x.supabase.co', publishableKey: 'sb_publishable_x', teamSecret: '' })
    setCloudSession('jwt-access-token')
    expect(isSupabaseConfigured()).toBe(true)

    setCloudSession(undefined)
    expect(isSupabaseConfigured()).toBe(false)
  })
})
