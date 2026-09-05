# Supabase setup

Cloud sync is optional. FTC Home is offline-first and fully functional against local IndexedDB with
none of this configured — a team that never sets up a project loses nothing except multi-device sync.

## 1 · Create a project

[supabase.com](https://supabase.com) → New project. Any region; the payload is small.

## 2 · Run the migrations

**All of them, in order.** There are five, and they are not optional extras —
accounts, invites and live updates each live in one of the later files, so a
project with only `0001` applied has sync and nothing else.

With the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Or paste each file into **SQL → New query** and run it, `0001` first. Every
file in this folder is safe to run twice, so a re-run is never a problem.

| File | What it adds |
|---|---|
| [`0001_init.sql`](migrations/0001_init.sql) | `teams`, the generic `records` document store keyed `(team_number, table_name, id)`, `current_team_number()` resolving the `x-team-secret` header, and RLS on both tables |
| [`0002_accounts.sql`](migrations/0002_accounts.sql) | `team_members`, the rules for who may accept whom, and `claim_team()` so a new team's first person is not waiting on an approval only they could give |
| [`0003_invites.sql`](migrations/0003_invites.sql) | `team_invites` and `accept_invite()` — the one path onto a team that does not need a coach to press approve |
| [`0004_realtime.sql`](migrations/0004_realtime.sql) | Puts `records` on the realtime publication, so a change on one device reaches the others in about a second instead of on the next timer. Skip it and sync still works, just slowly |
| [`0005_fix_invite_digest.sql`](migrations/0005_fix_invite_digest.sql) | Points the invite functions at the schema Supabase installs pgcrypto into. Without it, creating an invite fails with `function digest(text, unknown) does not exist` |

## 3 · Provision your team

```sql
select * from public.provision_team('11138', 'Robo Eclipse');
```

Returns the team number and its `sync_secret`. Copy the secret.

## 4 · Point the app at it

**Settings → Cloud sync** in the app. Three fields:

| Field | Where it comes from |
|---|---|
| Project URL | Dashboard → Settings → API → Project URL |
| Publishable key | Dashboard → Settings → API → Project API keys. Newer projects issue an `sb_publishable_…` key; older ones have a legacy `anon` JWT starting `eyJ…`. Either works |
| Team secret | Step 3 |

Press **Test connection**. It runs a real query, so a green result means RLS accepted the secret —
not that the fields look plausible.

Every device on the team pastes the same three values.

You can bake the URL and publishable key into the build with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` (see [`../.env.example`](../.env.example)). The team secret is
always runtime-only, so a public build never carries it.

**These three values are the shared-device route.** A pit laptop nobody signs
into syncs on the team secret alone. Anybody with their own account pastes
nothing: they sign in, a coach accepts them from the roster, and the database
authorises them by `auth.uid()` — see `0002_accounts.sql`.

## Security notes

**Use the publishable key. Never the secret one** (`sb_secret_…`, formerly `service_role`). The
secret key bypasses row-level security and this is a browser app — shipping it would make every
team's data world-readable.

**The team secret is a shared credential**, the same strength as the team code students already
share. It scopes rows to one team; it does not identify individuals. Anyone holding it can read and
write that team's rows.

Rotate it if it leaks:

```sql
update public.teams set sync_secret = gen_random_uuid() where team_number = '11138';
```

Every device then needs the new value.

**If you need per-user server-side auth** — a public deployment, or students you would not trust
with the whole team's data — swap the local credential check for Supabase Auth and rewrite the RLS
policies against `auth.uid()` and a membership table. The `records` schema does not need to change.

## Verifying it works

After a sync, in the SQL editor:

```sql
select table_name, count(*), max(updated_at)
from public.records
where team_number = '11138'
group by table_name
order by table_name;
```

In the app, **States & sync** shows the outbox from the other side: what is queued, how large, and
when it last drained.
