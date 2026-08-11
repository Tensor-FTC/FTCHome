-- ════════════════════════════════════════════════════════════════════
-- 0004 · Live updates
--
-- Sync worked, but only when somebody pressed the button or a five-minute
-- timer came round. On a team that is the same as not syncing: two people
-- editing the same afternoon saw each other's work when they happened to
-- reload, and a task assigned in the pit took minutes to reach the phone it
-- was assigned to.
--
-- Adding `records` to the realtime publication lets a client subscribe to
-- changes for its own team and pull the moment anything lands. Row-level
-- security still applies to the stream — Realtime evaluates the same policies
-- as a normal select — so this widens *timeliness*, never visibility.
-- ════════════════════════════════════════════════════════════════════

-- `alter publication ... add table` errors if the table is already a member,
-- which makes re-running this file fail. The catalogue lookup keeps every
-- migration in this folder safe to run twice.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end
$$;

/*
 * Realtime sends the *old* row on an update or delete only when the table is
 * told to keep it. Without this a delete arrives with nothing but an id, and a
 * client cannot tell which team it belonged to — so it cannot decide whether
 * the change is even its own.
 */
alter table public.records replica identity full;
