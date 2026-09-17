/*
 * What happens when somebody taps an alert.
 *
 * Notifications now go through the service worker, because that is the only
 * route Android Chrome and installed iPhone apps allow. A worker notification
 * has no `onclick` in the page, so without this handler a tap simply dismissed
 * it — the drive team would get "Q14 in 1 minute" and then have to go and find
 * the app themselves.
 *
 * Pulled into the generated worker with `importScripts` (see vite.config.ts),
 * so it sits alongside Workbox's caching rather than replacing it.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    (async () => {
      const scope = self.registration.scope
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Bring back a window that is already open rather than stacking a second.
      for (const client of windows) {
        if (client.url.startsWith(scope) && 'focus' in client) {
          await client.focus()
          return
        }
      }

      await self.clients.openWindow(scope)
    })(),
  )
})
