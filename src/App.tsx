import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { useStore, flushPendingSave } from '@/store/useStore'
import { requestPersistence } from '@/lib/media'

import { LaunchScreen } from '@/screens/Launch'
import { TeamAccessScreen } from '@/screens/auth/TeamAccess'
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
import { StatesScreen } from '@/screens/States'
import { SettingsScreen } from '@/screens/Settings'
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
  return <>{children}</>
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

  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LaunchScreen />} />
        <Route path="/signin" element={<TeamAccessScreen />} />
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
          <Route path="/states" element={<StatesScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>

        <Route path="*" element={<NotFoundScreen />} />
      </Routes>
    </BrowserRouter>
  )
}

function BootSplash() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--srf-void)',
      }}
    >
      <span className="label">Loading season…</span>
    </div>
  )
}
