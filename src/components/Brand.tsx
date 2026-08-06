import {
  BRAND_BOX,
  BRAND_FILLED,
  BRAND_LIME,
  BRAND_OUTLINED,
  BRAND_TILE_RADIUS,
  BRAND_TRAILS,
  BRAND_TRAIL_WIDTH,
} from './brandArt'

/**
 * The mark: a house with cubes and game balls coming out of the chimney.
 *
 * The geometry is generated, not written here — it lives in
 * `scripts/brand-geometry.mjs` and is emitted to `brandArt.ts` alongside the
 * favicon and the PNG app icons by `npm run icons`. That is the whole point:
 * the mark in the top bar, the one in the browser tab and the one on a phone
 * home screen are the same numbers, so they cannot drift apart.
 */
function Glyph({ ink }: { ink: string }) {
  return (
    <>
      {BRAND_OUTLINED.map((shape) => (
        <path
          key={shape.d}
          d={shape.d}
          fill="none"
          stroke={ink}
          strokeWidth={shape.width}
          strokeLinejoin="round"
        />
      ))}
      {BRAND_FILLED.map((d) => (
        <path key={d} d={d} fill={ink} fillRule="evenodd" />
      ))}
      {BRAND_TRAILS.map((d) => (
        <path key={d} d={d} fill="none" stroke={ink} strokeWidth={BRAND_TRAIL_WIDTH} strokeLinecap="round" />
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
  tile = BRAND_LIME,
  ink = 'var(--srf-app)',
}: {
  size?: number
  plate?: boolean
  tile?: string
  ink?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BRAND_BOX} ${BRAND_BOX}`}
      aria-hidden="true"
      style={{ display: 'block', flex: 'none' }}
    >
      {plate && (
        <rect width={BRAND_BOX} height={BRAND_BOX} rx={BRAND_BOX * BRAND_TILE_RADIUS} fill={tile} />
      )}
      <Glyph ink={plate ? ink : tile} />
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
        background: 'radial-gradient(circle at 50% 50%, rgba(198,232,78,.13) 0%, rgba(198,232,78,0) 64%)',
      }}
    >
      <div
        style={{
          filter: 'drop-shadow(0 18px 44px rgba(198,232,78,.16))',
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
