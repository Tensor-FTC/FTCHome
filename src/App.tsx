import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { useStore, flushPendingSave } from '@/store/useStore'
import { requestPersistence } from '@/lib/media'
import { BrandLaunch, Wordmark } from '@/components/Brand'
import { currentAuthUser, isAuthConfigured, looksLikeAuthCallback } from '@/lib/auth'
import { watchSystemTheme } from '@/lib/appearance'

import { LaunchScreen } from '@/screens/Launch'
import { SignInScreen } from '@/screens/auth/SignIn'
import { WhoAreYouScreen } from '@/screens/auth/WhoAreYou'
import { PersonalSignInScreen } from '@/screens/auth/PersonalSignIn'
import { MentorSignInScreen } from '@/screens/auth/MentorSignIn'
import { RegisterScreen } from '@/screens/auth/Register'
import { GuestOnboardingScreen } from '@/screens/GuestOnboarding'
import { PartsScreen } from '@/screens/Parts'
import { TeamIdentityScreen } from '@/screens/TeamIdentity'
import { TodayScreen } from '@/screens/Today'
import { CalendarScreen } from '@/screens/Calendar'
import { CalendarEditorScreen } from '@/screens/CalendarEditor'
import { EventDetailScreen } from '@/screens/EventDetail'
import { WeeklyScreen } from '@/screens/Weekly'
import { BuildLogScreen } from '@/screens/BuildLog'
import { LiveEventScreen } from '@/screens/LiveEvent'
import { CompetitionModeScreen } from '@/screens/CompetitionMode'
import { RosterScreen } from '@/screens/Roster'
import { BudgetScreen } from '@/screens/Budget'
import { ArchiveScreen } from '@/screens/Archive'
import { CloudSignInScreen } from '@/screens/auth/CloudSignIn'
import { JoinTeamScreen } from '@/screens/auth/JoinTeam'
import { AwaitingApprovalScreen } from '@/screens/auth/AwaitingApproval'
import { ScoutScreen } from '@/screens/Scout'
import { ChatScreen } from '@/screens/Chat'
import { StatesScreen } from '@/screens/States'
import { SettingsScreen } from '@/screens/Settings'
import { HelpScreen } from '@/screens/Help'
import { NotFoundScreen } from '@/screens/NotFound'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
    globalThis.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

/** Signed-out visitors land on the launch screen rather than a half-empty Today. */
function RequireSession({ children }: { children: React.ReactNode }) {
  const session = useStore((s) => s.session)
  const ready = useStore((s) => s.ready)
  if (!ready) return null
  if (!session.memberId && !session.guest) return <Navigate to="/" replace />
  /*
   * Signed in, but nobody has put them on the team. They get their own request
   * and nothing else — the gate is here rather than per-screen so a new screen
   * cannot forget it.
   */
  if (session.awaitingApproval) return <Navigate to="/pending" replace />
  return <>{children}</>
}

/**
 * Adopts a Supabase session wherever the browser happens to land.
 *
 * An identity provider sends people back to the app's *base* URL, because that
 * is the one URL registered with Google, GitHub and Microsoft — not to whatever
 * screen they left from. That lands them on the launch screen, and this used to
 * be the only place that never asked who was signed in: the token in the URL
 * was consumed and then dropped on the floor, so a successful Google sign-in
 * looked exactly like a failed one. You came back to the same buttons.
 *
 * So the question is asked once, here, above the router, and every entry point
 * — OAuth, an emailed link, a password reset, or just reopening the app a week
 * later — is covered by the same few lines.
 *
 * Two things this must get right:
 *
 *  - **Wait for hydration.** `signInWithCloudUser` makes whoever arrives first
 *    on an empty team its coach. Run it against a season that has not loaded
 *    yet and every member looks like the first one, which would quietly hand
 *    coach to a student.
 *  - **Never re-adopt.** A session already bound to this account is left alone,
 *    or reopening the app would throw away a role preview and bounce the person
 *    to /today mid-task.
 */
function CloudSessionBridge() {
  const navigate = useNavigate()
  const ready = useStore((s) => s.ready)
  const authUserId = useStore((s) => s.session.authUserId)
  const signInWithCloudUser = useStore((s) => s.signInWithCloudUser)
  const notify = useStore((s) => s.notify)
  const asked = useRef(false)

  useEffect(() => {
    if (!ready || asked.current || !isAuthConfigured()) return
    asked.current = true

    // Captured before Supabase strips its own hash out of the URL.
    const returning = looksLikeAuthCallback()
    let live = true

    void currentAuthUser().then((user) => {
      if (!live || !user || user.id === authUserId) return
      const outcome = signInWithCloudUser(user)
      // Silent on a plain reopen; a completed sign-in deserves to be told.
      if (returning) notify(outcome.message, outcome.awaitingApproval ? 'warn' : 'ok')
      navigate(outcome.awaitingApproval ? '/pending' : '/today', { replace: true })
    })

    return () => {
      live = false
    }
  }, [ready, authUserId, signInWithCloudUser, notify, navigate])

  return null
}

export function App() {
  const hydrate = useStore((s) => s.hydrate)
  const ready = useStore((s) => s.ready)
  const setOnline = useStore((s) => s.setOnline)

  useEffect(() => {
    void hydrate()
    // A season is not a cache — ask the browser not to evict it under pressure.
    void requestPersistence()
  }, [hydrate])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    globalThis.addEventListener('online', on)
    globalThis.addEventListener('offline', off)
    return () => {
      globalThis.removeEventListener('online', on)
      globalThis.removeEventListener('offline', off)
    }
  }, [setOnline])

  // Phones switch at sunset with the app open; "system" has to mean it.
  useEffect(() => watchSystemTheme(), [])

  // Never lose the last edit to a backgrounded tab.
  useEffect(() => {
    const flush = () => void flushPendingSave(useStore.getState().season)
    globalThis.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
    return () => globalThis.removeEventListener('pagehide', flush)
  }, [])

  if (!ready) return <BootSplash />

  // basename tracks Vite's base, so a subdirectory deploy (GitHub Pages) routes correctly.
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <CloudSessionBridge />
      <Routes>
        <Route path="/" element={<LaunchScreen />} />
        <Route path="/signin" element={<SignInScreen />} />
        <Route path="/signin/cloud" element={<CloudSignInScreen />} />
        <Route path="/join" element={<JoinTeamScreen />} />
        <Route path="/pending" element={<AwaitingApprovalScreen />} />
        <Route path="/signin/who" element={<WhoAreYouScreen />} />
        <Route path="/signin/member/:memberId" element={<PersonalSignInScreen />} />
        <Route path="/signin/mentor" element={<MentorSignInScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/guest" element={<GuestOnboardingScreen />} />
        <Route path="/identity" element={<TeamIdentityScreen />} />
        <Route path="/comp" element={<CompetitionModeScreen />} />

        <Route
          element={
            <RequireSession>
              <AppShell />
            </RequireSession>
          }
        >
          <Route path="/today" element={<TodayScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/calendar/edit" element={<CalendarEditorScreen />} />
          <Route path="/events/:eventId" element={<EventDetailScreen />} />
          <Route path="/weekly" element={<WeeklyScreen />} />
          <Route path="/weekly/:weekId" element={<WeeklyScreen />} />
          <Route path="/build" element={<BuildLogScreen />} />
          <Route path="/live" element={<LiveEventScreen />} />
          <Route path="/roster" element={<RosterScreen />} />
          <Route path="/budget" element={<BudgetScreen />} />
          <Route path="/parts" element={<PartsScreen />} />
          <Route path="/chat" element={<ChatScreen />} />
          <Route path="/chat/:channelId" element={<ChatScreen />} />
          <Route path="/scout" element={<ScoutScreen />} />
          <Route path="/archive" element={<ArchiveScreen />} />
          <Route path="/states" element={<StatesScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/help" element={<HelpScreen />} />
        </Route>

        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
    </BrowserRouter>
  )
}

/**
 * Shown while IndexedDB opens. Deliberately the same mark, wordmark and
 * background as the launch screen, so the handover between them is invisible
 * rather than a flash of unstyled text followed by a logo popping in.
 */
function BootSplash() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        background: 'radial-gradient(520px 420px at 50% 38%, #16191C 0%, #08090A 70%)',
      }}
    >
      {/* No animation: this can be on screen for two frames or two seconds, and
          a pop that restarts when the real launch screen mounts looks broken. */}
      <BrandLaunch size={132} animate={false} />
      <Wordmark animate={false} />
      <span className="label" style={{ marginTop: 14, letterSpacing: '0.3em' }}>
        ONE PLACE. ALL SEASON.
      </span>
    </div>
  )
}
