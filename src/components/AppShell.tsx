import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Rail, TabBar } from './Nav'
import { Countdown } from './Countdown'
import { useStore, currentMember } from '@/store/useStore'
import { ago } from '@/lib/format'
import { matchAlerts } from '@/lib/notifications'
import { canSync } from '@/lib/sync'
import { ROLE_LABEL } from '@/domain/types'

/** Screens where the countdown is docked. It is an event-time element, not a chrome element. */
const COUNTDOWN_ROUTES = ['/today', '/calendar', '/weekly', '/build', '/live', '/events']

export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const session = useStore((s) => s.session)
  const member = useStore(currentMember)
  const online = useStore((s) => s.online)
  const syncing = useStore((s) => s.syncing)
  const tick = useStore((s) => s.tickMatchClock)
  const sync = useStore((s) => s.sync)

  const settings = season.settings
  const offline = !online || settings.simulateOffline
  const showCountdown = COUNTDOWN_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))

  // One interval for the whole app. The clock keeps time even on screens that
  // do not show it, so switching tabs never resets the count.
  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tick])

  useEffect(() => {
    if (!settings.notificationsEnabled) return
    matchAlerts.tick(
      settings.matchLabel,
      settings.matchField,
      settings.alliance,
      settings.matchSeconds,
      settings.notifyLeadSeconds,
    )
  }, [
    settings.notificationsEnabled,
    settings.matchLabel,
    settings.matchField,
    settings.alliance,
    settings.matchSeconds,
    settings.notifyLeadSeconds,
  ])

  // Opportunistic sync: on mount, and every five minutes when there is signal.
  useEffect(() => {
    if (canSync() && !offline) void sync()
    const id = setInterval(() => {
      if (canSync() && !offline) void sync()
    }, 5 * 60_000)
    return () => clearInterval(id)
  }, [sync, offline])

  return (
    <div className="shell" data-alliance={settings.alliance}>
      <Rail />

      <div className="main">
        <header className="statusbar">
          <span>{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          <span className="conn">
            <span className={`dot ${offline ? '' : 'dot-live'}`} />
            {offline ? `CACHED ${ago(settings.lastSyncAt).toUpperCase()}` : 'LIVE'}
          </span>
        </header>

        <div className="topbar">
          <div>
            <div className="label">
              {season.team.number} · {season.team.name}
            </div>
            <div style={{ font: '600 15px var(--font-sans)', color: 'var(--ink)', marginTop: 3 }}>
              {member?.name ?? (session.guest ? 'Browsing as guest' : 'Not signed in')}
              <span className="label" style={{ display: 'inline', marginLeft: 8 }}>
                {ROLE_LABEL[session.role].toUpperCase()}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              className="conn"
              onClick={() => navigate('/states')}
              title="Connection and queued writes"
            >
              <span className={`dot ${offline ? '' : 'dot-live'}`} />
              {syncing ? 'SYNCING' : offline ? `CACHED ${ago(settings.lastSyncAt).toUpperCase()}` : 'LIVE'}
            </button>
            {showCountdown && <Countdown />}
          </div>
        </div>

        {/*
         * Offline is a persistent grey strip, never a red banner and never a
         * modal. In a gym nothing is broken — the only thing that changes when
         * signal returns is the timestamp.
         */}
        {offline && (
          <div className="offline-strip" role="status">
            <span className="dot" />
            <span>
              Working from cache · last sync {ago(settings.lastSyncAt)}. Everything here works offline.
            </span>
          </div>
        )}

        <main className={showCountdown ? 'body' : 'body body-no-cd'}>
          <Outlet />
        </main>
      </div>

      {showCountdown && (
        <div className="cd-mobile-only">
          <Countdown />
        </div>
      )}
      <TabBar />
      <Toaster />
    </div>
  )
}

function Toaster() {
  const toast = useStore((s) => s.toast)
  const dismiss = useStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(dismiss, 4200)
    return () => clearTimeout(id)
  }, [toast, dismiss])

  if (!toast) return null
  return (
    <div className={`toast ${toast.tone === 'warn' ? 'toast-warn' : ''}`} role="status" aria-live="polite">
      {toast.text}
    </div>
  )
}
