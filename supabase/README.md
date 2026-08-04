# Supabase setup

Cloud sync is optional. FTC Home is offline-first and fully functional against local IndexedDB with
none of this configured — a team that never sets up a project loses nothing except multi-device sync.

## 1 · Create a project

[supabase.com](https://supabase.com) → New project. Any region; the payload is small.

## 2 · Run the migration

With the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Or paste [`migrations/0001_init.sql`](migrations/0001_init.sql) into **SQL → New query** and run it.

This creates:

- `teams` — one row per team, holding the `sync_secret` that scopes everything else
- `records` — a generic document store, keyed `(team_number, table_name, id)`
- `current_team_number()` — resolves the `x-team-secret` request header to a team
- RLS policies on both tables, so a client can only ever touch its own team's rows

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
| Anon key | Dashboard → Settings → API → Project API keys → `anon` `public` |
| Team secret | Step 3 |

Press **Test connection**. It runs a real query, so a green result means RLS accepted the secret —
not that the fields look plausible.

Every device on the team pastes the same three values.

You can bake the URL and anon key into the build with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (see [`../.env.example`](../.env.example)). The team secret is always
runtime-only, so a public build never carries it.

## Security notes

**Use the `anon` key. Never the `service_role` key.** The service key bypasses row-level security
and this is a browser app — shipping it would make every team's data world-readable.

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
