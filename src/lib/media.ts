import { deleteBlob, getBlob, putBlob } from './idb'
import { uid } from './id'
import type { MediaKind } from '@/domain/types'

/**
 * Media lives as blobs in IndexedDB, keyed out of the season document so a
 * 40 MB clip never has to be serialised next to the roster.
 *
 * Thumbnails are generated on import and stored separately: the build log is a
 * three-across grid, and decoding full-resolution shop photos to draw 120px
 * tiles is exactly the thing that drops frames on the Chromebook the spec
 * names.
 */

const THUMB_EDGE = 480

export interface ImportedMedia {
  blobKey: string
  thumbKey?: string
  kind: MediaKind
  size: number
  mimeType: string
  name: string
  durationSec?: number
}

export function kindOf(file: File): MediaKind {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('image/')) return 'photo'
  if (/\.(step|stp|stl|f3d|sldprt|iges|igs|dwg|dxf)$/i.test(file.name)) return 'cad'
  return 'photo'
}

export async function importFile(file: File): Promise<ImportedMedia> {
  const blobKey = uid('blob-')
  await putBlob(blobKey, file)

  const kind = kindOf(file)
  let thumbKey: string | undefined
  let durationSec: number | undefined

  if (kind === 'photo') {
    const thumb = await makeImageThumb(file).catch(() => null)
    if (thumb) {
      thumbKey = uid('thumb-')
      await putBlob(thumbKey, thumb)
    }
  } else if (kind === 'video') {
    const shot = await makeVideoThumb(file).catch(() => null)
    if (shot) {
      thumbKey = uid('thumb-')
      await putBlob(thumbKey, shot.blob)
      durationSec = shot.duration
    }
  }

  return {
    blobKey,
    thumbKey,
    kind,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    name: file.name.replace(/\.[^.]+$/, ''),
    durationSec,
  }
}

async function makeImageThumb(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82))
}

async function makeVideoThumb(file: File): Promise<{ blob: Blob; duration: number } | null> {
  return new Promise((resolve) => {
    const url = globalThis.URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    const cleanup = () => globalThis.URL.revokeObjectURL(url)
    const fail = () => {
      cleanup()
      resolve(null)
    }

    video.onerror = fail
    video.onloadedmetadata = () => {
      // A frame from a whole second in — frame zero of a shop video is usually a lens cap.
      video.currentTime = Math.min(1, video.duration / 2 || 0)
    }
    video.onseeked = () => {
      const scale = Math.min(1, THUMB_EDGE / Math.max(video.videoWidth, video.videoHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return fail()
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        cleanup()
        resolve(blob ? { blob, duration: video.duration } : null)
      }, 'image/jpeg', 0.8)
    }
    video.src = url
  })
}

const urlCache = new Map<string, string>()

/** Object URL for a stored blob, cached so a grid re-render does not thrash. */
export async function blobUrl(key: string | undefined): Promise<string | null> {
  if (!key) return null
  const cached = urlCache.get(key)
  if (cached) return cached
  const blob = await getBlob(key)
  if (!blob) return null
  const url = globalThis.URL.createObjectURL(blob)
  urlCache.set(key, url)
  return url
}

export function releaseBlobUrls(): void {
  for (const url of urlCache.values()) globalThis.URL.revokeObjectURL(url)
  urlCache.clear()
}

export async function dropMedia(blobKey?: string, thumbKey?: string): Promise<void> {
  for (const key of [blobKey, thumbKey]) {
    if (!key) continue
    const url = urlCache.get(key)
    if (url) {
      globalThis.URL.revokeObjectURL(url)
      urlCache.delete(key)
    }
    await deleteBlob(key)
  }
}

/** Browser's own view of how much room is left, for the storage meter. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  const est = await navigator.storage.estimate()
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
}

/** Ask the browser not to evict us under pressure. A season is not a cache. */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  if (await navigator.storage.persisted?.()) return true
  return navigator.storage.persist()
}
