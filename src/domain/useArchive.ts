import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { today as todayIso } from '@/lib/date'
import { partitionSeason, type ArchiveResult } from './archive'

/**
 * The live half of the season.
 *
 * Every screen reads through this rather than off `season.*` directly, so one
 * setting controls how much history the whole app shows. The split is memoised
 * on the season and the cutoff, so switching screens does not recompute it.
 */
export function useArchive(): ArchiveResult {
  const season = useStore((s) => s.season)
  const iso = todayIso()
  return useMemo(() => partitionSeason(season, iso), [season, iso])
}
