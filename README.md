# FTC Home

**One place, all season.** Season management for a FIRST Tech Challenge team — schedule, roster,
budget, build log and live event data — built to keep working in a gym with no signal.

Implemented from the [Claude Design project](https://claude.ai/design/p/6514df86-e97e-4f63-af05-2d7f5091f0fe),
whose prototype and design-system spec are kept verbatim in [`design/`](design/) as the reference
this is checked against.

```bash
npm install
npm run dev
```

That is the whole setup. No account, no server, no API key — the app opens on a seeded demo season
for team 11138 and every screen works. Cloud sync and live competition data are additive; see
[Cloud sync](#cloud-sync--supabase) and [Live data](#live-data--first-events-api).

---

## What it does

Nineteen screens, all backed by real state rather than fixtures.

| | Screen | What is actually live |
|---|---|---|
| 00 | Launch | One-shot mark animation, honours `prefers-reduced-motion` |
| A1–A5 | Team access · Who are you · Personal sign-in · Mentor sign-in · Register | Two-factor-by-design: a shared team code gets you to the door, your own password says who you are |
| R1 | Roster | Add/edit/remove members, subteams, mentor-only medical and contact records |
| 04 | Today | Next competition, today's meeting with RSVP, assigned tasks, gated approvals, blockers |
| 05 / C1 | Calendar · Editor | Month grid, agenda, season timeline derived from the team's own competition dates, `.ics` export |
| 06 | Event detail | RSVP, attendance forecast, who can't make it *by name*, cached attachments |
| 07 | Weekly dashboard | Auto blocks derived from tasks and RSVPs, human blocks written by the captain, publish + print + markdown export |
| 08 | Build log | Real photo/video/CAD upload to IndexedDB with generated thumbnails, storage meter, offline queue |
| 09 | Live event | Rank, record, match queue, scouting cards with editable pit notes |
| 10 | Competition Mode | Pit board: pure black, 92px clock (260px on desktop), wake lock, rankings and schedule |
| 11 | States | The live outbox — what is queued, how big, when it goes |
| 01–03 | Guest onboarding · Starter parts · Team identity | No-account hub, three-tier BOM with CSV export, registry lookup |
| — | Settings | Sync, live data, alerts, backup/restore, role preview |

### Beyond the prototype

- **PWA** — installable, service worker, offline-first, `navigator.storage.persist()` so a season is
  not treated as a disposable cache.
- **Export & import** — parts and roster and budget to CSV, calendar to `.ics` (folded, escaped,
  with `RRULE`), weekly dashboard to markdown, whole season to JSON and back.
- **Match alerts** — Web Notifications at the lead time, at one minute, and at zero. Never repeat;
  an alert you learn to swipe away is worse than none.
- **Desktop layouts** — the tab bar becomes a 240px rail, Today goes three columns, the weekly
  dashboard goes masonry, and the countdown leaves the bottom edge for a sticky top bar.
- **Print stylesheet** — the weekly dashboard is the one thing teams hand to sponsors, so it inverts
  to ink-on-paper instead of costing a toner cartridge in graphite.
- **Role preview** — a coach can see exactly what a student or parent sees, checked against the same
  capability matrix the app enforces.

---

## Architecture

```
src/
  domain/     types, capability matrix, parts catalogue, seed season
  lib/        idb · sync · supabase · crypto · ftcEvents · media · exporters · notifications
  store/      one zustand store; every mutation stamps, persists and queues
  components/ shell, nav, countdown, media thumb, ui primitives
  screens/    the nineteen
  styles/     tokens · base · components · shell · auth · print
supabase/     migration + RLS
design/       the imported source of truth
```

**Local-first, with sync as a peer.** The UI reads from IndexedDB and never awaits the network.
Writes land locally and are appended to an outbox; a background pass drains it when there is signal
and a configured project. The [States screen](src/screens/States.tsx) shows that queue directly —
what is waiting, how many bytes, and what triggers it — because a team should be able to see that
three RSVPs and a 248 MB clip are pending rather than trust a spinner.

**Why a document store.** The season is a few hundred records, so it is persisted as one versioned
document plus a separate blob store for media. That makes restore atomic and keeps a 40 MB clip from
being serialised next to the roster. Server-side it is one generic `records` table holding a JSON
document per entity, so the app model can move without a Postgres migration every time.

**Conflict resolution is last-write-wins per record on `updatedAt`.** Chosen over CRDTs deliberately:
the conflicting case here is two people editing the same task on the same evening, where the later
edit is the one you want, and a merge algorithm nobody can explain is worse than a rule everybody
can. [`sync.test.ts`](src/lib/sync.test.ts) pins the two cases that lose data if this is wrong.

---

## Cloud sync · Supabase

Optional. Without it the app is a complete single-device season manager.

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — CLI `supabase db push`,
   or paste it into **SQL → New query**.
3. Mint a team secret:
   ```sql
   select * from public.provision_team('11138', 'Robo Eclipse');
   ```
4. In the app: **Settings → Cloud sync**. Paste the project URL, the **anon** key, and the team
   secret. Press **Test connection** for a real verdict rather than a guess.

Every device on the team pastes the same three values. Sync runs on load, on reconnect, every five
minutes, and on demand.

You can also bake the URL and anon key in at build time via `.env` — see [`.env.example`](.env.example).
The team secret is always runtime-only.

---

## Live data · FIRST Events API

Optional. Until a key is set, Live Event and Competition Mode run on bundled sample data from the
Milton qualifier, and the screen says so rather than pretending.

1. Request a key at [ftc-events.firstinspires.org/services/API](https://ftc-events.firstinspires.org/services/API).
2. **Settings → Live data**, paste it as `username:authorizationKey`, save, then **Pull rankings &
   schedule** for your event code.

The key is stored in `localStorage`, deliberately *not* in the synced season document — it is yours,
not the team's, and it should not travel to other devices. It grants read access to public
competition data and nothing else.

FTC publishes ranking points rather than OPR. What the app labels OPR is a documented stand-in —
mean alliance score across a team's played matches — which ranks the same way for scouting and never
claims to be the least-squares figure. See [`ftcEvents.ts`](src/lib/ftcEvents.ts).

> **Browser CORS.** The FIRST API does not always send permissive CORS headers. If a pull fails with
> a network error, that is what happened; proxy the call or run from a deployed origin.

---

## Security model

Stated plainly, because the app makes real claims about withholding data.

**What is genuinely enforced.** Role gating runs through a single
[capability matrix](src/domain/permissions.ts). Withheld values never enter the DOM — a student who
opens devtools on the approvals block finds a locked chip, not a hidden `<div>` containing $412.80.
[`permissions.test.ts`](src/domain/permissions.test.ts) asserts the withholding, not just the
granting.

**Credentials.** Passwords are hashed with PBKDF2-SHA256, 210 000 iterations (OWASP 2023 guidance),
16-byte random salt per credential, compared in constant time. Plaintext is never stored and backups
strip the verifiers.

**What this is not.** Verification happens in the browser, so it is a lock on the data at rest, not a
server-side authentication boundary — anyone with write access to the local IndexedDB could replace
a verifier. That is the correct trade for an app whose hard requirement is working with no signal,
and it is why Supabase row-level security keys on a separate team secret.

**The team secret** is a shared credential of the same strength as the team code: it scopes rows to
one team, but it does not identify individuals. Anyone holding it can read and write that team's
rows. Rotate it with `update public.teams set sync_secret = gen_random_uuid() where team_number = …`.

**Never put the `service_role` key in this app.** It ships to the browser and bypasses RLS. The
anon key is the only correct one.

If you need per-user server-side authentication — a public deployment, or students you do not
trust with the team's own data — replace the local credential check with Supabase Auth and key the
RLS policies on `auth.uid()` instead of the header.

---

## Design system · Anodized

Transcribed into [`src/styles/tokens.css`](src/styles/tokens.css) from the spec.

Graphite planes, hairline edges, one signal colour. Depth is **drawn** — a border plus one shadow —
never blurred, so it survives a build photo underneath it and a 2019 Chromebook rendering it. Three
planes maximum; a fourth means the screen needs splitting.

Nine greys, one lime, one amber. Lime marks the single next action on a screen and nothing else.
Amber is time pressure. **Alliance red and blue are quarantined** behind a data attribute so they
cannot be reached as a generic control fill — they appear on the countdown, the live queue, scouting
chips and Competition Mode, and they mean one thing: which side of the field you are on.

IBM Plex Sans for language, IBM Plex Mono for every number, part code, timestamp and label, all
tabular — a countdown does not reflow as it ticks and price columns hold as toggles change them.

Competition Mode abandons all of it on purpose. At three metres in gym lighting, contrast beats
identity.

---

## Commands

```bash
npm run dev         # dev server
npm run build       # typecheck + production build
npm run preview     # serve the build
npm run typecheck   # tsc, no emit
npm test            # vitest
node scripts/generate-icons.mjs   # re-rasterise app icons from the vector mark
```

## Notes

- The seeded demo season is generated **relative to today**, so the next competition is always two
  weeks out and the app reads correctly whenever it is opened. **Settings → Restore demo season**
  regenerates it.
- The uploaded logo raster could not be retrieved from the design project intact — its file-read API
  caps at 256 KiB and the PNG exceeds it. The drawn vector mark that the same source specifies is
  used instead, which also gives real favicons and PWA icons. To use the raster, drop it at
  `public/brand/` and point [`Brand.tsx`](src/components/Brand.tsx) at it.
