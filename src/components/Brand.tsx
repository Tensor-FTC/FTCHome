import {
  BRAND_BOX,
  BRAND_CUTS,
  BRAND_DOTS,
  BRAND_INK,
  BRAND_LIME,
  BRAND_SEAMS,
  BRAND_SOLID,
  BRAND_TILE_RADIUS,
} from './brandArt'

/**
 * The mark: a house with cubes and game balls coming out of the chimney.
 *
 * The geometry is generated, not written here — it lives in
 * `scripts/brand-geometry.mjs` and is emitted to `brandArt.ts` alongside the
 * favicon and the PNG app icons by `npm run icons`. That is the whole point:
 * the mark in the top bar, the one in the browser tab and the one on a phone
 * home screen are the same numbers, so they cannot drift apart.
 *
 * The faces are separated by lines drawn *in the tile colour on top of a solid
 * silhouette*, rather than by shrinking each face off its neighbours. A gap you
 * draw is a gap you control; a gap you leave is a crack.
 */
function Glyph({ ink, tile }: { ink: string; tile: string }) {
  return (
    <>
      {BRAND_INK.map((d) => (
        <path key={d} d={d} fill={ink} fillRule="evenodd" />
      ))}
      {BRAND_CUTS.map((d) => (
        <path key={d} d={d} fill={tile} />
      ))}
      {BRAND_SEAMS.map((seam) => (
        <path
          key={seam.d}
          d={seam.d}
          fill="none"
          stroke={tile}
          strokeWidth={seam.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {BRAND_DOTS.map((d) => (
        <path key={d} d={d} fill={ink} />
      ))}
    </>
  )
}

/**
 * One flat silhouette. Used wherever the mark has to survive as a single shape:
 * on a plate whose colour we do not know, the seams would be cut in the wrong
 * colour and the mark would fall apart.
 */
function Solid({ ink }: { ink: string }) {
  return (
    <>
      {BRAND_SOLID.map((d) => (
        <path key={d} d={d} fill={ink} />
      ))}
    </>
  )
}

/**
 * The mark on its lime tile. `plate={false}` gives the bare silhouette in the
 * tile colour, for places that supply their own background.
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
      {plate ? (
        <>
          <rect width={BRAND_BOX} height={BRAND_BOX} rx={BRAND_BOX * BRAND_TILE_RADIUS} fill={tile} />
          <Glyph ink={ink} tile={tile} />
        </>
      ) : (
        <Solid ink={tile} />
      )}
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
