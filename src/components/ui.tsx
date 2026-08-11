import { createPortal } from 'react-dom'
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { initialsOf } from '@/lib/id'
import { pct } from '@/lib/format'

/** Shared primitives. Every screen composes these rather than restyling a div. */

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'quiet' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default: '',
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  quiet: 'btn-quiet',
  danger: 'btn-danger',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', block, className = '', type = 'button', ...rest },
  ref,
) {
  const classes = [
    'btn',
    VARIANT_CLASS[variant],
    size === 'lg' ? 'btn-lg' : size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return <button ref={ref} type={type} className={classes} {...rest} />
})

export function IconButton({
  label,
  small,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; small?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${small ? 'btn-icon-sm' : 'btn-icon'} ${className}`}
      {...rest}
    />
  )
}

export function Chip({
  active,
  dot,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; dot?: string }) {
  return (
    <button type="button" aria-pressed={active} className={`chip ${className}`} {...rest}>
      {dot && <span className="dot" style={{ width: 5, height: 5, background: dot }} />}
      {children}
    </button>
  )
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`label ${className}`}>{children}</div>
}

export function SectionLabel({
  children,
  aside,
  className = '',
}: {
  children: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={`section-head ${className}`}>
      <span className="label">{children}</span>
      {aside}
    </div>
  )
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  mono?: boolean
  big?: boolean
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, mono, big, className = '', id, ...rest },
  ref,
) {
  const auto = useId()
  const fieldId = id ?? auto
  const classes = ['field', big ? 'field-lg' : '', mono ? 'field-mono' : '', error ? 'field-invalid' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <div>
      {label && (
        <label className="label" htmlFor={fieldId} style={{ display: 'block', marginBottom: 7 }}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        className={classes}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined}
        {...rest}
      />
      {error ? (
        <div className="field-error" id={`${fieldId}-err`} role="alert">
          {error}
        </div>
      ) : hint ? (
        <div className="field-note" id={`${fieldId}-hint`}>
          {hint}
        </div>
      ) : null}
    </div>
  )
})

export function TextArea({
  label,
  hint,
  className = '',
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <div>
      {label && (
        <label className="label" htmlFor={fieldId} style={{ display: 'block', marginBottom: 7 }}>
          {label}
        </label>
      )}
      <textarea id={fieldId} className={`field ${className}`} {...rest} />
      {hint && <div className="field-note">{hint}</div>}
    </div>
  )
}

export function Select({
  label,
  className = '',
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const auto = useId()
  const fieldId = id ?? auto
  return (
    <div>
      {label && (
        <label className="label" htmlFor={fieldId} style={{ display: 'block', marginBottom: 7 }}>
          {label}
        </label>
      )}
      <select id={fieldId} className={`field ${className}`} {...rest}>
        {children}
      </select>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  )
}

export function Check({
  checked,
  onChange,
  label,
  large,
}: {
  checked: boolean
  onChange: () => void
  label: string
  large?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`check ${large ? 'check-lg' : ''}`}
      onClick={onChange}
    >
      {checked ? '✓' : ''}
    </button>
  )
}

export function Avatar({
  name,
  staff,
  size = 'md',
}: {
  name: string
  staff?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const cls = size === 'sm' ? 'avatar-sm' : size === 'lg' ? 'avatar-lg' : ''
  return (
    <span className={`avatar ${cls} ${staff ? 'avatar-staff' : ''}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  )
}

/** A meter with up to two segments — received vs pledged, going vs maybe. */
export function Meter({
  segments,
  small,
  label,
}: {
  segments: { value: number; of: number; tone?: 'signal' | 'dim' | 'pressure' | 'red' }[]
  small?: boolean
  label?: string
}) {
  return (
    <div className={`meter ${small ? 'meter-sm' : ''}`} role="img" aria-label={label}>
      {segments.map((seg, i) => (
        <span
          key={i}
          className="meter-fill"
          style={{
            width: `${pct(seg.value, seg.of)}%`,
            background:
              seg.tone === 'dim'
                ? 'var(--signal-dim)'
                : seg.tone === 'pressure'
                  ? 'var(--pressure)'
                  : seg.tone === 'red'
                    ? 'var(--alliance-red)'
                    : 'var(--signal)',
          }}
        />
      ))}
    </div>
  )
}

/**
 * Empty states name the one action that ends them, rather than explaining the
 * feature. That is the whole contract of this component.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="empty">
      <div style={{ font: "500 14px/1.3 var(--font-sans)", color: 'var(--ink-2)' }}>{title}</div>
      <p className="pretty" style={{ font: "400 12px/1.55 var(--font-sans)", color: 'var(--ink-3)', margin: '6px 0 0' }}>
        {body}
      </p>
      {action && (
        <Button variant="primary" size="sm" style={{ marginTop: 15 }} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

/**
 * The withheld value. Shows the *shape* of what is hidden and says who can see
 * it — a locked chip, never a removed row, so nobody wonders if it exists.
 */
export function LockedValue({ shape = '$•••.••', title }: { shape?: string; title?: string }) {
  return (
    <span className="chip-locked" title={title ?? 'Mentors and coaches only'}>
      <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
        <path d="M2 5V3.5a3 3 0 016 0V5" stroke="var(--ink-4)" strokeWidth="1.3" fill="none" />
        <rect x="1" y="5" width="8" height="6" rx="1.2" fill="var(--line-3)" />
      </svg>
      {shape}
    </span>
  )
}

/** Bottom sheet on phones, centred dialog on desktop. Focus-trapped, Esc closes. */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const node = ref.current
    node?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !node) return
      const focusable = node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [onClose])

  /*
   * Rendered into <body>, not where it was written.
   *
   * `position: fixed` is only relative to the viewport if no ancestor has a
   * transform, filter or perspective — any of those make it a containing block
   * instead. `.screen` carries `animation: riseIn … both`, and `both` keeps the
   * final keyframe applied forever, so an *identity* transform sits on every
   * screen for the life of the page.
   *
   * The effect was a modal sized and centred against the whole document rather
   * than the window: on a short screen the Save button landed hundreds of
   * pixels below the fold with no way to scroll to it, and the only workaround
   * was zooming out. Portalling puts the scrim back under <body>, where fixed
   * means fixed — and keeps it correct if anything else ever grows a transform.
   */
  return createPortal(
    <div className="sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="sheet-head">
          <div>
            <h2 className="h2" id={titleId}>
              {title}
            </h2>
            {subtitle && (
              <p className="meta" style={{ marginTop: 4 }}>
                {subtitle}
              </p>
            )}
          </div>
          <IconButton label="Close" small onClick={onClose}>
            ×
          </IconButton>
        </div>
        {children}
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        borderRadius: '50%',
        border: '2px solid var(--line-3)',
        borderTopColor: 'var(--signal)',
        animation: 'spin 700ms linear infinite',
      }}
    />
  )
}

/** Big number + caption, the shape used across Today, Live and the dashboard. */
export function Stat({
  label,
  value,
  sub,
  tone = 'ink',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'ink' | 'signal' | 'pressure'
}) {
  const color = tone === 'signal' ? 'var(--signal)' : tone === 'pressure' ? 'var(--pressure)' : 'var(--ink)'
  return (
    <div className="card card-pad" style={{ padding: 14 }}>
      <div className="label" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div className="mono" style={{ font: '600 24px/1 var(--font-mono)', color }}>
        {value}
      </div>
      {sub && (
        <div className="meta" style={{ marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  )
}
