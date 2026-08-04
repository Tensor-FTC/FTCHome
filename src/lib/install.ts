/**
 * PWA install.
 *
 * Chromium fires `beforeinstallprompt` and lets us defer it; iOS Safari has no
 * such event and needs Share → Add to Home Screen, so this reports which case
 * you are in rather than showing a button that would do nothing.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((fn) => fn())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((fn) => fn())
  })
}

export function onInstallStateChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export type InstallState = 'installed' | 'available' | 'manual-ios' | 'manual-safari-desktop' | 'insecure' | 'unavailable'

export type Platform = 'ios' | 'android' | 'desktop' | 'unknown'

export function platform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  // iPadOS 13+ reports as a Mac, so touch points are the reliable tell.
  const iPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop'
  return 'unknown'
}

export function installState(): InstallState {
  if (isStandalone()) return 'installed'
  if (deferred) return 'available'
  // Service workers, and therefore installing, require a secure context.
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure'

  const where = platform()
  if (where === 'ios') return 'manual-ios'
  // Safari on macOS installs via Dock → Add to Dock and fires no event.
  if (where === 'desktop' && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent)) {
    return 'manual-safari-desktop'
  }
  return 'unavailable'
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  // The event is single-use; Chromium will fire a fresh one if it re-qualifies.
  deferred = null
  listeners.forEach((fn) => fn())
  return outcome
}
