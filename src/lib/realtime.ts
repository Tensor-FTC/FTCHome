import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from './supabase'

/**
 * Live updates.
 *
 * Sync worked, but only when somebody pressed the button or a five-minute
 * timer came round — which on a real team is close to not syncing at all. A
 * task assigned in the pit took minutes to reach the phone it was assigned to,
 * and two people working the same afternoon saw each other's changes whenever
 * they happened to reload.
 *
 * So the client subscribes to its own team's rows and pulls the moment
 * anything lands. Row-level security applies to the stream exactly as it does
 * to a select, so this changes *when* you find out, never *what* you may see.
 *
 * Deliberately not a data channel. The payload is ignored and a normal sync is
 * run instead: that keeps one code path for merging, the outbox, and conflict
 * handling, rather than a second one that only exists when the socket is up.
 * The socket is a doorbell, not a delivery.
 */

export type Unsubscribe = () => void

/**
 * Watch one team's records.
 *
 * `onChange` fires on any insert, update or delete for that team, including
 * this device's own writes echoing back. That is harmless — a sync with
 * nothing new is a cheap no-op — and filtering them out would need the client
 * to track its own writes through the socket, which is more machinery than the
 * duplicate costs.
 */
export async function watchTeamRecords(
  teamNumber: string,
  onChange: () => void,
): Promise<Unsubscribe> {
  if (!teamNumber) return () => {}
  const sb = await getSupabase()
  if (!sb) return () => {}

  let channel: RealtimeChannel | null = sb
    .channel(`records:${teamNumber}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'records',
        // Server-side, so a busy shared project does not push every other
        // team's traffic down this socket to be discarded here.
        filter: `team_number=eq.${teamNumber}`,
      },
      onChange,
    )
    .subscribe()

  return () => {
    if (!channel) return
    void sb.removeChannel(channel)
    channel = null
  }
}
