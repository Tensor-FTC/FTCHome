import { useEffect, useState } from 'react'

/**
 * A ticking clock for anything that counts down.
 *
 * Deliberately not stored in the season: the current time is not team data, and
 * writing it to IndexedDB every second would be absurd. Components that need it
 * subscribe; everything else never re-renders.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    // A backgrounded tab throttles timers, so resync the moment it comes back
    // rather than showing a clock that silently drifted minutes behind.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])

  return now
}
