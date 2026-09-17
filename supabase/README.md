# Supabase

The database behind FTC Home's sync and sign-in.

**The full guide is [docs/SUPABASE.md](../docs/SUPABASE.md)** — setup, sign-in
providers, a health check, day-to-day admin SQL, limits, troubleshooting, and
exactly what the database does and does not enforce.

Sync is optional. With none of this set up, the app still runs completely on
each device; it just does not share anything between them.

## Migrations

**Run all six, in order.** Each builds on the one before, and every file is safe
to run twice.

| File | Adds |
|---|---|
| [`0001_init.sql`](migrations/0001_init.sql) | `teams`, the `records` table every synced item lives in, and the team-secret route for shared devices |
| [`0002_accounts.sql`](migrations/0002_accounts.sql) | `team_members`, `claim_team()`, and the rules for who may accept whom |
| [`0003_invites.sql`](migrations/0003_invites.sql) | `team_invites`, `create_invite()` and `accept_invite()` |
| [`0004_realtime.sql`](migrations/0004_realtime.sql) | Live updates: a change reaches other devices in about a second |
| [`0005_fix_invite_digest.sql`](migrations/0005_fix_invite_digest.sql) | Lets the invite functions find `pgcrypto`; without it invites fail with `function digest(text, unknown) does not exist` |
| [`0006_server_timestamps.sql`](migrations/0006_server_timestamps.sql) | Stamps every row with the server's clock, so a device with a wrong clock cannot make others skip rows |

**Dashboard:** SQL editor → New query → paste one file → Run. `0001` first.

**CLI:**

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Then run the [health check](../docs/SUPABASE.md#8--health-check).

## Adding a migration

- Number it next in sequence and never edit one that has already run anywhere —
  add a new file that changes what you need.
- Make it safe to run twice: `create or replace`, `if not exists`, and guards
  like the catalogue check in `0004`.
- Say at the top what was wrong and why this is the fix. The next person reads
  these files to understand the database, not just to run them.
- Add it to the tables here and in `docs/SUPABASE.md`, and add a row to the
  health check if the app depends on it.
