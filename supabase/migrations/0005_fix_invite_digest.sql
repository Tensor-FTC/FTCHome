-- ════════════════════════════════════════════════════════════════════
-- 0005 · Make invites work
--
-- Creating an invite failed with:
--
--     function digest(text, unknown) does not exist
--
-- `digest()` comes from pgcrypto, and `0003` does create the extension. The
-- problem is where it lands: Supabase installs extensions into the
-- `extensions` schema, while both invite functions are declared
-- `set search_path = public`. A `security definer` function only sees the
-- schemas on its own search_path, so pgcrypto was installed, present, and
-- invisible.
--
-- Pinning search_path on a definer function is the right instinct — it is what
-- stops a caller shadowing a table name with their own — so the fix is to name
-- the schema that is genuinely needed rather than to unpin it.
--
-- `alter function` rather than `create or replace`: the bodies are correct and
-- copying them here would mean two versions to keep in step.
-- ════════════════════════════════════════════════════════════════════

alter function public.create_invite(text, text, text, text, integer, interval)
  set search_path = public, extensions;

alter function public.accept_invite(text, uuid)
  set search_path = public, extensions;

/*
 * Belt and braces: make sure the extension is somewhere both functions can now
 * reach. `if not exists` leaves an existing install alone, wherever it already
 * lives.
 */
create extension if not exists pgcrypto with schema extensions;
