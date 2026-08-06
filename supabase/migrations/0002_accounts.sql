-- ═══════════════════════════════════════════════════════════════════════
-- FTC Home — real accounts
--
-- Run after 0001_init.sql. Adds Supabase Auth as a second way in, alongside
-- the shared team secret, without taking the first one away.
--
-- The two are genuinely different things and are kept apart on purpose:
--
--   • The **team secret** proves a *device* is syncing for a team. It is what
--     makes the app work at a competition where nobody can sign in, and it is
--     what 0001 built.
--   • An **auth account** proves a *person*. It follows them between devices
--     and is how email, Google and GitHub sign-in work.
--
-- Signing in does not put anybody on a team. `team_members` is the join, and
-- a coach writes it — see the approval flow in the app. Anything else means a
-- public sign-up page is also a way onto every team's roster.
-- ═══════════════════════════════════════════════════════════════════════

-- ── membership ─────────────────────────────────────────────────────────
-- One row per (person, team). `status` mirrors the app's Member lifecycle;
-- `role` is what they are on that team.
create table if not exists public.team_members (
  user_id      uuid not null references auth.users (id) on delete cascade,
  team_number  text not null references public.teams (team_number) on delete cascade,
  member_id    text not null,
  role         text not null default 'student'
                 check (role in ('coach', 'mentor', 'captain', 'student', 'parent', 'guest')),
  status       text not null default 'requested'
                 check (status in ('invited', 'requested', 'active', 'declined', 'suspended')),
  email        text,
  display_name text,
  approved_by  uuid references auth.users (id) on delete set null,
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  primary key (user_id, team_number)
);

create index if not exists team_members_team_idx on public.team_members (team_number, status);

-- ── helpers ────────────────────────────────────────────────────────────

/*
 * Teams the caller is an approved member of.
 *
 * `security definer` so the policies below can consult membership without
 * every one of them needing read access to the whole table, which would be
 * circular.
 */
create or replace function public.my_teams()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select tm.team_number
  from public.team_members tm
  where tm.user_id = auth.uid()
    and tm.status = 'active'
$$;

/** True when the caller is a coach or mentor on that team. */
create or replace function public.is_team_staff(target text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.user_id = auth.uid()
      and tm.team_number = target
      and tm.status = 'active'
      and tm.role in ('coach', 'mentor')
  )
$$;

-- ── row-level security ─────────────────────────────────────────────────
alter table public.team_members enable row level security;

-- Your own membership row, on any team, in any state: how a person sees that
-- their request is still pending.
drop policy if exists team_members_read_own on public.team_members;
create policy team_members_read_own on public.team_members
  for select using (user_id = auth.uid());

-- Staff see everyone on their own team, including the queue of requests.
drop policy if exists team_members_read_team on public.team_members;
create policy team_members_read_team on public.team_members
  for select using (public.is_team_staff(team_number));

/*
 * Anybody signed in may ask to join any team, as themselves, as a request.
 * The WITH CHECK is the whole security boundary: you cannot insert a row for
 * someone else, and you cannot insert yourself as already-active or as staff.
 */
drop policy if exists team_members_request on public.team_members;
create policy team_members_request on public.team_members
  for insert with check (
    user_id = auth.uid()
    and status = 'requested'
    and role in ('student', 'captain', 'parent', 'mentor', 'coach')
  );

-- Only staff decide. Note this also covers *changing* a role, which is why
-- there is no separate "promote" path.
drop policy if exists team_members_decide on public.team_members;
create policy team_members_decide on public.team_members
  for update using (public.is_team_staff(team_number))
  with check (public.is_team_staff(team_number));

drop policy if exists team_members_remove on public.team_members;
create policy team_members_remove on public.team_members
  for delete using (public.is_team_staff(team_number));

/*
 * The first person on a brand-new team has nobody to approve them.
 *
 * `claim_team` makes the caller a coach of a team that has no active members
 * yet, and refuses otherwise — so it can be called by anyone but only ever
 * does something once per team. Without it, a team's first coach would be
 * stuck waiting for an approval that only they could give.
 */
create or replace function public.claim_team(p_team_number text, p_display_name text default null)
returns public.team_members
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.team_members;
begin
  if auth.uid() is null then
    raise exception 'Sign in before claiming a team';
  end if;

  if exists (
    select 1 from public.team_members
    where team_number = p_team_number and status = 'active'
  ) then
    raise exception 'Team % already has members. Ask one of them to accept you.', p_team_number;
  end if;

  insert into public.teams (team_number, name)
  values (p_team_number, coalesce(p_display_name, ''))
  on conflict (team_number) do nothing;

  insert into public.team_members (user_id, team_number, member_id, role, status, email, display_name, approved_at)
  values (
    auth.uid(),
    p_team_number,
    'mem-' || replace(gen_random_uuid()::text, '-', ''),
    'coach',
    'active',
    (select email from auth.users where id = auth.uid()),
    p_display_name,
    now()
  )
  on conflict (user_id, team_number) do update
    set role = 'coach', status = 'active', approved_at = now()
  returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_team(text, text) from public;
grant execute on function public.claim_team(text, text) to authenticated;

-- ── records, for signed-in users ───────────────────────────────────────
/*
 * 0001 scopes `records` by the team-secret header. These add a second route in
 * for a signed-in member of the same team, so a person with an account does
 * not also have to be handed the team secret.
 *
 * Both routes coexist: a policy grants when *either* matches, which is what
 * lets one device sync by secret and another by account.
 */
drop policy if exists records_read_member on public.records;
create policy records_read_member on public.records
  for select using (team_number in (select public.my_teams()));

drop policy if exists records_write_member on public.records;
create policy records_write_member on public.records
  for insert with check (team_number in (select public.my_teams()));

drop policy if exists records_update_member on public.records;
create policy records_update_member on public.records
  for update using (team_number in (select public.my_teams()))
  with check (team_number in (select public.my_teams()));

-- ── team identity is not exclusive ─────────────────────────────────────
/*
 * A team number is a *label*, not a claim.
 *
 * Somebody could sign up as team 11138 having nothing to do with 11138. That
 * is a nuisance rather than a lockout: `teams.team_number` is unique, so the
 * real 11138 would have collided with them — hence `workspace_id` below.
 * Teams are addressed by their own id, the number is what they display, and
 * two workspaces may carry the same number without either blocking the other.
 *
 * The real team makes their own workspace, ignores the impostor's, and loses
 * nothing. See docs/team-identity.md for why this is the mitigation that
 * matters and verification is not available.
 */
alter table public.teams
  add column if not exists workspace_id uuid not null default gen_random_uuid();

create unique index if not exists teams_workspace_idx on public.teams (workspace_id);

/** Last time anything was written for this team, so dormant claims are visible. */
alter table public.teams
  add column if not exists last_active_at timestamptz not null default now();

create or replace function public.touch_team_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.teams
    set last_active_at = now()
    where team_number = new.team_number;
  return new;
end;
$$;

drop trigger if exists records_touch_team on public.records;
create trigger records_touch_team
  after insert or update on public.records
  for each row execute function public.touch_team_activity();

-- ── chat ───────────────────────────────────────────────────────────────
-- Channels and messages ride the same generic `records` table as everything
-- else, so nothing is needed here. They are listed in the app's SyncTable
-- union and inherit the policies above.
