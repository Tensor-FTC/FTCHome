import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliver } from './notifications'

/**
 * Which route an alert takes.
 *
 * The bug this pins: alerts were sent with `new Notification()`, which Android
 * Chrome and installed iPhone apps both refuse. The error was swallowed, so
 * match alerts never fired on a phone. The worker has to win whenever one is
 * registered, and the page constructor is only the desktop fallback.
 */

const ORIGINAL_SW = Object.getOwnPropertyDescriptor(globalThis.navigator, 'serviceWorker')

function withWorker(registration: unknown) {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: vi.fn().mockResolvedValue(registration) },
  })
}

function withPageConstructor(impl: (...args: unknown[]) => unknown) {
  vi.stubGlobal('Notification', vi.fn(impl))
}

afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIGINAL_SW) Object.defineProperty(globalThis.navigator, 'serviceWorker', ORIGINAL_SW)
  else delete (globalThis.navigator as { serviceWorker?: unknown }).serviceWorker
})

describe('deliver', () => {
  it('goes through the service worker when one is registered', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined)
    withWorker({ showNotification })
    withPageConstructor(function () {
      return {}
    })

    await expect(deliver('Q14 in 1 minute', { body: 'Field 1' })).resolves.toBe('worker')
    expect(showNotification).toHaveBeenCalledWith('Q14 in 1 minute', { body: 'Field 1' })
    // The constructor is exactly what Android refuses; it must not be tried.
    expect(globalThis.Notification).not.toHaveBeenCalled()
  })

  it('falls back to the page constructor with no worker, as on a dev server', async () => {
    withWorker(undefined)
    withPageConstructor(function () {
      return {}
    })

    await expect(deliver('Q14 is up now', {})).resolves.toBe('page')
    expect(globalThis.Notification).toHaveBeenCalledOnce()
  })

  it('still tries the page when the worker refuses', async () => {
    withWorker({ showNotification: vi.fn().mockRejectedValue(new Error('no permission')) })
    withPageConstructor(function () {
      return {}
    })

    await expect(deliver('Deadline coming up', {})).resolves.toBe('page')
  })

  it('reports nothing delivered rather than throwing when neither route exists', async () => {
    withWorker(undefined)
    withPageConstructor(function () {
      throw new TypeError('Illegal constructor')
    })

    await expect(deliver('Q14 in 5 min', {})).resolves.toBe('none')
  })
})
