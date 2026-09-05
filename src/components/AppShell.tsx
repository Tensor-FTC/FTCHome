import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Rail, TabBar } from './Nav'
import { Countdown } from './Countdown'
import { SearchPalette, useSearchHotkey } from './SearchPalette'
import { useStore, currentMember } from '@/store/useStore'
import { isHoldingAdmin } from '@/domain/founder'
import { watchTeamRecords } from '@/lib/realtime'
import { ago } from '@/lib/format'
import { canSync } from '@/lib/sync'
import { matchClock } from '@/domain/matchClock'
import { useNow } from '@/lib/useNow'
import { ROLE_LABEL } from '@/domain/types'

/**
 * Screens where the countdown may dock. It is an event-time element, not chrome
 * — and even here it only appears when there is a real match to count down to.
 */
const COUNTDOWN_ROUTES = ['/today', '/calendar', '/weekly', '/build', '/live', '/events']

export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const session = useStore((s) => s.session)
  const member = useStore(currentMember)
  const holdingAdmin = isHoldingAdmin(member, season.members)
  const online = useStore((s) => s.online)
  const syncing = useStore((s) => s.syncing)
  const sync = useStore((s) => s.sync)
  const endRolePreview = useStore((s) => s.endRolePreview)

  const settings = season.settings
  const offline = !online || settings.simulateOffline

  // One clock for the whole app. Only subscribes while a countdown route is
  // open, so Settings and Roster do not re-render once a second for nothing.
  const onCountdownRoute = COUNTDOWN_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))
  const now = useNow(onCountdownRoute ? 1000 : 60_000)
  const clock = useMemo(() => (onCountdownRoute ? matchClock(season, now) : null), [onCountdownRoute, season, now])
  const showCountdown = clock !== null

  const [searchOpen, setSearchOpen] = useState(false)
  useSearchHotkey(useCallback(() => setSearchOpen(true), []))

  /*
   * Live updates, with a slow timer behind them.
   *
   * The socket is the real mechanism: a change on any device lands here in
   * about a second. The interval is a safety net for the cases a socket
   * quietly dies — a phone that slept, a captive portal, a proxy that killed
   * an idle connection — and is deliberately slow, because with realtime
   * working it should almost never be the thing that finds anything.
   */
  useEffect(() => {
    if (!canSync() || offline) return
    void sync()

    /*
     * Subscribing is async, so the effect can be torn down before the channel
     * exists — a quick offline/online flip, or a team number changing. Without
     * the flag the unsubscribe ran against nothing and the channel that
     * arrived a moment later was never closed, leaking one socket per flip.
     */
    let live = true
    let stop: (() => void) | undefined
    void watchTeamRecords(season.team.number, () => void sync()).then((fn) => {
      if (live) stop = fn
      else fn()
    })

    const id = setInterval(() => {
      if (canSync() && !offline) void sync()
    }, 2 * 60_000)

    return () => {
      live = false
      stop?.()
      clearInterval(id)
    }
  }, [sync, offline, season.team.number])

  // A phone that has been asleep has missed everything; catch up on return.
  useEffect(() => {
    function onWake() {
      if (document.visibilityState === 'visible' && canSync() && !offline) void sync()
    }
    document.addEventListener('visibilitychange', onWake)
    return () => document.removeEventListener('visibilitychange', onWake)
  }, [sync, offline])

  return (
    <div className="shell" data-alliance={clock?.alliance ?? 'red'}>
      <Rail />

      <div className="main">
        {/*
         * Previewing a lower role removes settings.manage, which used to hide
         * the very panel holding the way out — so the exit lives here, outside
         * every permission gate, and is reachable from any screen.
         */}
        {session.previewOf && (
          <div className="preview-bar" role="status">
            <span>
              Viewing as <strong>{ROLE_LABEL[session.role].toLowerCase()}</strong>. This is a preview —
              nothing you do changes anyone&rsquo;s access.
            </span>
            <button type="button" onClick={endRolePreview}>
              Back to my view
            </button>
          </div>
        )}

        {/*
         * Said once, here, and only while it is true. It used to be repeated on
         * several screens, which turned a useful fact into nagging — and it
         * disappears on its own the moment a coach or mentor is active, because
         * the condition is derived rather than dismissed.
         */}
        {holdingAdmin && (
          <div className="preview-bar" role="status">
            <span>
              You are running {season.team.number} on your own. Add a coach or mentor and this hands
              over automatically — you stay a {ROLE_LABEL[member!.role].toLowerCase()}.
            </span>
            <button type="button" onClick={() => navigate('/roster')}>
              Add a coach
            </button>
          </div>
        )}

        <header className="statusbar">
          <span>{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="button" className="conn" aria-label="Search the season" onClick={() => setSearchOpen(true)}>
              ⌕
            </button>
            <span className="conn">
              <span className={`dot ${offline ? '' : 'dot-live'}`} />
              {offline ? `CACHED ${ago(settings.lastSyncAt).toUpperCase()}` : 'LIVE'}
            </span>
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
              className="btn btn-sm"
              onClick={() => setSearchOpen(true)}
              style={{ gap: 10, color: 'var(--ink-4)', background: 'var(--srf-1)' }}
            >
              Search
              <kbd className="mono" style={{ fontSize: 10, color: 'var(--ink-5)' }}>
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              className="conn"
              onClick={() => navigate('/states')}
              title="Connection and queued writes"
            >
              <span className={`dot ${offline ? '' : 'dot-live'}`} />
              {syncing ? 'SYNCING' : offline ? `CACHED ${ago(settings.lastSyncAt).toUpperCase()}` : 'LIVE'}
            </button>
            {clock && <Countdown clock={clock} />}
          </div>
        </div>

        {/*
         * Offline is a persistent grey strip, never a red banner and never a
         * modal. With no internet nothing is broken — the only thing that changes when
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

      {clock && (
        <div className="cd-mobile-only">
          <Countdown clock={clock} />
        </div>
      )}
      <TabBar />
      <Toaster />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
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
