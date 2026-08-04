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

/** Deadline nudge, used by the calendar for anything due inside 48 hours. */
export function notifyDeadline(title: string, whenLabel: string): void {
  show('Deadline coming up', `${title} · ${whenLabel}`, `ftc-deadline-${title}`)
}
