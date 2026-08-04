/**
 * The mark: a lime tile with a house whose roof is a robot arm and whose
 * windows are the four squares of a field. Drawn rather than raster so it is
 * crisp at 22px in the rail and 300px on the launch screen.
 */
export function Brand({ size = 34, plate = true }: { size?: number; plate?: boolean }) {
  const glyph = (
    <svg
      width={Math.round(size * 0.62)}
      height={Math.round(size * 0.58)}
      viewBox="0 0 78 72"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <rect x="50" y="4" width="9" height="26" fill="var(--srf-app)" />
      <path d="M39 4 L77 41 L66 41 L39 16 L12 41 L1 41 Z" fill="var(--srf-app)" />
      <path d="M16 41 H62 V68 H16 Z" fill="var(--srf-app)" />
      <rect x="28" y="47" width="9" height="9" fill="var(--signal)" />
      <rect x="41" y="47" width="9" height="9" fill="var(--signal)" />
      <rect x="28" y="58" width="9" height="9" fill="var(--signal)" />
      <rect x="41" y="58" width="9" height="9" fill="var(--signal)" />
    </svg>
  )

  if (!plate) return glyph

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: Math.round(size * 0.26),
        background: 'var(--signal)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {glyph}
    </span>
  )
}

/** The launch-screen mark: bigger, on a soft lime halo, with the one-shot pop. */
export function BrandLaunch({ size = 150, animate = true }: { size?: number; animate?: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        width: size * 2,
        height: size * 2,
        display: 'grid',
        placeItems: 'center',
        borderRadius: '50%',
        background:
          'radial-gradient(circle at 50% 50%, rgba(200,247,81,.14) 0%, rgba(200,247,81,0) 62%)',
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.26,
          background: 'var(--signal)',
          display: 'grid',
          placeItems: 'center',
          boxShadow: '0 18px 44px rgba(200,247,81,.14)',
          animation: animate ? 'tilePop .7s cubic-bezier(.34,1.4,.4,1) both' : undefined,
        }}
      >
        <svg width={size * 0.67} height={size * 0.62} viewBox="0 0 78 72" aria-hidden="true">
          {/* The roof lifts once on cold start, like a lid. */}
          <g style={{ animation: animate ? 'lidLift 1.6s cubic-bezier(.35,1.2,.4,1) .5s both' : undefined }}>
            <rect x="50" y="4" width="9" height="26" fill="var(--srf-app)" />
            <path d="M39 4 L77 41 L66 41 L39 16 L12 41 L1 41 Z" fill="var(--srf-app)" />
          </g>
          <path d="M16 41 H62 V68 H16 Z" fill="var(--srf-app)" />
          <rect x="28" y="47" width="9" height="9" fill="var(--signal)" />
          <rect x="41" y="47" width="9" height="9" fill="var(--signal)" />
          <rect x="28" y="58" width="9" height="9" fill="var(--signal)" />
          <rect x="41" y="58" width="9" height="9" fill="var(--signal)" />
        </svg>
      </span>
    </div>
  )
}
