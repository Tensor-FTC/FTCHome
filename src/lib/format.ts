/** Formatting helpers. Every number that reaches the screen goes through one of these. */

export function money(n: number, opts: { cents?: boolean } = {}): string {
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: opts.cents ? 2 : 0,
      maximumFractionDigits: opts.cents ? 2 : 0,
    })
  )
}

/** m:ss. Never reflows, because the digits are tabular everywhere it is used. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r < 10 ? '0' : ''}${r}`
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}

export function gb(n: number): string {
  return `${(n / 1024 ** 3).toFixed(1)}`
}

export function duration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function pct(value: number, of: number): number {
  if (!of) return 0
  return Math.min(100, Math.max(0, Math.round((value / of) * 100)))
}

/** "41 min ago", "2d ago". Grey and factual — offline is not an error. */
export function ago(iso: string | null | undefined, from = Date.now()): string {
  if (!iso) return 'never'
  const diff = Math.max(0, from - new Date(iso).getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
