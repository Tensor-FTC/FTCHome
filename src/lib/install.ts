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

export type InstallState = 'installed' | 'available' | 'manual-ios' | 'unavailable'

export function installState(): InstallState {
  if (isStandalone()) return 'installed'
  if (deferred) return 'available'
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'manual-ios'
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
