import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '@/components/ui'

/**
 * The sign-in flow's frame. On a phone it is a single column; at 1024 it becomes
 * a centred 420px card on a plain field, which is what the spec calls for on
 * every auth screen.
 */
export function AuthLayout({
  back,
  children,
  aside,
}: {
  back?: string
  children: ReactNode
  aside?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="auth-shell">
      <div className="auth-card">
        {back && (
          <IconButton label="Back" onClick={() => navigate(back)} style={{ marginBottom: 20 }}>
            ←
          </IconButton>
        )}
        {children}
      </div>
      {aside && <div className="auth-aside">{aside}</div>}
    </div>
  )
}
