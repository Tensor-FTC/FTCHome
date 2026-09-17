# What's left

Where FTC Home stands, what still needs doing — by you and in the code — and
what would be worth building next. Written 16 September 2026; the order at the
bottom is a recommendation, not a plan anybody has agreed to.

**Contents**

- [Where it stands](#where-it-stands)
- [Things only you can do](#things-only-you-can-do)
- [Engineering work, most important first](#engineering-work-most-important-first)
- [Worth adding](#worth-adding)
- [Suggested order](#suggested-order)

---

## Where it stands

| Area | State |
|---|---|
| Web app, every screen | ✅ Done |
| Install on iPhone, Android, Windows, Mac | ✅ Done, as an installable web app |
| Works with no internet | ✅ Done |
| Accounts: Google, GitHub, Microsoft, email | ✅ Done. Email is limited — see below |
| Accept and decline people, roles, founder hand-over | ✅ Done |
| Invite codes | ✅ Done — needs migration `0005` |
| Live sync between devices | ✅ Done — needs `0004` and `0006` |
| Light and dark themes, accents, avatars | ✅ Done |
| Shared links answer 200 | ✅ Done for every screen without an id in the URL |
| Match and deadline alerts | 🟡 While the app is open or recently used. Not when it is closed |
| Photos and files on other devices | ❌ Not built. Only the entry syncs |
| Database enforcing who sees what inside a team | ❌ Not built. The app hides it; the database does not |
| Own domain | ❌ Not set up |
| App Store / Play Store | ❌ Not built, and not needed to use the app |

Every change is typechecked, tested and built before it deploys, there are six
database migrations, and every outbound link is checked weekly.

---

## Things only you can do

No code needed. Roughly an hour in total, and most of what is left depends on
the first item.

### 1. Run migration `0006`, and confirm the others

`0006_server_timestamps.sql` is new. It fixes a sync bug where one device with a
wrong clock could make other devices silently miss rows. Run it in the SQL
editor, then run the one-query
[health check](SUPABASE.md#8--health-check). Every row should say `true`.

If anybody has already noticed something that exists on one phone and not
another: after running it, open **States & sync → Pull everything again** on
the device that is missing it.

### 2. Finish Google sign-in

In Google Cloud Console:

- **Audience → Publish app.** Until you do, only accounts you list by hand can
  sign in, and everyone else is told the app "has not completed verification".
- **Branding** → app name `FTC Home` and the logo. Otherwise Google's screen
  shows the raw `…supabase.co` address, which is what looked suspicious.

Details: [SUPABASE.md § 6.2](SUPABASE.md#62-google).

### 3. Decide about email

Supabase's built-in sender manages a few emails an hour for the whole project.
Either:

- **Skip email sign-in.** Google, GitHub and Microsoft cover nearly everyone.
  Nothing to do.
- **Or add a sender.** A Gmail account with an app password works with no
  domain. Then paste the six-digit-code template into the Magic Link email so
  iPhone users can sign in with a code.

Details: [SUPABASE.md § 6.5](SUPABASE.md#65-email).

### 4. Walk the test plan on real devices

[TESTING.md](TESTING.md), with a laptop and two phones, in order. The steps that
matter most:

- **§2** — after the first sign-in, `team_members` has a row. If it is empty,
  nothing else will sync.
- **§4** — a second account lands on a *waiting* screen, not in the app.
- **§5** — a change on one device shows on the other within seconds, without
  pressing anything.
- **§10** — an alert arrives on a **phone**, and tapping it opens the app. This
  never worked on phones before this week.

### 5. Start the keep-alive once by hand

A free Supabase project is paused after a week without activity, and sync
stops for everybody until somebody restores it. The repository now pings it
every third day.

**Actions → Keep Supabase awake → Run workflow.** A green run means the secrets
are right and it will keep going on its own. GitHub pauses scheduled workflows
in a repository with no commits for 60 days, so over the summer, push something
or run it again.

### 6. Three conversations with the team

**Claude is a contributor again.** Seven commits from pull request #2, merged
on 5 September, are authored by `Claude <noreply@anthropic.com>` — they came
from a Claude Code web session on a `claude/…` branch. GitHub will list Claude
as a contributor because of them. The choices:

- **Leave it.** Nothing breaks.
- **Re-author those seven commits** and force-push `main`. Everybody's clone
  then has to be reset to the new history, and the commit links in pull request
  #2 stop matching. Only do this with aarushrk and TheCuberBoy agreed and ready.
- **Avoid it next time.** Changes made in a Claude Code web session arrive
  under Claude's name. If that is unwanted, a person should re-commit them on
  their own branch before the pull request is merged.

**Overlapping work.** aarushrk rebuilt onboarding and the getting-started guide
in late August; the invite screens were built separately in the same window.
Both are in and working together now. Agree who is taking which item below
before starting, so nothing gets built twice.

**Who you accept.** Until the database enforces roles
([item 1 below](#1-make-the-database-enforce-roles-not-just-the-app)), only
accept people onto the team whom you would trust with the budget and everyone's
phone numbers.

### 7. Export a backup at the end of every season

The free plan keeps no backups. **Settings → Data → Export backup** saves the
whole season to a file. Every device also holds a full copy, but a file is the
only copy nobody can accidentally overwrite.

---

## Engineering work, most important first

Each item says what is wrong, why it matters, how to fix it, and roughly how
long it takes one person working steadily.

### 1. Make the database enforce roles, not just the app

**What is wrong.** Supabase already stops people reading or writing another
team's data, and stops anybody putting themselves on a team. But *inside* a
team, every accepted member can read and write every synced record. The app is
what hides budget figures and phone numbers from students, and what stops a
student approving their own purchase.

That holds for anybody using the app. It does not hold for somebody who takes
their own sign-in token out of the browser and talks to the database directly.
They could read what the app hides, or write a roster record that makes every
other device show them as a coach — because each device currently reads
people's roles from those synced records.

**Why it matters.** It needs deliberate effort and only affects people you have
already accepted, so it is not an emergency. It is the one gap where the app
says something is protected and the database does not back it up, and it
should be closed before the app is used by a team you do not know personally.

**The fix.**

1. **Take roles from the server.** Each device should read a person's role and
   status from `team_members` — which only coaches and mentors can change —
   rather than from the synced roster.
2. **Check writes by kind.** A database trigger on `records` that rejects
   writes a role may not make: roster changes and purchase decisions from
   anyone but staff, and so on. It has to allow the things students
   legitimately do, like requesting a purchase or editing their own tasks.
3. **Keep sensitive data out of shared records.** Move contact details into a
   table only staff can read. Budget and purchase amounts need the same
   treatment, driven by the team's own visibility settings stored server-side.

**Doing it safely.** Row-level security is easy to get subtly wrong, and a
mistake here locks real people out of a real season. Build and test it against
a **second, scratch Supabase project** — the free plan allows two — with
automated tests for each rule, before it goes anywhere near the live one.

**Size:** 3–5 days.

### 2. Photos and files do not sync

**What is wrong.** A photo, video or CAD file is stored in the browser of the
device that added it. The *entry* syncs, so the laptop shows that a photo
exists, but it cannot show the photo.

**Why it matters.** It is the most visible gap. The build log, the weekly page
and anything built for the portfolio all depend on images being everywhere.

**The fix.** A private Supabase Storage bucket, one folder per team, with the
same membership rules as everything else. Uploads go through the existing
queue — which already marks large files "ON WI-FI" — and files download when
somebody opens them and are kept locally after that. Photos are shrunk before
upload.

**A decision first: video.** The free plan has 1 GB of file storage in total —
a few minutes of phone video. Either photos only, a size cap, or the $25/month
plan (100 GB).

**Size:** 2–3 days.

### 3. Conflicts are decided by each device's clock

**What is wrong.** When two people edit the same thing, the later edit wins —
but "later" is judged by the clock of the device that made each edit. A device
whose clock runs ahead wins every conflict it is part of, even against edits
made after it. Migration `0006` fixed what gets *fetched*; this is about which
edit *wins*.

**Why it matters.** Rare in practice, since most devices set their clocks
automatically. When it happens, an edit disappears with no sign anything went
wrong.

**The fix.** Either order conflicting edits by the server's stamp, or have the
app compare its clock with the server's and warn when they are more than a few
seconds apart. The warning is smaller and catches the cause.

**Size:** 1 day.

### 4. Alerts when the app is closed

**What is wrong.** Match and deadline alerts fire while the app is open or was
used recently. With the app fully closed, nothing arrives. (Until this week
they never arrived on phones at all; that is fixed.)

**The fix.** Web Push: a key pair, a table of which devices want alerts, a
Supabase Edge Function that sends them, and a schedule that decides what is
due. Deadlines and task due dates are already in the database. Match times
would need fetching from FTCScout on the server during an event. iPhones need
iOS 16.4 or newer, the app installed to the home screen, and permission asked
for from a tap.

**Size:** 3–4 days.

### 5. Move to your own domain

**What is wrong.** GitHub Pages cannot send every address to the app. Screens
without an id now answer 200, but links like `/events/…` and `/chat/…` still
answer 404 to link previews, even though they open fine in a browser. The
address is also long, and Pages blocks the Play Store route below.

**The fix.** A domain (about $10–12 a year) on Cloudflare Pages, which rewrites
every address to the app properly. Then update the Supabase site URL and
redirect URLs, Google's JavaScript origins, the GitHub OAuth homepage, and the
address the Expo wrapper opens.

**Size:** an afternoon, plus buying the domain. Steps in
[SETUP.md, Option C](SETUP.md#option-c--a-real-domain).

### 6. Tests that use two devices

**What is wrong.** The automated tests check the logic one piece at a time.
Nothing automated checks that two devices end up agreeing, so every sync change
has to be checked by hand with [TESTING.md](TESTING.md).

**The fix.** Browser tests that open two sessions against the scratch Supabase
project from item 1, run on any pull request that touches sync, sign-in or the
database.

**Size:** 1–2 days. Shares its setup with item 1.

### 7. A large season

**What is wrong.** Nobody has run this with 40 people and a full season of
tasks, chat and build log. Every change copies the whole season and saves it,
which is instant at today's sizes and may not be at ten times that.

**The fix.** Generate a deliberately large season, measure typing and
scrolling on an older phone, and only change the storage if the numbers say so.

**Size:** half a day to measure.

### 8. Accessibility

**What is wrong.** The light theme passes contrast checks everywhere. The dark
theme's faintest text is at 3.2:1 against a target of 4.5:1. Nobody has used
the app with a screen reader or keyboard alone.

**Size:** a day to audit, more depending on what it finds.

### 9. App stores

**Not needed to use the app.** It installs from the browser on every platform
already. If the team still wants a store listing:

- **Google Play** — the existing app can be wrapped as a Trusted Web Activity
  for a one-time $25 fee. It needs a verification file at the root of the
  domain, which GitHub Pages cannot serve for this repository, so it waits on
  item 5.
- **Apple App Store** — $99 a year. Apple rejects apps that are only a website,
  so it would need genuinely native features first, and an app that offers
  Google or GitHub sign-in must also offer an equivalent privacy-preserving
  option such as Sign in with Apple.

Recommendation: skip the App Store; consider Play after item 5.

### 10. Small things

- **The Expo wrapper** in `mobile/` gets *worse* offline support on an iPhone
  than Safari's home-screen install. Keep it only if Android testing through
  Expo Go is actually used; otherwise remove it so nobody installs the weaker
  version.
- **"Email me a link" is always shown**, even though email cannot reach people
  until a sender is set up. Hide it behind a setting until one is.
- **The team secret** is a shared password that skips accept and decline. If
  every device ends up using accounts, remove that route from the database.
- **npm now asks before running install scripts**, and skips esbuild's. Builds
  work without it today. If a future update needs it:
  `npm approve-scripts esbuild`.

---

## Worth adding

Ideas that would matter to an FTC team, most useful first. None of these exist
yet except where it says so.

### Attendance and hours

Check in and out of meetings with one tap, or a code at the door. Hours per
person, and outreach hours per event.

*Why:* judged awards and the engineering portfolio ask for outreach numbers,
and students need volunteer hours for school. Right now that is a spreadsheet
somebody fills in the week before.
*Today:* events have an RSVP, not a check-in.
*Size:* 2 days.

### Portfolio builder

Assemble the engineering portfolio from what the team already logs — build
log, weekly reports, outreach, awards, season stats — organised the way judges
read it, and export it.

*Why:* it is the single biggest document of the season and is usually written
from memory the week before it is due.
*Today:* one week at a time can be exported as Markdown.
*Size:* 3–5 days.

### Match scouting with numbers

Quick-tap counters for this season's game during a match, averages per team,
and a drag-to-order pick list for alliance selection.

*Why:* alliance selection is decided in minutes, from whatever the scouts
wrote down.
*Today:* free-text notes, a rating, tags, a "would pick" flag and FTCScout's
numbers.
*Size:* 2–3 days, and the counters change with each season's game.

### Battery log

Number every battery, log charge and voltage, flag weak ones, and pick the best
set before each match.

*Why:* a tired battery is one of the most common ways to lose a match you
should have won.
*Size:* 1 day.

### Pit and inspection checklists

Robot inspection, plus a pre-match check — battery, wires, driver hub charged,
right program selected — ticked off per match.

*Size:* 1–2 days.

### Tool and spare-part checkout

Who has the drill, and which bin the spare motor is in. Builds on the new tools
tab.

*Size:* 1 day.

### A calendar that updates itself

A private link that Google or Apple Calendar can subscribe to, so meetings
appear on everybody's phone calendar and stay current.

*Today:* the calendar can be downloaded once as a file, which goes stale.
*Size:* 1 day. Needs a small server function.

### Season rollover

"Start next season": keep this season readable, carry over the roster, tools,
subteams and sponsors, and clear tasks and the calendar.

*Size:* 1–2 days.

### Sponsor care

Thank-you sent, logo placement, renewal reminders, and a one-page summary for
each sponsor at the end of the season.

*Today:* each sponsor moves through prospect, pledged, received.
*Size:* 1 day.

### Travel and permission slips

For each competition: who is going, which forms are in, rides, and rooms.

*Size:* 2 days.

### Announcements with read receipts

A message from a coach that shows who has seen it.

*Today:* team chat, without receipts.
*Size:* 1 day.

### Robot code version per match

Which build ran in which match, next to the match notes — so "it broke in Q14"
comes with "and this is what was on it".

*Size:* half a day.

---

## Suggested order

1. **Your checklist above.** About an hour, and it unblocks everything.
2. **Database-enforced roles.** Before the whole team — or any team you do not
   know — is using it.
3. **Photo sync.** The most visible gap.
4. **Your own domain.** An afternoon; fixes the remaining links and opens the
   door to Play.
5. **Before the first competition:** match scouting with numbers, the battery
   log, and pit checklists.
6. **Before judging:** attendance and hours, then the portfolio builder.
7. **Alerts with the app closed.**
8. Everything else, as the team finds it needs it.
