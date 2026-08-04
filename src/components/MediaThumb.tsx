import { useEffect, useState } from 'react'
import { blobUrl } from '@/lib/media'
import { duration } from '@/lib/format'
import type { MediaItem } from '@/domain/types'

/**
 * A media tile. Renders the stored thumbnail when there is one, and a labelled
 * hatch plate when there is not — CAD files, queued uploads, and pruned blobs
 * all land in that second case, so it has to look deliberate rather than broken.
 */
export function MediaThumb({
  item,
  height,
  square,
}: {
  item: MediaItem
  height?: number
  square?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void blobUrl(item.thumbKey ?? (item.kind === 'photo' ? item.blobKey : undefined)).then((u) => {
      if (live) setUrl(u)
    })
    return () => {
      live = false
    }
  }, [item.thumbKey, item.blobKey, item.kind])

  const frame: React.CSSProperties = {
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    background: 'repeating-linear-gradient(135deg, #1B2124 0 12px, #171C1F 12px 24px)',
    ...(square ? { aspectRatio: '1' } : { height: height ?? 120 }),
  }

  return (
    <div style={frame}>
      {url ? (
        <img
          src={url}
          alt={item.caption || item.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
        />
      ) : (
        <span
          style={{
            font: '500 8px var(--font-mono)',
            color: 'var(--ink-5)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {item.kind}
        </span>
      )}

      {item.kind === 'video' && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'var(--srf-app)',
            display: 'grid',
            placeItems: 'center',
            font: '500 10px var(--font-mono)',
            color: 'var(--signal)',
          }}
        >
          ▶
        </span>
      )}

      {/* The only text over an image anywhere in the app: a corner tag on an opaque chip. */}
      {item.durationSec != null && (
        <span
          className="num"
          style={{
            position: 'absolute',
            bottom: 5,
            right: 5,
            padding: '2px 5px',
            borderRadius: 4,
            background: 'var(--srf-app)',
            font: '500 9px var(--font-mono)',
            color: 'var(--ink-2)',
          }}
        >
          {duration(item.durationSec)}
        </span>
      )}

      {item.queued && (
        <span
          style={{
            position: 'absolute',
            top: 5,
            left: 5,
            padding: '3px 6px',
            borderRadius: 4,
            background: 'var(--srf-app)',
            font: '500 8.5px var(--font-mono)',
            color: 'var(--ink-3)',
            letterSpacing: '0.1em',
          }}
        >
          QUEUED
        </span>
      )}
    </div>
  )
}
