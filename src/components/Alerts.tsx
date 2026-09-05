import { useEffect, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { matchClock } from '@/domain/matchClock'
import { dueSoon } from '@/domain/deadlines'
import { announceDeadlines, matchAlerts } from '@/lib/notifications'
import { useNow } from '@/lib/useNow'

/**
 * Alerts, for the whole app.
 *
 * This used to live in the app shell, which meant it only ran on the six
 * screens the countdown docks to — and never in Competition Mode, which is
 * outside the shell entirely and is the one screen actually up at a
 * competition. A drive team watching the pit board got no alert; a scout on
 * the Scout screen got no alert. The alert is about the match, not about which
 * screen somebody happens to be looking at, so it belongs above the router.
 *
 * Costs nothing when it is off: with notifications disabled it subscribes to
 * no timer at all.
 */
export function Alerts() {
  const season = useStore((s) => s.season)
  const enabled = season.settings.notificationsEnabled
  const leadSeconds = season.settings.notifyLeadSeconds

  /*
   * One second only when there is something to count. `matchClock` returns
   * null outside a three-hour horizon, so the slow tick is what finds the
   * match; once found, the fast tick is what makes "one minute" mean it.
   */
  const coarse = useNow(enabled ? 30_000 : 3_600_000)
  const hasMatch = useMemo(
    () => (enabled ? matchClock(season, coarse) !== null : false),
    [enabled, season, coarse],
  )
  const now = useNow(enabled && hasMatch ? 1000 : 3_600_000)
  const clock = useMemo(
    () => (enabled && hasMatch ? matchClock(season, now) : null),
    [enabled, hasMatch, season, now],
  )

  useEffect(() => {
    if (!enabled || !clock) return
    matchAlerts.tick(clock.match.label, clock.match.field, clock.alliance, clock.secondsUntil, leadSeconds)
  }, [enabled, clock, leadSeconds])

  // Deadlines move on the scale of days, so the coarse clock is plenty. Which
  // ones have already been announced is remembered across reloads.
  useEffect(() => {
    if (!enabled) return
    announceDeadlines(dueSoon(season, coarse), coarse)
  }, [enabled, season, coarse])

  return null
}
