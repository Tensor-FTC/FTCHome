import { useMemo } from 'react'
import { useStore, currentMember } from '@/store/useStore'
import { can, canMember, type Capability } from './permissions'
import { effectiveRole } from './founder'

/**
 * What the signed-in person may do.
 *
 * Three layers, resolved here so no screen has to remember the order: the
 * fixed role matrix, the team's visibility policy, and anything a coach has
 * granted this person by name.
 *
 * Falls back to the session role when there is no member record — a guest
 * browsing, or a device signed in before the roster has synced. A coach using
 * Settings → "check what others see" also has a session role that deliberately
 * differs from their member record, and that preview has to win.
 */
export function useCan(): (capability: Capability) => boolean {
  const role = useStore((s) => s.session.role)
  const awaiting = useStore((s) => s.session.awaitingApproval)
  const previewing = useStore((s) => Boolean(s.session.previewOf))
  const me = useStore(currentMember)
  const members = useStore((s) => s.season.members)
  const policy = useStore((s) => s.season.settings.policy)

  return useMemo(() => {
    // Somebody whose request has not been accepted has no standing at all yet.
    if (awaiting) return () => false
    // Role preview: a coach is looking at somebody else's view, so the preview
    // role wins over their own record — including its grants.
    if (previewing) return (c: Capability) => can(role, c, policy)
    if (me) {
      // A student who started the team stands in for the coach it does not
      // have yet. Resolved here so it applies everywhere at once and expires
      // on its own when real staff arrive.
      const acting = { ...me, role: effectiveRole(me, members) }
      return (c: Capability) => canMember(acting, c, policy)
    }
    return (c: Capability) => can(role, c, policy)
  }, [role, awaiting, previewing, me, members, policy])
}
