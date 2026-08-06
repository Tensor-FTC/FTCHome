import { BUILT_IN_SUBTEAMS, SUBTEAM_LABEL, type Member, type SeasonData, type SubteamDef } from './types'

/**
 * Subteams.
 *
 * Two things the old model got wrong. It was a closed union, so a team with a
 * CAD subteam or a pit crew had nowhere to put them; and a member had exactly
 * one, which is wrong for most students by February.
 *
 * The list lives on the season, so it syncs — a subteam somebody invents while
 * signing up appears for the whole team rather than only on their device.
 */

/** The team's list, with the built-ins guaranteed present and first. */
export function allSubteams(season: SeasonData): SubteamDef[] {
  const custom = (season.subteams ?? []).filter((s) => !s.builtIn)
  const seen = new Set(BUILT_IN_SUBTEAMS.map((s) => s.id))
  return [...BUILT_IN_SUBTEAMS, ...custom.filter((s) => !seen.has(s.id))]
}

export function subteamLabel(season: SeasonData, id: string): string {
  return season.subteams?.find((s) => s.id === id)?.label ?? SUBTEAM_LABEL[id] ?? id
}

/** A stable id from a typed name, so two people adding "Pit Crew" land on one. */
export function subteamId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function memberSubteams(member: Pick<Member, 'subteams'> | null | undefined): string[] {
  return member?.subteams ?? []
}

export function inSubteam(member: Pick<Member, 'subteams'> | null | undefined, id: string): boolean {
  return memberSubteams(member).includes(id)
}

/** For the one-line summaries: "Mechanical · Software". */
export function describeSubteams(season: SeasonData, member: Pick<Member, 'subteams'>): string {
  return memberSubteams(member)
    .map((id) => subteamLabel(season, id))
    .join(' · ')
}

/** Everyone currently on a given subteam, for channels and task filters. */
export function membersOf(season: SeasonData, id: string): Member[] {
  return season.members.filter((m) => m.status === 'active' && inSubteam(m, id))
}
