/**
 * Match alerts.
 *
 * The failure this guards against is real and specific: a drive team that
 * misses a call because the phone was in a pocket. So the alert fires once at
 * the lead time, once at 60 seconds, and once at zero — and never repeats,
 * because a notification you learn to swipe away is worse than none.
 */

export type NotifyPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export function permission(): NotifyPermission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function requestPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

function show(title: string, body: string, tag: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, {
      body,
      tag,
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-192.png',
      // Renotify with the same tag replaces rather than stacks.
      requireInteraction: false,
      silent: false,
    })
    n.onclick = () => {
      globalThis.focus?.()
      n.close()
    }
  } catch {
    /* Notification constructor throws on some mobile browsers; the in-app countdown still works. */
  }
}

/** Tracks which thresholds have already fired for the current match. */
export class MatchAlerts {
  private fired = new Set<number>()
  private key = ''

  /** Call every tick. `seconds` is time remaining; `label` identifies the match. */
  tick(label: string, field: string, alliance: string, seconds: number, leadSeconds: number): void {
    if (this.key !== label) {
      this.key = label
      this.fired.clear()
    }
    const thresholds = [leadSeconds, 60, 0].filter((t, i, arr) => arr.indexOf(t) === i && t >= 0)
    for (const t of thresholds) {
      if (seconds <= t && !this.fired.has(t)) {
        this.fired.add(t)
        if (t === 0) {
          show(`${label} is up now`, `Field ${field} · ${alliance.toUpperCase()} alliance`, 'ftc-match')
        } else if (t === 60) {
          show(`${label} in 1 minute`, `Get to field ${field} · ${alliance.toUpperCase()}`, 'ftc-match')
        } else {
          const mins = Math.round(t / 60)
          show(`${label} in ${mins} min`, `Field ${field} · ${alliance.toUpperCase()} alliance`, 'ftc-match')
        }
      }
    }
  }

  reset(): void {
    this.fired.clear()
    this.key = ''
  }
}

export const matchAlerts = new MatchAlerts()

/** Deadline nudge, for anything due inside the next 48 hours. */
export function notifyDeadline(title: string, whenLabel: string): void {
  show('Deadline coming up', `${title} · ${whenLabel}`, `ftc-deadline-${title}`)
}

/**
 * Deadline alerts, fired once each.
 *
 * Unlike a match, a deadline sits inside its window for two days, and the app
 * is opened a dozen times in that period. Holding "already fired" in memory
 * would mean a fresh page for every reload — the swipe-it-away failure the
 * match alerts were built to avoid — so this remembers across reloads.
 *
 * Per device, deliberately, and never synced: a notification is something that
 * happened to a phone, not a fact about the season.
 */
const FIRED_KEY = 'ftc-home:deadlines-alerted'

/** Long enough to cover the window plus a weekend; short enough not to grow. */
const FORGET_AFTER_MS = 14 * 24 * 60 * 60 * 1000

type FiredLog = Record<string, number>

function readFired(): FiredLog {
  try {
    const raw = globalThis.localStorage?.getItem(FIRED_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as FiredLog) : {}
  } catch {
    // Private browsing, a cleared profile, or storage that is simply off. An
    // alert repeating is a far better failure than the app refusing to start.
    return {}
  }
}

function writeFired(log: FiredLog): void {
  try {
    globalThis.localStorage?.setItem(FIRED_KEY, JSON.stringify(log))
  } catch {
    /* Same reasoning: never let a full quota break the app. */
  }
}

export interface DeadlineAlert {
  key: string
  title: string
  whenLabel: string
}

/**
 * Page once for each deadline not already announced on this device.
 *
 * Returns the keys it actually fired, which is what the tests assert on —
 * `Notification` does not exist in jsdom and a spy on a global constructor
 * proves less than the decision itself.
 */
export function announceDeadlines(due: DeadlineAlert[], nowMs = Date.now()): string[] {
  const log = readFired()

  // Prune first, so a key old enough to have been forgotten is genuinely new
  // again rather than suppressed by a record that was about to be deleted.
  let pruned = false
  for (const [key, at] of Object.entries(log)) {
    if (nowMs - at > FORGET_AFTER_MS) {
      delete log[key]
      pruned = true
    }
  }

  const fired: string[] = []
  for (const item of due) {
    if (log[item.key]) continue
    log[item.key] = nowMs
    fired.push(item.key)
    notifyDeadline(item.title, item.whenLabel)
  }

  if (fired.length || pruned) writeFired(log)
  return fired
}

/** Test seam, and what "Clear season data" should leave behind: nothing. */
export function resetDeadlineAlerts(): void {
  try {
    globalThis.localStorage?.removeItem(FIRED_KEY)
  } catch {
    /* nothing to do */
  }
}
