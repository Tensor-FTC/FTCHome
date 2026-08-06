/**
 * The mark: a house whose windows are the four tiles of a field — "FTC Home".
 *
 * Geometry lives here as the single source of truth; `scripts/generate-icons.mjs`
 * and `public/favicon.svg` transcribe these same numbers, so the favicon can
 * never drift from the in-app mark.
 *
 * Drawn on a 64×64 grid with an even 8px margin on every side.
 */

/**
 * A roof chevron over the four tiles of a field — "home" and "the field", drawn
 * as geometry rather than as a literal house, which read as clip art.
 *
 * Everything sits inside an 8px margin on a 64px box, so the mark is optically
 * centred and never crowds the tile's corner radius.
 */
export const ROOF_PATH = 'M32 8 L56 28 L48 28 L32 15 L16 28 L8 28 Z'

/** Four field tiles, 10px on a 4px gutter, centred under the roof. */
export const TILES: [x: number, y: number][] = [
  [20, 32],
  [34, 32],
  [20, 46],
  [34, 46],
]
export const TILE_SIZE = 10

/** Corner radius as a fraction of the tile edge. */
export const TILE_RADIUS = 0.24

function Glyph({ ink }: { ink: string }) {
  return (
    <>
      <path d={ROOF_PATH} fill={ink} />
      {TILES.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={TILE_SIZE} height={TILE_SIZE} rx="2" fill={ink} />
      ))}
    </>
  )
}

/**
 * The mark on its lime tile. `plate={false}` gives the bare glyph for places
 * that supply their own background.
 */
export function Brand({
  size = 34,
  plate = true,
  tile = 'var(--signal)',
  ink = 'var(--srf-app)',
}: {
  size?: number
  plate?: boolean
  tile?: string
  ink?: string
}) {
  if (!plate) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: 'block' }}>
        <Glyph ink={ink} />
      </svg>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ display: 'block', flex: 'none' }}
    >
      <rect width="64" height="64" rx={64 * TILE_RADIUS} fill={tile} />
      <Glyph ink={ink} />
    </svg>
  )
}

/**
 * The launch mark: bigger, on a soft lime halo, with a single one-shot pop.
 *
 * Only transform and opacity animate, once, on one element — the launch costs a
 * frame of work rather than a running animation, and `animate={false}` under
 * reduced motion drops even that.
 */
export function BrandLaunch({ size = 132, animate = true }: { size?: number; animate?: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        width: size * 2.1,
        height: size * 2.1,
        display: 'grid',
        placeItems: 'center',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 50% 50%, rgba(200,247,81,.13) 0%, rgba(200,247,81,0) 64%)',
      }}
    >
      <div
        style={{
          filter: 'drop-shadow(0 18px 44px rgba(200,247,81,.16))',
          animation: animate ? 'tilePop .68s cubic-bezier(.34,1.32,.4,1) both' : undefined,
        }}
      >
        <Brand size={size} />
      </div>
    </div>
  )
}

/** Wordmark used on the launch screen and the boot splash. */
export function Wordmark({ animate = true, size = 44 }: { animate?: boolean; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline' }}>
      <span
        style={{
          font: `600 ${size}px/1 var(--font-sans)`,
          color: '#F2F0E9',
          letterSpacing: '-0.02em',
          animation: animate ? 'wordIn .5s cubic-bezier(.2,.8,.3,1) .42s both' : undefined,
        }}
      >
        FTC
      </span>
      <span
        style={{
          font: `400 ${size}px/1 var(--font-sans)`,
          color: '#8B9490',
          letterSpacing: '-0.02em',
          marginLeft: size * 0.09,
          animation: animate ? 'wordIn .5s cubic-bezier(.2,.8,.3,1) .56s both' : undefined,
        }}
      >
        Home
      </span>
    </div>
  )
}
