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

That is the whole setup. Enter your team number and the app pulls your real identity, competitions,
match results and rankings from [FTCScout](https://ftcscout.org) — no account, no server, no API key.
Cloud sync is additive; see [Cloud sync](#cloud-sync--supabase).

> **Putting it on the web, onto phones, and onto a shared database:**
> [**docs/SETUP.md**](docs/SETUP.md) is the single end-to-end walkthrough for all three.

## Where the data comes from

**Nothing factual is authored by this app.** Team name, city, state, rookie year, registered
sponsors, competition schedule, venues, match results, rankings and OPR all come from the FTCScout
API and are cached locally so they survive a gym with no signal.

What the app stores locally is only what no API knows — your roster, tasks, budget, sponsorship
money, media and weekly write-ups. Those start **genuinely empty**. There is no demo season and no
sample data to delete later, because pre-filled examples are indistinguishable from real records
once somebody has scrolled past them twice.

| Comes from FTCScout | Entered by your team |
|---|---|
| Team name, school, city, state, country, rookie year | Roster and roles |
| Registered sponsors (as filed with FIRST) | Sponsorship money, goals, allocations |
| Competitions, dates, venues | Build sessions, deadlines, outreach |
| Match schedule, scores, W-L-T | Tasks, purchase approvals |
| Rankings and OPR (event and season, with world rank) | Photos, video, CAD, weekly write-ups |
| | Parts and prices (no catalogue is bundled — vendor prices go stale) |

**First run** walks you through it: look up your team number, add your coach, then a getting-started
checklist on Today tracks the five things only your team can supply. Each step ticks itself off when
the thing genuinely exists and the whole card disappears once you are running — no fake progress and
nothing to dismiss and re-find. **How this works** in the rail explains the rest.

---

## What it does

Nineteen screens, all backed by real state rather than fixtures.

| | Screen | What is actually live |
|---|---|---|
| 00 | Launch | One-shot mark animation, honours `prefers-reduced-motion` |
| A1–A5 | Team access · Who are you · Personal sign-in · Mentor sign-in · Register | Two-factor-by-design: a shared team code gets you to the door, your own password says who you are |
| R1 | Roster | Add/edit/remove members, subteams, mentor-only medical and contact records |
| 04 | Today | Next competition, today's meeting with RSVP, assigned tasks, gated approvals, blockers |
| 05 / C1 | Calendar · Plan | Month grid of labelled entries, repeating meetings expanded on read, task due dates, agenda, season timeline derived from the team's own competition dates, `.ics` export with `RRULE` and `EXDATE` |
| 06 | Event detail | RSVP, attendance forecast, who can't make it *by name*, cached attachments |
| 07 | Weekly dashboard | Auto blocks derived from tasks and RSVPs, human blocks written by the captain, publish + print + markdown export |
| 08 | Build log | Real photo/video/CAD upload to IndexedDB with generated thumbnails, storage meter, offline queue |
| 09 | Live event | Rank, record, match queue, scouting cards for the next match |
| 11b | Scout | Every team at the event: FTCScout rank/record/OPR, plus the team's own rating, tapped observations and alliance shortlist |
| 12 | Archive | Everything finished and past the cutoff, searchable, nothing deleted |
| 10 | Competition Mode | Pit board: pure black, 92px clock (260px on desktop), wake lock, rankings and schedule |
| 11 | States | The live outbox — what is queued, how big, when it goes |
| 01–03 | Guest onboarding · Parts · Team identity | No-account hub, your own bill of materials with CSV import/export, FTCScout lookup |
| — | Help | How it works: the five tabs, where numbers come from, what your role can do |
| 13 | Chat | Team, subteam and group channels, unread per device, offline-queued |
| A6–A7 | Cloud sign-in · Waiting for a coach | Email, magic link, Google, GitHub; a join request a coach accepts |
| — | Settings | Five tabs: You, Team (who can see what), Data, Sync, App |

### Beyond the prototype

- **PWA** — one install for phone *and* desktop, service worker, offline-first,
  `navigator.storage.persist()` so a season is not treated as a disposable cache. See
  [Installing it as an app](#installing-it-as-an-app).
- **Export & import** — parts to and from CSV (RFC 4180, so a vendor sheet with commas in part names
  imports cleanly), roster and budget to CSV, calendar to `.ics` (folded, escaped, with `RRULE`),
  weekly dashboard to markdown, whole season to JSON and back.
- **Match alerts** — Web Notifications at the lead time, at one minute, and at zero, fired off the
  real schedule. Never repeat; an alert you learn to swipe away is worse than none.
- **Desktop layouts** — the tab bar becomes a 240px rail, Today goes three columns, the weekly
  dashboard goes masonry, and the countdown leaves the bottom edge for a sticky top bar.
- **Print stylesheet** — the weekly dashboard is the one thing teams hand to sponsors, so it inverts
  to ink-on-paper instead of costing a toner cartridge in graphite.
- **Role preview** — a coach can see exactly what a student or parent sees, checked against the same
  capability matrix the app enforces.
- **Team visibility policy** — everything starts visible to the whole team, and a coach can narrow
  budget figures, purchase amounts, contact records, roster editing and calendar editing to
  signed-in members or to staff. Structural authority is deliberately *not* configurable: no
  setting lets a student approve their own purchase, and no setting hands a write or a minor's
  contact details to a signed-out guest.
- **A planner, not an event list** — meetings that repeat weekly or monthly on chosen days, ending
  after a count or a date, expanded on read rather than materialised as rows; a single occurrence
  can be skipped without deleting the series; task due dates land on the same grid; and an entry
  can be on the calendar without expecting anyone to turn up.
- **Archive** — a filter, not a mutation. Finished things past the cutoff move out of the working
  screens and nothing is deleted; unfinished work never archives however old it is.
- **CAD viewer** — STL (binary and ASCII) and OBJ render in a WebGL viewer written directly against
  the GL API, lazy-loaded into its own 6 kB chunk. `.f3d`/`.f3z` and STEP say plainly why they
  cannot be drawn and what to export instead, rather than showing an empty canvas.
- **Real accounts, and a coach in the loop** — email and password, an emailed link, Google or
  GitHub, all through Supabase Auth. Signing in proves who you are; a coach decides who is on the
  roster, so a public sign-up page is not also a way onto every team. The team-code path stays
  first-class because OAuth needs a network and a competition venue often does not have one.
- **Per-person grants** — a coach can hand one capability to one member by name, so a trusted
  captain runs the budget and a treasurer parent approves purchases without either pretending to be
  a coach. Handing out access and changing team settings are never grantable.
- **Chat** — a team channel, subteam channels derived from the roster, and groups. Same outbox as
  everything else, so a message typed with no signal sends itself later.
- **Staffing that fits real teams** — several coaches with no head, mentors carrying it with no
  coach, or a coach lost in January. The roster names a single point of failure and refuses to let
  the last adult be removed or demoted.

---

## Installing it as an app

It is one codebase that installs as **both** a phone app and a desktop app — a PWA, so there is no
separate build, no app store, and no Electron runtime to ship.

Installing needs an **https** address. `npm run dev` on localhost counts, so you can try it
immediately, but to get it onto a phone it has to be hosted.

### 1 · Put it online

A GitHub Actions workflow is included. Push to `main`, then in the repo go to
**Settings → Pages → Source → GitHub Actions**. Every push typechecks, tests, builds and deploys to
`https://<you>.github.io/<repo>/`.

It works anywhere static: `npm run build` and upload `dist/` to Netlify, Vercel, Cloudflare Pages or
any web server. Only two things matter — serve over https, and rewrite unknown paths to
`index.html` so a deep link like `/live` resolves. (The workflow does this by copying `index.html`
to `404.html`, which is how Pages handles it.)

### 2 · Install from the browser

| Platform | How |
|---|---|
| **Android** | Chrome shows an install prompt, or **⋮ → Add to Home screen**. Also **Settings → Install** in the app. |
| **iPhone / iPad** | Safari has no install API, so: **Share → Add to Home Screen**. It then launches full-screen. |
| **Windows / ChromeOS** | Chrome or Edge: the install icon in the address bar, or **Settings → Install**. You get a real window and a taskbar icon. |
| **macOS** | Chrome or Edge as above. Safari: **File → Add to Dock**. |
| **Linux** | Chrome or Edge as above. |

Firefox does not install desktop web apps; the site still works normally there.

**Settings → Install** detects which of these applies to you and either shows a one-click button or
the exact manual steps — it never shows a button that would do nothing.

### What installing actually buys you

- Launches in its own window with no browser chrome, from the home screen, dock or Start menu.
- The service worker caches every screen, so it opens instantly and **works with no signal** —
  which is the whole point at a competition.
- `navigator.storage.persist()` asks the browser not to evict your season under storage pressure.
- Competition Mode gets a wake lock, so a pit display does not sleep mid-match.

Your data stays on the device either way. Installing changes how it launches, not where anything is
stored — set up [Cloud sync](#cloud-sync--supabase) if you want it on more than one device.

---

## Architecture

```
src/
  domain/     types, capability matrix, season construction
  lib/        ftcScout · idb · sync · supabase · crypto · media · exporters · notifications
  store/      one zustand store; every mutation stamps, persists and queues
  components/ shell, nav, countdown, media thumb, ui primitives
  screens/    the nineteen, plus Help and Settings
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

**What it actually is:** the season lives in your browser's own IndexedDB, and that is the real
copy — every screen reads from it, which is why the app works with the wifi off. Sync is additive:
every change is *also* written to an outbox, and when there is signal that outbox is pushed to a
Postgres database you own. Other devices pull the same rows back. Nothing in the app ever awaits
the network. Conflicts resolve last-write-wins per record on `updatedAt`.

Full step-by-step walkthrough, including where each of the three values lives in the Supabase
dashboard: [**docs/SETUP.md**](docs/SETUP.md).

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

## Live data · FTCScout

No setup. [`ftcScout.ts`](src/lib/ftcScout.ts) talks to the public API at `api.ftcscout.org`, which
needs no key and reflects the request origin in its CORS headers, so it works straight from the
browser.

Routes were verified against the upstream source
([`packages/server/src/rest/v1`](https://github.com/ftc-scout/ftc-scout)) rather than guessed:

- `GET /rest/v1/teams/:number` — identity
- `GET /rest/v1/teams/:number/events/:season` — registered events, with per-event rank and record
- `GET /rest/v1/teams/:number/quick-stats?season=` — season OPR split auto / teleop / endgame, ranked
  against every team that season
- `GET /rest/v1/events/search/:season?region=` — events near you
- `POST /graphql` — one query for an event's rankings *with team names* plus the full match schedule,
  which the REST routes would need N+1 requests to assemble

Every response is cached in IndexedDB and **served stale when the network is unreachable**, labelled
with how old it is. A failed refresh is never an error state — the screen keeps its last good data.

**Defaults are US.** `UnitedStates` is the default region; once a team is linked, its region is
derived from its home state (WA → `USWA`). California, New York and Texas keep the umbrella option
because upstream splits them into sub-regions and picking one would be a guess.

**On OPR.** The numbers shown are FTCScout's own OPR (`totalPointsNp`), not a local approximation.
Season figures come from quick-stats and carry a world rank, e.g. *#420 of 8,362*.

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

- **Settings → Clear season data** wipes the roster, tasks, budget and media but keeps the team's
  FTCScout identity and schedule, which is almost always what you want between seasons.
- Seasons run 2019–2025 (`Decode`). The API rejects anything outside that, so the picker only offers
  what it accepts.
- The uploaded logo raster could not be retrieved from the design project intact — its file-read API
  caps at 256 KiB and the PNG exceeds it. The drawn vector mark that the same source specifies is
  used instead, which also gives real favicons and PWA icons. To use the raster, drop it at
  `public/brand/` and point [`Brand.tsx`](src/components/Brand.tsx) at it.

---

## Design notes

- [**docs/SETUP.md**](docs/SETUP.md) — website, app install and database, end to end.
- [**docs/team-identity.md**](docs/team-identity.md) — what happens if a team sets up under someone
  else's number, why it cannot currently happen, and what to build first if this is ever hosted.
