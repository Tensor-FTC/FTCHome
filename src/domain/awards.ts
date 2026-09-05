import type { TeamAward } from './types'

/**
 * Awards, for reading.
 *
 * Nothing here authors a fact. Upstream's own name for an award is what gets
 * shown; these functions only tidy its casing and turn a placement number into
 * the ordinal a person would say out loud. A lookup table of friendly names
 * would be a guess, and one that goes wrong the season FIRST renames an award.
 */

/**
 * `INSPIRE_AWARD` and `Inspire` both come back as "Inspire", because upstream
 * has used both shapes and neither is something to show a team as-is.
 */
export function awardLabel(type: string): string {
  const words = type
    .replace(/[_-]+/g, ' ')
    // `InspireAward` → `Inspire Award`, without splitting an acronym apart.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === w.toUpperCase() && w.length > 3 ? w[0] + w.slice(1).toLowerCase() : w))

  // "Inspire Award, 1st" already says award; repeating it reads like a stutter.
  const trimmed = words.filter((w, i) => !(i === words.length - 1 && /^awards?$/i.test(w)))
  const out = (trimmed.length ? trimmed : words).join(' ')
  return out ? out[0].toUpperCase() + out.slice(1) : type
}

/** "1st", "2nd", "3rd" — and nothing at all when upstream did not say. */
export function placementLabel(placement: number): string {
  if (!placement || placement < 1) return ''
  const tens = placement % 100
  if (tens >= 11 && tens <= 13) return `${placement}th`
  const suffix = ['th', 'st', 'nd', 'rd'][placement % 10] ?? 'th'
  return `${placement}${suffix}`
}

/** "Inspire · 2nd", or just "Inspire" when there is no placement. */
export function describeAward(award: TeamAward): string {
  const place = placementLabel(award.placement)
  return place ? `${awardLabel(award.type)} · ${place}` : awardLabel(award.type)
}

/**
 * The awards worth leading with, best first.
 *
 * A season can carry a dozen across several events, and a card has room for
 * two or three. Wins first, then seconds, so what is shown is the team's best
 * result rather than whichever event happened to be fetched first.
 */
export function topAwards(awards: TeamAward[], limit = 3): TeamAward[] {
  return [...awards]
    .sort((a, b) => (a.placement || 99) - (b.placement || 99) || a.type.localeCompare(b.type))
    .slice(0, limit)
}
