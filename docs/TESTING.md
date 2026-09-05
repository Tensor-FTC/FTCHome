# Testing FTC Home before you roll it out

Written to be run in order, on real devices, by one person in about half an
hour. It checks the things that actually break: sync, approval, permissions,
and offline.

Automated tests cover the logic (`npm test` — the count is in its output, and
that is the only place worth keeping it). They cannot tell you
whether two phones agree with each other, which is the only thing a team will
notice.

---

## 0 · Before you start

You need:

- A **Mac or PC** and an **iPhone or Android phone** — two devices minimum.
  Sync bugs are invisible on one device.
- **Two accounts** you can sign in with (two Google accounts, or one Google and
  one email). Do not test approval with a single account.
- The Supabase project set up: migrations run, providers enabled, redirect URLs
  set. See [SETUP.md](SETUP.md).

⚠️ **Sign in on every device before the room you demo in.** Signing in needs
network once. Everything after that works offline, but the first sign-in does
not.

---

## 1 · The database is really there

Supabase → SQL Editor:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

Expect `records`, `team_invites`, `team_members`, `teams`.

If any are missing, the migrations did not all run. Run them in order —
`0001` through `0005` — and re-check. All five are safe to run twice, so run
any you are unsure about again.

`0005` is the one that is easy to miss and does not show up here: it is a
two-line fix to the invite functions, and without it **§4b below fails** with
`function digest(text, unknown) does not exist`.

---

## 2 · First account claims the team

On the **laptop**, in a fresh browser profile or private window:

1. Open the app → **Start a new team** → enter your team number → **That's us**.
2. Skip the roster → **Create my account**.
3. Sign in with Google.

**Expect:** you land on Today. The roster shows one person — you — with **the
role you picked**, not "coach".

> If you picked student, a bar appears saying you are running the team on your
> own and it will hand over when a coach joins. That is correct. Your role on
> the roster stays student while you keep admin rights.

**Then check the server agrees.** This is the step people skip, and it is the
one that used to fail silently:

```sql
select team_number, role, status, display_name from public.team_members;
```

Expect exactly one row, `status = 'active'`. **If this table is empty, sync will
be refused for everything you do next** — that is the bug this flow exists to
catch.

---

## 3 · Sync actually round-trips

Still on the laptop:

1. Add a calendar event, a task, and a sponsor.
2. Go to **States & sync** → **Sync now**.

**Expect:** "Synced · N sent". No red text.

❌ If you see `new row violates row-level security policy for table "records"`,
stop. It means step 2 did not create a `team_members` row. Re-check the
migrations.

Confirm the rows arrived:

```sql
select table_name, count(*) from public.records group by table_name;
```

---

## 4 · A second person has to be let in

On the **phone**, Safari (iOS) or Chrome (Android):

1. Open the app → **Add to Home Screen** → launch from the icon.
2. **Join a team I'm on** → enter the same team number.
3. Sign in with your **second** account.

**Expect:** a waiting screen. **Not** the app.

This is the important negative test: knowing a team number must not be enough
to get in. If the phone lands on Today without approval, permissions are broken.

Back on the **laptop**: Roster → the request is listed → accept it, set a role
and subteams.

On the **phone**: reopen. You are now in, with the role the coach chose.

Check the server:

```sql
select display_name, role, status from public.team_members order by created_at;
```

Expect two rows, both `active`.

---

## 4b · An invite skips the queue

On the **laptop**, as coach: Roster → **Invite somebody** → pick a role →
**Create an invite code**. Copy it.

In a **third** browser profile (or after signing out on the phone):

1. **Join a team I'm on** → team number → paste the code → **Use this invite**.
2. Sign in with a third account.

**Expect:** straight onto Today with the role the code carried. **No waiting
screen** — that is the entire difference between being invited and asking.

Try the same code again with a fourth account.

**Expect:** refused. It is one use.

## 5 · Two devices agree

1. **Phone:** add a task called `from-phone`.
2. **Laptop:** States & sync → **Sync now** → Today.

**Expect:** `from-phone` appears.

3. **Laptop:** tick it done, sync.
4. **Phone:** pull to refresh.

**Expect:** it shows as done.

### 5b · Chat crosses devices

Its own step because this failed silently for a long time: messages were sent,
stored in the database, and dropped on the way back to every other device. The
person typing saw a perfectly normal chat, so nothing looked wrong on the
screen anybody was watching.

1. **Phone:** Chat → **Everyone** → send `hello from the phone`.
2. **Laptop:** open Chat.

**Expect:** the message is there, within a second or two — the realtime
subscription from `0004` — or after **Sync now** if you skipped that migration.

3. **Laptop:** reply.

**Expect:** it reaches the phone, and the unread badge clears on the device
that read it and *not* on the other one. Unread is per device on purpose.

❌ If a message never crosses, check `select count(*) from public.records where
table_name = 'messages'`. Rows present and nothing on the other device is the
pull side; no rows at all is the push side.

### 5c · A subteam a coach invented

1. **Laptop:** Roster → edit somebody → add a subteam that is not one of the
   seven built in, e.g. `Pit crew`.
2. **Phone:** sync, then open the Roster.

**Expect:** `Pit crew` is offered there too.

---

## 6 · Offline, which is the whole point

On the **phone**, with the app open:

1. Turn on **Airplane mode**.
2. Add a task, write a chat message, mark a part owned. Open Calendar, Budget,
   Build — every screen must render.
3. **States & sync** shows the queue with sizes and "nothing is lost".
4. Turn Airplane mode off, wait, then **Sync now**.

**Expect:** the queue empties and the changes appear on the laptop.

❌ Nothing should ever show a red error or an empty screen while offline. Grey
and specific is correct; red is a bug.

---

## 7 · Permissions hold

On the **laptop**, as coach: Settings → You → **Check what others see** →
**Student**.

**Expect:**
- Budget amounts and contact details are withheld — shown as dashed locked
  chips, not blank space.
- A bar at the top offers **Back to my view**, and works from any screen.

Now the negative test. Set the preview to **student**, then try to select
**coach** from the same chips.

**Expect:** coach is not offered. A preview may only ever narrow — if a student
can preview as a coach it is a role switcher, not a preview.

Also confirm on the **phone**, signed in as the student: there is no way to see
budget figures or another member's phone number.

---

## 7b · Money is counted once

On the **laptop**, as coach: Budget → an open purchase request.

1. **Approve** it. The allocation's spent figure goes up by the amount.
2. Put the same request on **Hold**.

**Expect:** the allocation goes back down by the same amount.

3. **Approve** it again, then sync, then check the **phone**.

**Expect:** the allocation shows the amount spent **once**, on both devices.

❌ Two lots of the same purchase, or a phone still showing the old balance, is
the failure this step exists to catch — a team believing it has hundreds of
dollars it has already committed.

---

## 8 · Appearance

Settings → App → **Appearance**.

1. Switch **Dark / Light / Match device**. Every screen should stay readable —
   check Today, Calendar, Budget, Chat.
2. Change the **accent**. The active nav item, primary buttons and meters all
   follow it.
3. Set **Match device**, then flip your OS between light and dark. The app
   follows without a reload.

Appearance is per device on purpose: the phone and the pit laptop can differ,
and changing it does not affect anybody else.

---

## 9 · Install

- **iPhone:** Safari → Share → Add to Home Screen. Launches fullscreen with the
  icon and no browser chrome. *(It must be Safari — Chrome on iOS cannot
  install a web app.)*
- **Mac/Windows:** Chrome or Edge → install icon in the address bar.
- **Android:** Chrome → Install app.

Then turn on Airplane mode and launch from the icon. It must open.

---

## 10 · Alerts, if you turned them on

Settings → App → **Match alerts** → allow notifications.

1. Add a calendar entry typed **Deadline**, dated tomorrow.
2. Reopen the app.

**Expect:** one notification about it. Reopen again — **no second one**. A
deadline sits in its window for two days and the app gets opened a dozen times
in that period; an alert on every open is one people learn to swipe away.

At a competition with a loaded event, the match alert fires at your lead time,
at one minute and at zero — **from any screen**, including Competition Mode on
the pit display, which is the one most likely to be up.

---

## What is not covered

- **Load.** Nobody has run this with 40 members and a season of media.
- **Conflicts.** Two people editing the same task within a few seconds is
  last-write-wins. Fine in practice, not tested adversarially.
- **Invites at scale.** One code, one use, tested by hand. Multi-use codes and
  expiry are enforced by the database and have not been exercised.

---

## Before every demo

1. Push, wait for the deploy, then **hard-refresh twice** on each device.
   The service worker serves the cached build first, so a new deploy takes one
   extra reload to appear.
2. Sign in on every device while you still have good network.
3. Check Today loads on each one.
