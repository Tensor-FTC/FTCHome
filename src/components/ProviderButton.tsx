import type { OAuthProvider } from '@/lib/auth'

/**
 * Sign-in buttons for the identity providers.
 *
 * The marks are inline paths rather than remote images: an auth screen that
 * waits on a CDN is an auth screen that shows blank buttons on venue wifi, and
 * the whole app is built not to do that. Each is drawn at its owner's own
 * proportions so it is recognisable at a glance, which is the only reason to
 * show a logo on a button at all.
 */
const MARKS: Record<OAuthProvider, { label: string; node: JSX.Element }> = {
  google: {
    label: 'Google',
    node: (
      <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true" style={{ flex: 'none' }}>
        <path
          fill="#4285F4"
          d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        />
      </svg>
    ),
  },
  github: {
    label: 'GitHub',
    node: (
      <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
        <path
          fill="currentColor"
          d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.01.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0z"
        />
      </svg>
    ),
  },
  // Supabase still calls this provider `azure`; everything a person reads says
  // Microsoft. The mark is the four-square logo at its published proportions —
  // an 8px gap on a 23px grid — and its colours are fixed by Microsoft's brand
  // guidelines, so they stay literal rather than following the theme.
  azure: {
    label: 'Microsoft',
    node: (
      <svg width="17" height="17" viewBox="0 0 23 23" aria-hidden="true" style={{ flex: 'none' }}>
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#7FBA00" d="M12 1h10v10H12z" />
        <path fill="#00A4EF" d="M1 12h10v10H1z" />
        <path fill="#FFB900" d="M12 12h10v10H12z" />
      </svg>
    ),
  },
}

export function ProviderButton({
  provider,
  disabled,
  onClick,
}: {
  provider: OAuthProvider
  disabled?: boolean
  onClick: () => void
}) {
  const mark = MARKS[provider]
  return (
    <button type="button" className="provider-btn" disabled={disabled} onClick={onClick}>
      {mark.node}
      <span>Continue with {mark.label}</span>
    </button>
  )
}
