-- ═══════════════════════════════════════════════════════════════════════
-- FTC Home — invites
--
-- Run after 0002_accounts.sql.
--
-- 0002 let anyone signed in knock on any team's door and wait for a coach.
-- That stays as a fallback, but it is no longer the front door: the way onto
-- a team is that somebody already on it invited you.
--
-- Two shapes of invite, because both failure modes are real:
--
--   • **Email-bound** — the tight one. The invite is visible only to the
--     account whose email matches. It cannot be forwarded, and a screenshot
--     in a group chat is worth nothing.
--   • **Code** — the fallback. A student's Google account is very often not
--     the address their coach typed, and "the invite never showed up" with no
--     way forward is how a tool stops being used in week one. A code is a
--     bearer token, so it is short-lived, use-capped and revocable.
--
-- Invites are NOT staff-only. Any active member may bring somebody in, which
-- is how a captain adds the freshman who joined on Tuesday. What a member may
-- not do is invite somebody at a rank above their own — see the role cap in
-- `create_invite`. Otherwise "invite a friend" would be a way to mint coaches,
-- and coach is the role that sees minors' contact details.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create table if not exists public.team_invites (
  id           uuid primary key default gen_random_uuid(),
  team_number  text not null references public.teams (team_number) on delete cascade,

  -- Exactly one of these is the binding. Email is stored lower-cased so
  -- matching is not a casing puzzle.
  email        text,
  code_hash    text,

  role         text not null default 'student'
                 check (role in ('coach', 'mentor', 'captain', 'student', 'parent')),
  invited_by   uuid not null references auth.users (id) on delete cascade,
  note         text,

  max_uses     integer not null default 1 check (max_uses between 1 and 50),
  uses         integer not null default 0,
  expires_at   timestamptz not null default now() + interval '30 days',
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),

  constraint invite_needs_a_binding check (email is not null or code_hash is not null)
);

create index if not exists team_invites_team_idx  on public.team_invites (team_number);
create index if not exists team_invites_email_idx on public.team_invites (email);
create unique index if not exists team_invites_code_idx
  on public.team_invites (code_hash) where code_hash is not null;

alter table public.team_invites enable row level security;

-- ── helpers ────────────────────────────────────────────────────────────

/** The signed-in user's email, lower-cased. Used to match email invites. */
create or replace function public.my_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(email) from auth.users where id = auth.uid()
$$;

/**
 * Ranking, so a member cannot invite somebody above themselves.
 * Higher wins. Everything not listed is 0.
 */
create or replace function public.role_rank(r text)
returns integer
language sql
immutable
as $$
  select case r
    when 'coach'   then 40
    when 'mentor'  then 30
    when 'captain' then 20
    when 'student' then 10
    when 'parent'  then 10
    else 0
  end
$$;

/** The caller's role on a team, or null if they are not an active member. */
create or replace function public.my_role(target text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tm.role
  from public.team_members tm
  where tm.user_id = auth.uid()
    and tm.team_number = target
    and tm.status = 'active'
  limit 1
$$;

-- ── row-level security ─────────────────────────────────────────────────

/*
 * Members see their team's invites, so a coach can see what is outstanding
 * and a captain can see the one they sent.
 *
 * A signed-in person also sees invites addressed to their own email, on any
 * team — that is how "you have been invited" appears after sign-in without
 * them being on the team yet.
 *
 * Note `code_hash` is a hash, so even reading the row does not yield a usable
 * code. The plaintext is shown once, at creation, and never stored.
 */
drop policy if exists team_invites_read on public.team_invites;
create policy team_invites_read on public.team_invites
  for select using (
    team_number in (select public.my_teams())
    or (email is not null and email = public.my_email())
  );

-- Writes go through the functions below, never straight from the client:
-- the role cap and the hashing both have to be enforced server-side.
drop policy if exists team_invites_revoke on public.team_invites;
create policy team_invites_revoke on public.team_invites
  for update using (public.is_team_staff(team_number))
  with check (public.is_team_staff(team_number));

drop policy if exists team_invites_delete on public.team_invites;
create policy team_invites_delete on public.team_invites
  for delete using (public.is_team_staff(team_number));

-- ── creating an invite ─────────────────────────────────────────────────

/*
 * Returns the row plus, when a code was generated, the plaintext code —
 * which is the only time it exists in readable form. Store the hash, show the
 * code once, exactly like the team secret.
 */
create or replace function public.create_invite(
  p_team_number text,
  p_role        text default 'student',
  p_email       text default null,
  p_note        text default null,
  p_max_uses    integer default 1,
  p_expires_in  interval default interval '30 days'
)
returns table (id uuid, code text, email text, role text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  new_code    text;
  new_hash    text;
  created     public.team_invites;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;

  caller_role := public.my_role(p_team_number);
  if caller_role is null then
    raise exception 'Only a member of team % can invite somebody to it', p_team_number;
  end if;

  -- The whole reason this is a function and not an INSERT policy.
  if public.role_rank(p_role) > public.role_rank(caller_role) then
    raise exception 'A % cannot invite somebody as %', caller_role, p_role;
  end if;

  -- No email means a shareable code, which is a bearer token: keep it short
  -- lived by default and always capped.
  if p_email is null then
    new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    new_hash := encode(digest(new_code, 'sha256'), 'hex');
  end if;

  insert into public.team_invites
    (team_number, email, code_hash, role, invited_by, note, max_uses, expires_at)
  values (
    p_team_number,
    lower(nullif(trim(p_email), '')),
    new_hash,
    p_role,
    auth.uid(),
    p_note,
    greatest(1, least(coalesce(p_max_uses, 1), 50)),
    now() + coalesce(p_expires_in, interval '30 days')
  )
  returning * into created;

  return query select created.id, new_code, created.email, created.role, created.expires_at;
end;
$$;

revoke all on function public.create_invite(text, text, text, text, integer, interval) from public;
grant execute on function public.create_invite(text, text, text, text, integer, interval) to authenticated;

-- ── accepting an invite ────────────────────────────────────────────────

/*
 * Accept by code, or accept an email invite by id.
 *
 * `security definer` because the caller is by definition not yet on the team,
 * so no policy could let them write their own membership row. The checks that
 * would have lived in a policy are all here instead — and this is the only
 * path that can create an `active` membership without a coach clicking
 * approve, which is exactly what an invite is for.
 */
create or replace function public.accept_invite(
  p_code text default null,
  p_id   uuid default null
)
returns public.team_members
language plpgsql
security definer
set search_path = public
as $$
declare
  inv    public.team_invites;
  joined public.team_members;
begin
  if auth.uid() is null then
    raise exception 'Sign in before accepting an invite';
  end if;

  if p_code is not null then
    select * into inv from public.team_invites
     where code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex');
  elsif p_id is not null then
    -- Email invites are claimable only by the matching account. Without this
    -- an id — which teammates can see — would be enough to join.
    select * into inv from public.team_invites
     where id = p_id
       and email is not null
       and email = public.my_email();
  else
    raise exception 'Provide an invite code';
  end if;

  if inv.id is null then
    raise exception 'That invite does not exist';
  end if;
  if inv.revoked_at is not null then
    raise exception 'That invite was revoked';
  end if;
  if inv.expires_at < now() then
    raise exception 'That invite has expired';
  end if;
  if inv.uses >= inv.max_uses then
    raise exception 'That invite has already been used';
  end if;

  insert into public.team_members
    (user_id, team_number, member_id, role, status, email, display_name, approved_by, approved_at)
  values (
    auth.uid(),
    inv.team_number,
    'mem-' || replace(gen_random_uuid()::text, '-', ''),
    inv.role,
    'active',
    public.my_email(),
    null,
    inv.invited_by,
    now()
  )
  on conflict (user_id, team_number) do update
    set status      = 'active',
        role        = excluded.role,
        approved_by = excluded.approved_by,
        approved_at = now()
  returning * into joined;

  update public.team_invites
     set uses = uses + 1
   where id = inv.id;

  return joined;
end;
$$;

revoke all on function public.accept_invite(text, uuid) from public;
grant execute on function public.accept_invite(text, uuid) to authenticated;

-- ── what a signed-in person can see before joining ─────────────────────

/**
 * Invites waiting for the signed-in account, with the team's display name.
 *
 * Deliberately exposes nothing but the team number, name and role: somebody
 * holding an invite is not yet on the team and has no business reading its
 * roster.
 */
create or replace function public.my_invites()
returns table (id uuid, team_number text, team_name text, role text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.team_number, t.name, i.role, i.expires_at
  from public.team_invites i
  join public.teams t on t.team_number = i.team_number
  where i.email is not null
    and i.email = public.my_email()
    and i.revoked_at is null
    and i.expires_at > now()
    and i.uses < i.max_uses
    and not exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
        and tm.team_number = i.team_number
        and tm.status = 'active'
    )
$$;

revoke all on function public.my_invites() from public;
grant execute on function public.my_invites() to authenticated;
