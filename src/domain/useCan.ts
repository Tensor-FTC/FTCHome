import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { can, type Capability } from './permissions'

/**
 * Capability check bound to the signed-in role *and* the team's visibility
 * policy. Screens call `allow('budget.viewAmounts')` rather than testing roles,
 * so widening or tightening a team's settings takes effect everywhere at once.
 */
export function useCan(): (capability: Capability) => boolean {
  const role = useStore((s) => s.session.role)
  const policy = useStore((s) => s.season.settings.policy)
  return useMemo(() => (capability: Capability) => can(role, capability, policy), [role, policy])
}
