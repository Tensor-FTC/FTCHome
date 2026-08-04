import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'

// jsdom ships no WebCrypto; the credential layer needs subtle.deriveBits.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

// jsdom has no structuredClone before Node's global lands in the environment.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = ((v: unknown) => JSON.parse(JSON.stringify(v))) as typeof structuredClone
}
