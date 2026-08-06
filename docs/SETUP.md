# Setting up FTC Home

One walkthrough, start to finish: get it on the web, get it onto phones and laptops as an app, and
optionally connect a database so the whole team shares one season.

The three parts are independent and each one works without the next:

| Part | What you get | Time | Cost |
|---|---|---|---|
| **1 · Website** | A URL anyone on the team can open | ~10 min | Free |
| **2 · App** | Home-screen and desktop install, works with no signal | ~1 min per device | Free |
| **3 · Database** | Everyone sees the same season, on every device | ~15 min | Free tier |

You can stop after part 1 and have a working app — it just lives on one device per person.

---

## Before you start

You need [Node.js](https://nodejs.org) 20 or newer and a GitHub account. Check Node with:

```bash
node --version
```

Then, in the project folder:

```bash
npm install
```

To see it running locally right now:

```bash
npm run dev
```

That gives you `http://localhost:5173`. Everything works there except installing to a phone, which
needs a real https address — that is part 1.

---

## Part 1 · The website

The app is static files. Any host that serves static files over **https** works. Two things matter
anywhere you host it:

1. **https**, or browsers will not offer to install it.
2. **Unknown paths must fall back to `index.html`**, or a link straight to `/live` returns a 404.

### Option A — GitHub Pages (recommended, already wired up)

A workflow is included at `.github/workflows/deploy.yml`. It typechecks, runs the tests, builds
with the right base path, and deploys.

1. Push this repo to GitHub.
2. In the repo: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Push to `main`.

Your URL is `https://<your-username>.github.io/<repo-name>/`. Watch the run under the **Actions**
tab; a green tick means it is live.

The workflow copies `index.html` to `404.html`, which is how Pages does the fallback.

### Option B — Netlify, Vercel or Cloudflare Pages

Point it at the repo and use:

- **Build command:** `npm run build`
- **Output directory:** `dist`

Add a rewrite so deep links work. On Netlify, a `_redirects` file containing:

```
/*  /index.html  200
```

Vercel and Cloudflare Pages do this automatically for single-page apps.

### Option C — your school's own web server

```bash
npm run build
```

Upload the contents of `dist/`. Configure the server to serve `index.html` for any path it does not
recognise, and make sure the certificate is valid.

> If the site lives in a **subfolder** rather than at the root of a domain, build with the path set:
> `BASE_PATH=/ftc-home/ npm run build`. The GitHub Pages workflow does this for you.

---

## Part 2 · The app

Same URL, same code — a Progressive Web App. There is no separate build, no app store, and no
review process. Open the site once on a device and install it from the browser.

| Device | How to install |
|---|---|
| **Android** | Chrome offers a prompt, or **⋮ → Add to Home screen**. |
| **iPhone / iPad** | Safari: **Share → Add to Home Screen**. Safari has no install API, so this step is manual — it cannot be automated by any website. |
| **Windows / ChromeOS** | Chrome or Edge: the install icon at the right of the address bar. |
| **macOS** | Chrome or Edge as above. Safari: **File → Add to Dock**. |
| **Linux** | Chrome or Edge as above. |

**Settings → App → Install** works this out for you and shows either a one-click button or the
exact manual steps for the browser you are actually in. It never shows a button that would do
nothing.

Firefox does not install desktop web apps. The site still works normally there.

### What installing actually changes

- It launches in its own window, from the home screen, dock or Start menu, with no browser bar.
- Every screen is cached, so it **opens and works with no signal** — the point of the whole thing
  at a competition venue.
- The browser is asked not to evict your season under storage pressure.
- Competition Mode holds a wake lock, so a pit display does not sleep mid-match.

It does **not** change where your data lives. That is part 3.

---

## Part 3 · The database

**Read this first, because it decides whether you need it at all.**

FTC Home keeps your whole season in your browser's own database (IndexedDB) on each device. That is
the real copy. Every screen reads from it and it works with the wifi off.

Sync is *additive*. Turn it on and every change is **also** written to a queue, and whenever there
is signal that queue is pushed to a Postgres database that you own. Other devices on your team pull
the same rows back. Nothing in the app ever waits on the network, so a slow venue never blocks you.

**You need it if:** more than one person should see the same roster, calendar, budget and scouting
notes, or you want the season to survive a lost phone.

**You do not need it if:** one coach runs everything from one laptop. Export a backup now and then
(**Settings → Data → Export backup**) and you are covered.

### 3.1 Create the project

1. Sign up at [supabase.com](https://supabase.com) — the free tier is far more than a team needs.
2. **New project**. Pick a name and a region near you. Save the database password somewhere; you
   will not need it for this, but you will want it later.
3. Wait for it to finish provisioning (a minute or two).

### 3.2 Create the tables

1. In the project, open **SQL Editor → New query**.
2. Open [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) from this repo,
   copy all of it, paste it in, and press **Run**.

That creates one `records` table, the row-level security policies that keep one team's rows away
from another's, and a `provision_team` helper.

(If you use the Supabase CLI, `supabase db push` does the same thing.)

### 3.3 Mint your team secret

In the same SQL editor, run this with **your** team number and name:

```sql
select * from public.provision_team('11138', 'Robo Raiders');
```

It returns a long random string. **That is your team secret.** Copy it somewhere safe — it is
shown once and it is what proves a device belongs to your team.

### 3.4 Get your keys

**Project Settings → API**. You need two values:

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — a long string starting `eyJ…`

> Use the **anon** key. Never the `service_role` key. The anon key is meant to ship to browsers; the
> service_role key bypasses every security policy and must never leave your machine.

### 3.5 Connect the app

In FTC Home: **Settings → Sync → Connect a project**. Paste all three values — project URL, anon
key, team secret — and press **Save**, then **Test connection** for a real verdict rather than a
guess.

### 3.6 Add the rest of the team

Every device on the team pastes the **same three values**. That is it — they are now on the same
season.

Sync runs on load, on reconnect, every five minutes, and whenever you press sync. **Settings → Sync
→ See the queue** shows exactly what is waiting to go out, which is worth looking at once so you
trust it.

### How conflicts are handled

If two devices edit the same record, the later edit wins. That is deliberate: a coach fixing a
meeting time on the drive over should not lose to a stale tab left open in the pit.

---

## Putting it together

```
        FTCScout API                     Your Supabase project
   (public, no key needed)                  (optional, yours)
   team · events · rankings                roster · tasks · budget
   results · OPR                           media · scouting · weekly
            │                                        │
            │  read-only, cached                     │  push/pull via outbox
            ▼                                        ▼
   ┌──────────────────────────────────────────────────────────┐
   │  FTC Home, running from your URL                          │
   │  ─ every screen reads local IndexedDB, never the network  │
   └──────────────────────────────────────────────────────────┘
            │                    │                   │
        phone (installed)   laptop (installed)   pit display
```

Facts about teams, events and results always come from FTCScout and are cached so they survive a
venue with no signal. Everything your team writes lives on your devices, and — if you set up part 3
— in your own database. No data goes anywhere else.

---

## Troubleshooting

**The site works but there is no install button.**
It needs https. Check the address bar. On localhost it works regardless; on a real host, a
self-signed or expired certificate will block it.

**A deep link like `/calendar` 404s.**
The host is not falling back to `index.html`. See part 1.

**"Test connection" fails.**
Check that you pasted the **anon** key rather than the service_role key, that the URL has no
trailing slash, and that `0001_init.sql` actually ran (**Table Editor** should show a `records`
table). The error message says which of the three it got past.

**Changes are not reaching the other devices.**
Open **Settings → Sync → See the queue**. If items are stuck there, the device has no signal or the
secret is wrong. If the queue is empty and the other device still looks stale, that device has not
pulled yet — open it and it syncs on load.

**The team number or city is wrong.**
That comes from FTCScout, not from anything typed here. **Settings → Data → Refresh team &
schedule**, and if it is still wrong the record needs fixing at the source in FIRST's system.

**Everything vanished after clearing browser data.**
Browser data *is* the storage. If sync was set up, the season is still in your Supabase project and
comes back when you reconnect. If it was not, restore from a backup file. This is the reason to do
one or the other.
