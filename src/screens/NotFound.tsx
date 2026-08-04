import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'
import { Brand } from '@/components/Brand'

/** Empty states name the one action that ends them. A 404 is no different. */
export function NotFoundScreen() {
  const navigate = useNavigate()
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 32,
        background: 'var(--srf-app)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Brand size={52} />
        </div>
        <h1 className="h1" style={{ marginBottom: 8 }}>
          Nothing here
        </h1>
        <p className="body pretty" style={{ color: 'var(--ink-3)', marginBottom: 20 }}>
          That address isn&rsquo;t part of the app. Today is where the work is.
        </p>
        <Button variant="primary" onClick={() => navigate('/today')}>
          Go to Today
        </Button>
      </div>
    </div>
  )
}
