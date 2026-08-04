-- ═══════════════════════════════════════════════════════════════════════
-- FTC Home — cloud sync schema
--
-- Run against a fresh Supabase project:
--   supabase db push          (CLI)
-- or paste into the SQL editor at Dashboard → SQL → New query.
--
-- Shape: one generic `records` table holding a JSON document per entity,
-- scoped by team. The client is offline-first and merges per record on
-- `updated_at`, so the server only needs identity, scope and recency —
-- pushing the entity schema into Postgres would buy nothing here and would
-- force a migration every time the app model moves.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── teams ──────────────────────────────────────────────────────────────
-- One row per team. `sync_secret` is the shared credential a team pastes
-- into Settings → Sync; every RLS policy below keys on it.
create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  team_number  text not null unique,
  name         text not null default '',
  sync_secret  uuid not null default gen_random_uuid(),
  created_at   timestamptz not null default now()
);

create index if not exists teams_sync_secret_idx on public.teams (sync_secret);

-- ── records ────────────────────────────────────────────────────────────
create table if not exists public.records (
  id          text not null,
  team_number text not null references public.teams (team_number) on delete cascade,
  table_name  text not null,
  data        jsonb not null,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (team_number, table_name, id)
);

create index if not exists records_pull_idx
  on public.records (team_number, updated_at desc);

create index if not exists records_table_idx
  on public.records (team_number, table_name);

-- ── row-level security ─────────────────────────────────────────────────
-- The client sends `x-team-secret` on every request (see src/lib/supabase.ts).
-- This resolves it to a team number; everything else is scoped to that.
create or replace function public.current_team_number()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.team_number
  from public.teams t
  where t.sync_secret = nullif(
    current_setting('request.headers', true)::json ->> 'x-team-secret',
    ''
  )::uuid
$$;

alter table public.teams   enable row level security;
alter table public.records enable row level security;

drop policy if exists teams_self_read on public.teams;
create policy teams_self_read on public.teams
  for select
  using (team_number = public.current_team_number());

drop policy if exists records_team_read on public.records;
create policy records_team_read on public.records
  for select
  using (team_number = public.current_team_number());

drop policy if exists records_team_insert on public.records;
create policy records_team_insert on public.records
  for insert
  with check (team_number = public.current_team_number());

drop policy if exists records_team_update on public.records;
create policy records_team_update on public.records
  for update
  using (team_number = public.current_team_number())
  with check (team_number = public.current_team_number());

drop policy if exists records_team_delete on public.records;
create policy records_team_delete on public.records
  for delete
  using (team_number = public.current_team_number());

-- Keep `updated_at` honest even if a client sends a stale value.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := greatest(coalesce(new.updated_at, now()), now());
  return new;
end;
$$;

drop trigger if exists records_touch_updated_at on public.records;
create trigger records_touch_updated_at
  before insert or update on public.records
  for each row execute function public.touch_updated_at();

-- ── bootstrap helper ───────────────────────────────────────────────────
-- Creates a team and hands back its sync secret. Call once from the SQL
-- editor, then paste the secret into the app.
--
--   select * from public.provision_team('11138', 'Robo Eclipse');
create or replace function public.provision_team(p_number text, p_name text)
returns table (team_number text, sync_secret uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.teams (team_number, name)
  values (p_number, p_name)
  on conflict (team_number) do update set name = excluded.name;

  return query
    select t.team_number, t.sync_secret from public.teams t where t.team_number = p_number;
end;
$$;

revoke execute on function public.provision_team(text, text) from anon, authenticated;
