# Supabase for FTC Home

Everything about the database and sign-in, in one place: what it does, how to
set it up, how to check it is healthy, how to run it day to day, and what to do
when something goes wrong.

The general walkthrough — hosting, installing on phones — is in
[SETUP.md](SETUP.md). How to prove it all works on real devices is in
[TESTING.md](TESTING.md).

**Contents**

1. [What Supabase does here](#1--what-supabase-does-here)
2. [Setup checklist](#2--setup-checklist)
3. [Create the project](#3--create-the-project)
4. [Run the migrations](#4--run-the-migrations)
5. [Connect the app](#5--connect-the-app)
6. [Sign-in](#6--sign-in)
7. [Live updates](#7--live-updates)
8. [Health check](#8--health-check)
9. [Running it day to day](#9--running-it-day-to-day)
10. [Plans, limits and pausing](#10--plans-limits-and-pausing)
11. [Troubleshooting](#11--troubleshooting)
12. [Security: what is and is not enforced](#12--security-what-is-and-is-not-enforced)
13. [Reference](#13--reference)

---

## Tensor's project at a glance

| | |
|---|---|
| Project ref | `igpagxaccibxplinhzkq` |
| API URL | `https://igpagxaccibxplinhzkq.supabase.co` |
| OAuth callback (paste into Google, GitHub, Microsoft) | `https://igpagxaccibxplinhzkq.supabase.co/auth/v1/callback` |
| Site URL | `https://tensor-ftc.github.io/FTCHome/` |
| Dashboard | <https://supabase.com/dashboard/project/igpagxaccibxplinhzkq> |
| SQL editor | <https://supabase.com/dashboard/project/igpagxaccibxplinhzkq/sql/new> |
| Sign-in providers | <https://supabase.com/dashboard/project/igpagxaccibxplinhzkq/auth/providers> |
| URL configuration | <https://supabase.com/dashboard/project/igpagxaccibxplinhzkq/auth/url-configuration> |
| Email templates | <https://supabase.com/dashboard/project/igpagxaccibxplinhzkq/auth/templates> |
| Users | <https://supabase.com/dashboard/project/igpagxaccibxplinhzkq/auth/users> |

None of these are secrets. The project URL and publishable key are shipped to
every browser that opens the app; that is what they are for. The **secret** key
is the one that must never appear anywhere — see [§12](#12--security-what-is-and-is-not-enforced).

> Supabase moves dashboard pages around occasionally. If a link above lands on
> the wrong page, each section below also says where to click.

---

## 1 · What Supabase does here

FTC Home is **offline-first**. Each device keeps the whole season in its own
browser database, and that copy is the one every screen reads. Supabase is a
*peer* that devices sync through — never something a screen waits on.

```
   phone ──┐                                      ┌── laptop
           │  push what changed, pull what's new  │
           ▼                                      ▼
   ┌────────────────────── Supabase ──────────────────────┐
   │  records        every synced item, one row each      │
   │  team_members   who is on which team, and their role │
   │  team_invites   codes and email invites              │
   │  teams          team numbers, and the device secret  │
   │                                                      │
   │  Auth           Google · GitHub · Microsoft · email  │
   │  Realtime       "something changed" → devices pull   │
   └──────────────────────────────────────────────────────┘
```

**What goes through it:** roster, calendar, tasks, budget and sponsors,
purchase requests, parts, weekly reports, scouting notes, chat, and the
*records* of build-log photos.

**What does not:**

- **Competition facts** — teams, events, rankings, results — come straight from
  [FTCScout](https://ftcscout.org) and are cached on each device.
- **The photo, video and CAD files themselves.** Only their records sync. A
  photo taken on one phone shows up on the laptop as an entry with no image.
  See [ROADMAP.md](ROADMAP.md#2-photos-and-files-do-not-sync).
- **Appearance** (theme and accent) is per device on purpose.

### How somebody gets to read and write

There are two routes, and a request needs only one of them.

| Route | Who it is for | How the database knows |
|---|---|---|
| **An account** | Every person. The normal route. | The sign-in token identifies the user; `my_teams()` looks them up in `team_members`, and only `active` rows count. |
| **The team secret** | A shared pit laptop nobody signs into. | The device sends an `x-team-secret` header; `current_team_number()` matches it against `teams.sync_secret`. |

### How somebody gets onto a team

```
signs in ──► is the team empty? ──yes──► claim_team()  ──► active (the founder)
                    │
                    no
                    ▼
            holding an invite code? ──yes──► accept_invite() ──► active, with the code's role
                    │
                    no
                    ▼
            join request (status "requested") ──► a coach or mentor accepts ──► active
```

- **The founder** picks their real role. If that is not coach or mentor, they
  hold admin rights until a coach or mentor is active, and then it hands over by
  itself.
- **Adding somebody on the roster with their email** means they go straight in
  the first time they sign in with that address.
- The app does all of this on its own, before every sync. Nobody runs these
  functions by hand.

### When syncing happens

- **About a second after any change** on this device.
- **About a second after any change on another device**, through Realtime.
- **When a phone wakes up** or comes back online.
- **Every two minutes** as a safety net, in case the live connection dropped.
- **When somebody presses Sync now** on the States & sync screen.

If two devices change the same item, **the later change wins.**

---

## 2 · Setup checklist

Tick these off in order. Each links to its section.

- [ ] [Project created](#3--create-the-project)
- [ ] [All six migrations run](#4--run-the-migrations), `0001` to `0006`
- [ ] [Health check](#8--health-check) shows every row as `true` except the last
- [ ] [Repository secrets set](#51-bake-the-keys-into-the-build) so nobody pastes keys
- [ ] [URL configuration](#61-url-configuration) — site URL and redirect URLs
- [ ] [Google](#62-google) — client created **and the consent screen published**
- [ ] [GitHub](#63-github)
- [ ] [Microsoft](#64-microsoft)
- [ ] [Email](#65-email) — decide whether to set up your own mail sender
- [ ] First sign-in done; health check's last row is now `true`
- [ ] [Pausing](#10--plans-limits-and-pausing) — keep-alive workflow running, or a paid plan

---

## 3 · Create the project

1. Sign up at [supabase.com](https://supabase.com). The free plan is plenty for a team.
2. **New project.** Pick a region near you. Save the database password
   somewhere safe — you will not need it for this, but you cannot see it again.
3. Wait a minute or two for it to finish.

---

## 4 · Run the migrations

The files in [`supabase/migrations/`](../supabase/migrations) build the
database. **Run all six, in order.** Later files depend on earlier ones, and a
missing one shows up much later as a feature that half works rather than as a
clear error.

| File | What it adds | What breaks without it |
|---|---|---|
| [`0001_init.sql`](../supabase/migrations/0001_init.sql) | `teams`, `records`, the team-secret route, and `provision_team` | Everything |
| [`0002_accounts.sql`](../supabase/migrations/0002_accounts.sql) | `team_members`, `claim_team`, and the rules for who may accept whom | Signing in; every write fails with a row-level security error |
| [`0003_invites.sql`](../supabase/migrations/0003_invites.sql) | `team_invites`, `create_invite`, `accept_invite` | Invite codes |
| [`0004_realtime.sql`](../supabase/migrations/0004_realtime.sql) | Live updates for `records` | Changes still arrive, but only on the two-minute timer |
| [`0005_fix_invite_digest.sql`](../supabase/migrations/0005_fix_invite_digest.sql) | Lets the invite functions find `pgcrypto` | Creating an invite fails with `function digest(text, unknown) does not exist` |
| [`0006_server_timestamps.sql`](../supabase/migrations/0006_server_timestamps.sql) | Stamps every synced row with the server's clock | One device with a fast clock can make other devices silently skip rows — some data shows on one phone and never on another |

**How to run them:** SQL editor → **New query** → paste the whole file → **Run**.
One file at a time, `0001` first. An empty result with "Success" is correct —
these create things rather than return rows.

**Every file is safe to run twice.** If you are not sure whether one went
through, run it again.

With the Supabase CLI instead: `supabase link --project-ref <ref>` then
`supabase db push`.

Then run the [health check](#8--health-check).

---

## 5 · Connect the app

### 5.1 Bake the keys into the build

So nobody has to paste anything, add two **repository secrets** in GitHub:
**Settings → Secrets and variables → Actions → New repository secret.**

| Secret | Value | Where to find it |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Project Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | starts `sb_publishable_` | Project Settings → API Keys |

The next deploy picks them up. Older projects show a legacy `anon` key starting
`eyJ` instead of a publishable key; that works too.

> ⚠️ **Never** use the key starting `sb_secret_` (formerly `service_role`). It
> ignores every security rule in the database, and anything in a build is
> readable by anyone who opens the site.

### 5.2 Or paste them at runtime

**Settings → Sync → Connect a project** in the app takes the URL, the
publishable key, and — only for a shared device — the team secret. **Test
connection** runs a real query, so green means it genuinely worked.

### 5.3 The team secret, for a shared device only

In the SQL editor, with your number and name:

```sql
select * from public.provision_team('26022', 'Your Team Name');
```

It returns the secret. Paste it into **Settings → Sync** on the shared laptop.
People with accounts never need it.

---

## 6 · Sign-in

### 6.1 URL configuration

**Authentication → URL Configuration.**

- **Site URL:** `https://tensor-ftc.github.io/FTCHome/`
- **Redirect URLs** — add both:
  - `https://tensor-ftc.github.io/FTCHome/**`
  - `http://localhost:5173/**`

A missing entry here is the most common reason a sign-in comes back to an error
or to a blank page. If the app ever moves to its own domain, add the new
address here too.

### 6.2 Google

**Supabase:** Authentication → Sign In / Providers → **Google**.

**Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com), project `ftc-home`):

1. **Google Auth Platform → Branding.** App name `FTC Home`, your email, and
   optionally the logo from `public/brand/icon-512.png`. Without an app name,
   Google shows the raw `…supabase.co` address, which looks suspicious.
2. **Audience → Publish app.** ⚠️ Do not skip this. An app left in *Testing*
   only lets in the handful of accounts you list by hand, and everyone else is
   told the app "has not completed verification". Asking only for name and
   email needs no review.
3. **Clients → Create client → Web application.**
   - **Authorised JavaScript origins:** `https://tensor-ftc.github.io` and
     `http://localhost:5173` — no trailing slash, no path.
   - **Authorised redirect URIs:** the OAuth callback from the table at the top,
     character for character.
4. Copy the **client ID** and **client secret** into Supabase and save.

Two limits worth knowing: the fine print on Google's screen still names the
`supabase.co` address, because that is where the sign-in actually happens.
Removing it needs Supabase's paid custom-domain add-on. And Google refuses to
sign anybody in inside an embedded browser, which is why the Expo wrapper opens
the system browser for it.

### 6.3 GitHub

1. [github.com/settings/developers](https://github.com/settings/developers) →
   **OAuth Apps → New OAuth App**.
2. **Homepage URL:** `https://tensor-ftc.github.io/FTCHome/`
3. **Authorization callback URL:** the OAuth callback from the table at the top.
4. **Generate a new client secret** and copy it straight away — GitHub shows it once.
5. Supabase → Providers → **GitHub** → paste both → save.

### 6.4 Microsoft

Most students have a school Microsoft account, so this is the one that works
when a district blocks personal Google accounts.

1. [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID → App
   registrations → New registration**.
2. **Supported account types:** *Accounts in any organizational directory and
   personal Microsoft accounts.* Anything narrower turns away other schools.
3. **Redirect URI:** platform **Web**, value = the OAuth callback.
4. Copy the **Application (client) ID**.
5. **Certificates & secrets → New client secret** → copy the **Value** column,
   not the Secret ID. It is shown once.
6. Supabase → Providers → **Azure** (Supabase still uses the old name) → paste
   both. **Leave "Azure Tenant URL" empty**, which is what allows every school.

### 6.5 Email

**Authentication → Sign In / Providers → Email.** Leave **Confirm email** on.
It is what stops somebody signing up with an address they do not own.

**The catch: Supabase's built-in mail sender is for testing only.** It sends a
very small number of emails per hour for the whole project, and it will not
let you edit what the emails say. Beyond a few test sign-ups, people's
confirmation and sign-in emails simply do not arrive.

For most teams, **Google, GitHub and Microsoft are enough** and no email is
ever sent. If you want email sign-in to work for everyone, add your own
sender under **Authentication → Emails → SMTP Settings**:

| Option | Needs | Good for |
|---|---|---|
| **A Gmail or Google Workspace account** | Two-step verification on, then an [app password](https://myaccount.google.com/apppasswords). Host `smtp.gmail.com`, port `587`, username = the full address, password = the 16-character app password. | A team with no domain. Google caps a normal account at about 500 emails a day. |
| **[Resend](https://resend.com)** | A domain you own, verified in Resend. | A team that has its own domain. The free tier covers 3,000 emails a month. |

Once a sender is set, the **templates become editable**. Change the **Magic
Link** template so it includes the six-digit code:

```html
<h2>Sign in to FTC Home</h2>
<p>Enter this code in the app:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:700;font-family:monospace">{{ .Token }}</p>
<p>Or, on a computer, <a href="{{ .ConfirmationURL }}">sign in here</a>.</p>
<p style="color:#666;font-size:13px">It expires in an hour. If you did not ask for this, ignore it.</p>
```

The code matters on iPhones. A sign-in **link** tapped in Mail opens Safari,
which is a different place from the app on the home screen — the sign-in lands
in Safari and the app keeps waiting. Typing the code keeps it all inside the
app, and the app already has the box for it.

---

## 7 · Live updates

`0004_realtime.sql` adds `records` to Supabase's realtime publication. Each
device then listens for changes to *its own team's* rows and pulls the moment
one lands. Row-level security applies to the live stream exactly as it does to
a normal read, so this changes *when* somebody finds out, never *what* they can
see.

To check it is on:

```sql
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime';
```

You should see `public | records`. The same is visible under **Database →
Publications → supabase_realtime**.

---

## 8 · Health check

Paste this into the SQL editor any time something seems off. Every row should
say `true`. The last one only turns `true` after the first person has signed in.

```sql
select 'tables exist' as item,
       count(*) = 4 as ok
from information_schema.tables
where table_schema = 'public'
  and table_name in ('teams', 'records', 'team_members', 'team_invites')
union all
select 'accounts and invites (0002, 0003)',
       count(*) = 3
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_team', 'create_invite', 'accept_invite')
union all
select 'invite fix (0005)',
       coalesce(bool_and(array_to_string(p.proconfig, ',') like '%extensions%'), false)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_invite', 'accept_invite')
union all
select 'live updates (0004)',
       count(*) = 1
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'records'
union all
select 'server timestamps (0006)',
       coalesce(bool_and(pg_get_functiondef(p.oid) like '%clock_timestamp%'), false)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'touch_updated_at'
union all
select 'somebody is an active member',
       count(*) > 0
from public.team_members
where status = 'active';
```

| Row that is `false` | Fix |
|---|---|
| tables exist | Run `0001`–`0003` |
| accounts and invites | Run `0002` and `0003` |
| invite fix | Run `0005` |
| live updates | Run `0004` |
| server timestamps | Run `0006` |
| somebody is an active member | Sign in once, with the app open to a team |

---

## 9 · Running it day to day

The app handles membership on its own. These are for when you need to look
underneath or fix something by hand. The SQL editor runs with full rights, so
**double-check the team number** before running anything that changes data.

**Who is on the team**

```sql
select display_name, email, role, status, created_at, approved_at
from public.team_members
where team_number = '26022'
order by created_at;
```

**Accept somebody** (the app's Roster screen does the same)

```sql
update public.team_members
set status = 'active', role = 'student', approved_at = now()
where team_number = '26022' and email = 'someone@example.com';
```

**Take somebody's access away** — `suspended` keeps the history, and their sync
stops at once:

```sql
update public.team_members
set status = 'suspended'
where team_number = '26022' and email = 'someone@example.com';
```

**Change a role**

```sql
update public.team_members
set role = 'mentor'
where team_number = '26022' and email = 'someone@example.com';
```

**Open invites**

```sql
select id, role, email, uses, max_uses, expires_at, created_at
from public.team_invites
where team_number = '26022' and revoked_at is null and expires_at > now()
order by created_at desc;
```

**Cancel an invite**

```sql
update public.team_invites set revoked_at = now() where id = '<id from above>';
```

**What has synced, by kind**

```sql
select table_name, count(*) as rows, max(updated_at) as last_change
from public.records
where team_number = '26022'
group by table_name
order by table_name;
```

**Replace a leaked team secret** — every shared device then needs the new one:

```sql
update public.teams set sync_secret = gen_random_uuid() where team_number = '26022';
select sync_secret from public.teams where team_number = '26022';
```

**Wipe a test team completely** ⚠️ irreversible. Every device that still holds
the season keeps its own copy and would push it back on its next sync, so clear
the app on those devices first (**Settings → App → Erase everything on this device**).

```sql
begin;
delete from public.records      where team_number = '99999';
delete from public.team_invites where team_number = '99999';
delete from public.team_members where team_number = '99999';
delete from public.teams        where team_number = '99999';
commit;
```

---

## 10 · Plans, limits and pausing

Checked against [supabase.com/pricing](https://supabase.com/pricing) in
September 2026 — confirm there before relying on a number.

| | Free | Pro ($25/month) |
|---|---|---|
| Database | 500 MB per project | 8 GB, then pay as you go |
| Monthly active users | 50,000 | 100,000 |
| File storage | 1 GB | 100 GB |
| Egress | 5 GB | 250 GB |
| Backups | **None** | Daily, kept 7 days |
| **Pausing** | **After 1 week with no activity** | Never |

A team uses a tiny fraction of these. Two rows matter:

**Pausing.** A free project that goes a week without a request is paused. The
app keeps working on every device — it is offline-first — but sync fails until
somebody restores the project from the dashboard, and nobody notices until two
phones disagree. The repository runs
[`.github/workflows/keepalive.yml`](../.github/workflows/keepalive.yml) every
third day, which makes one harmless query and fails loudly if the project has
been paused. GitHub stops scheduled workflows in a repository with no commits
for 60 days, so over a long break, push something or run it by hand from the
Actions tab.

If a project does get paused: **Dashboard → Restore project.** Nothing is lost.

**Backups.** The free plan keeps none. Every device holds a full copy of the
season, and **Settings → Data → Export backup** saves one as a file. Do that
at the end of each season at least.

---

## 11 · Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| `new row violates row-level security policy for table "records"` | This account has no active row in `team_members`. | Run the [health check](#8--health-check). If the tables are all there, sign out and back in on an up-to-date app; the app enrols you before syncing. Check `team_members` for your email. |
| `function digest(text, unknown) does not exist` when creating an invite | `0005` has not been run. | Run `0005_fix_invite_digest.sql`. |
| An invite code is refused | It has been used up, has expired, was cancelled, or is for a different team. | Make a new one on the Roster screen. Codes are single-use and last 30 days. |
| Google says `redirect_uri_mismatch` | The redirect URI in Google does not match the callback exactly. | Copy the callback from the top of this page into Google, character for character. |
| Google says the app "has not completed verification", or only you can sign in | The consent screen is still in Testing. | Google Auth Platform → Audience → **Publish app**. |
| Google's screen shows `…supabase.co` instead of the app's name | No app name on the consent screen. | Google Auth Platform → Branding. |
| Sign-in works but you land back on the first screen | The address is not in the redirect list, or the device is running an old version. | Check [§6.1](#61-url-configuration). Refresh the page twice; on a phone, close the app fully and reopen it. |
| Email sign-in or confirmation mail never arrives, or "rate limit exceeded" | Supabase's built-in sender only sends a few emails an hour. | Use Google, GitHub or Microsoft, or set up your own sender ([§6.5](#65-email)). |
| There is nowhere to edit the email templates | Templates are locked until you set up your own sender. | [§6.5](#65-email). |
| On an iPhone, the email link opens Safari and the app keeps waiting | A link cannot reach the home-screen app. | Type the six-digit code instead. The email only shows one once the Magic Link template includes `{{ .Token }}`. |
| Changes take up to two minutes to appear elsewhere | Live updates are off. | Run `0004`, then check [§7](#7--live-updates). |
| Something a teammate added never appears on one device, however long you wait | That device's "pulled up to here" mark was pushed too far ahead — before `0006`, a phone with a wrong clock could do this. | Run `0006`, then on the affected device: **States & sync → Pull everything again**. Nothing local is lost. |
| A phone says it is waiting to be accepted | That account is on the team but has not been accepted yet. | A coach or mentor accepts it on the Roster screen. |
| Sync stopped for everyone after a quiet week | The free project was paused. | Dashboard → **Restore project**. See [§10](#10--plans-limits-and-pausing). |
| **Test connection** fails in Settings | Wrong key type, a typo in the URL, or `0001` has not run. | Use the **publishable** key, check the URL has no trailing slash, and check **Table Editor** shows a `records` table. |

---

## 12 · Security: what is and is not enforced

**Enforced by the database:**

- Nobody can read or write another team's rows.
- Nobody can make themselves an active member. A join request is always
  `requested`, whatever role it asks for, and only an active coach or mentor on
  that team can accept it.
- An invite can only grant a role at or below the inviter's own.
- Removing somebody from `team_members` stops their sync immediately.

**Enforced only by the app's screens — not yet by the database:**

- **Who sees what within a team.** Any *accepted* member can read every synced
  record for their team, including budget amounts, purchase costs, and other
  members' phone numbers. The app hides these from students, but a person who
  pulls their own sign-in token out of the browser and calls the database
  directly would see them.
- **Who may change what within a team.** Any accepted member can write any
  record for their team. The app only lets coaches approve purchases or change
  roles, but the database does not check which kind of record is being written,
  so the same determined person could, for example, edit the synced roster so
  that other devices show them as a coach.

This takes deliberate effort — nobody gets there by using the app — and it
only affects people you have already accepted onto your team. It is still the
most important piece of unfinished work, and the plan is in
[ROADMAP.md](ROADMAP.md#1-make-the-database-enforce-roles-not-just-the-app).
Until then: only accept people you know, and do not store anything in the app
you would not tell every accepted member.

**Keys and secrets:**

- The **publishable** key is meant to be public.
- The **secret** key (`sb_secret_…`) must never be in the app, a build, a
  repository secret used by the build, or a screenshot.
- The **team secret** is a shared password for a whole team. Anyone holding it
  can read and write everything for that team, whether or not they were ever
  accepted, and removing them from the roster does not take it back.
  [Replace it](#9--running-it-day-to-day) if it leaks, and prefer accounts.

---

## 13 · Reference

**Tables**

| Table | Holds |
|---|---|
| `teams` | One row per team number, plus the team secret. |
| `records` | Every synced item. Keyed by team, kind (`table_name`) and id; the item itself is JSON in `data`. |
| `team_members` | Which account is on which team, with what role and status. |
| `team_invites` | Invite codes (stored hashed) and email invites. |

**Functions the app calls**

| Function | Does |
|---|---|
| `claim_team(team, name)` | Makes the caller the first member of a team that has none. Refuses once anybody is active. |
| `create_invite(team, role, …)` | Mints an invite code. Staff only, and never above the inviter's own role. |
| `accept_invite(code)` | Redeems a code and makes the caller active. |
| `my_invites()` | Email invites waiting for the signed-in address. |

**Functions the rules use**

| Function | Answers |
|---|---|
| `my_teams()` | Which teams the signed-in person is an active member of. |
| `is_team_staff(team)` | Whether they are a coach or mentor there. |
| `my_role(team)`, `role_rank(role)` | Their role, and how roles compare. |
| `current_team_number()` | Which team a team-secret header belongs to. |
| `provision_team(number, name)` | Creates a team and returns its secret. Run by hand only. |

**Member statuses:** `requested` (asked, waiting), `invited` (added ahead of
time), `active`, `declined`, `suspended`.
