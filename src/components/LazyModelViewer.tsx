import { Suspense, lazy } from 'react'
import { meshAdvice, meshSupport } from '@/lib/mesh'

/**
 * The 3D viewer, loaded only when a team actually opens a model.
 *
 * Shaders and a mesh parser have no business in the bundle that renders Today,
 * so this splits them out. The advice for a file we cannot draw is answered
 * from the filename alone — no chunk is fetched to tell somebody their .f3d is
 * a proprietary archive.
 */
const ModelViewer = lazy(() =>
  import('./ModelViewer').then((m) => ({ default: m.ModelViewer })),
)

export function LazyModelViewer({ name, blob, height = 320 }: { name: string; blob: Blob | null; height?: number }) {
  const support = meshSupport(name)

  if (support !== 'mesh') {
    return (
      <div className="card-quiet card-pad">
        <div className="label" style={{ marginBottom: 6 }}>
          {support === 'proprietary'
            ? 'Fusion archive'
            : support === 'kernel-required'
              ? 'Exact-surface CAD'
              : 'Nothing to render'}
        </div>
        <p className="meta pretty">{meshAdvice(name)}</p>
        <p className="field-note">The file itself is stored and syncs to the team either way.</p>
      </div>
    )
  }

  if (!blob) {
    return (
      <div className="card-quiet card-pad">
        <p className="meta pretty">
          This model is not on this device yet. It downloads with the rest of the build log when there is
          signal.
        </p>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="card-dashed" style={{ height, display: 'grid', placeItems: 'center' }}>
          <span className="meta">Starting the 3D viewer…</span>
        </div>
      }
    >
      <ModelViewer name={name} blob={blob} height={height} />
    </Suspense>
  )
}
