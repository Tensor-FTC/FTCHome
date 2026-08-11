# Setting up FTC Home

One walkthrough, start to finish: get it on the web, get it onto phones and laptops as an app, and
optionally connect a database so the whole team shares one season.

The parts are independent, and each one works without the next:

| Part | What you get | Time | Cost |
|---|---|---|---|
| **1 · Website** | A URL anyone on the team can open | ~10 min | Free, or ~$12/yr with your own domain |
| **2 · App** | Home-screen and desktop install, works with no signal | ~1 min per device | Free |
| **3 · Database** | Everyone sees the same season, on every device | ~15 min | Free tier |
| **4 · Accounts** | Email, Google and GitHub sign-in; coaches accept people | ~10 min | Free |

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

> **Want a real domain like `ftchome.app` rather than `you.github.io/FTCHome`?**
> Skip to [Option C](#option-c--a-real-domain). It is about ten minutes and the price of a domain.

### Option A — GitHub Pages (free, already wired up)

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

### Option C — a real domain

This is the one to pick if the team is going to use it properly. Two parts: buy
a name, then point a host at it.

**1 · Buy the domain.** [Cloudflare Registrar](https://dash.cloudflare.com) sells at
cost with no upsells (~$10–12/yr for `.com`, and `.app` and `.dev` are HTTPS-only
by default, which suits this). Namecheap and Porkbun are fine too. Anything short
that a student can type on a phone at a competition.

**2 · Host it.** All three of these are free for a site this size, connect to the
GitHub repo, redeploy on every push, and issue the HTTPS certificate for you:

| Host | Custom domain setup |
|---|---|
| **Cloudflare Pages** | Workers & Pages → Create → connect the repo. Build `npm run build`, output `dist`. Custom domains → add yours. If the domain is also at Cloudflare, DNS is filled in automatically. |
| **Vercel** | Import the repo, accept the detected Vite settings, then Settings → Domains → add yours and copy the DNS records it shows. |
| **Netlify** | Add new site → import the repo. Build `npm run build`, publish `dist`. Domain management → add a custom domain. |

Whichever you pick, leave the base path alone — a site at the root of a domain
needs no `BASE_PATH`, which is one fewer thing to get wrong than Pages.

Point the DNS records the host gives you at your registrar, wait for the
certificate (usually under a minute, occasionally an hour), and that is the whole
job. The GitHub Actions workflow in this repo is only needed for Pages; these
hosts build it themselves.

**Then update the OAuth redirect.** If you set up part 4, add the new URL to
Supabase → Authentication → URL Configuration, or Google sign-in comes back to
the old address.

### Option D — your school's own web server

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

### iPhone and iPad

**It has to be Safari.** Chrome and Firefox on iOS cannot install a web app — Apple only gives that
ability to Safari, so there is no way around it and no button any website can show you.

1. Open the URL in **Safari**.
2. Tap the **Share** button — the square with an arrow coming out of the top, in the bottom bar.
3. Scroll down the list of actions and tap **Add to Home Screen**.
4. Tap **Add**, top right.

It now launches full screen from the home screen, with no Safari bar, and works with no signal.

### Windows

Chrome or Edge. An **install icon** appears at the right-hand end of the address bar — a small
monitor with a downward arrow. Click it, then **Install**.

You get a real window with its own taskbar icon and no browser chrome. It also shows up in Start.

If the icon is not there: **⋮ → Cast, save and share → Install this page as an app** (Chrome), or
**⋯ → Apps → Install this site as an app** (Edge).

### Mac

- **Chrome or Edge**: same install icon in the address bar as Windows.
- **Safari**: **File → Add to Dock**, then **Add**. (Safari 17 or newer.)

Either way it lands in the Dock and opens in its own window.

### Anywhere

**Settings → App → Install** inside the app works out which browser and platform you are on and
shows either a one-click button or the exact manual steps. It never shows a button that would do
nothing.

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
- **Publishable key** — starts `sb_publishable_…`

> Supabase replaced the old `anon` / `service_role` key pair with **publishable** and **secret**
> keys. If your project is older you may still see an `anon` key starting `eyJ…` instead — that
> works too, and the app accepts either without any change.

> Use the **publishable** key. Never the **secret** key (`sb_secret_…`, formerly `service_role`).
> The publishable key is designed to ship to browsers; the secret key bypasses every row-level
> security policy and must never leave your machine.

### 3.5 Connect the app

In FTC Home: **Settings → Sync → Connect a project**. Paste all three values — project URL,
publishable key, team secret — and press **Save**, then **Test connection** for a real verdict
rather than a guess.

### 3.6 Add the rest of the team

There are two ways onto the season, and either is enough.

**By account — the normal one.** Send them the site. They sign in with email, Google, GitHub or
Apple, land on a waiting screen, and you accept them from **Roster → Asking to join**, picking
their role as you accept. Nothing to paste and no secret to pass around. If the project URL and
publishable key were baked in as repository secrets (part 2), this is the whole of it.

**By team secret — for a device, not a person.** Paste all three values into **Settings → Sync**.
This is for a shared pit laptop that nobody signs into, and it works with no account at all.

Prefer accounts. The team secret is a shared password: anyone holding it can read and write
everything for your team whether or not you ever accepted them, and removing them from the roster
does not take it back. An account you can revoke — set their status away from active and their
access stops.

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
Check that you pasted the **publishable** key rather than the secret key, that the URL has no
trailing slash, and that `0001_init.sql` actually ran (**Table Editor** should show a `records`
table). The error message says which of the three it got past.

**Google sign-in comes back to a 404, or says the redirect is not allowed.**
The URL has to be listed in Supabase → Authentication → URL Configuration →
Redirect URLs, exactly, including any subpath. Add both the deployed URL and
`http://localhost:5173` if you develop locally.

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


---

## Part 4 · Accounts

Optional, and only worth doing once part 3 is done — accounts sign in against
the same Supabase project.

Without this, the first person to open the app creates an account stored on
that device alone. That works completely offline, which is why it is still the
fallback at competitions. With it, everyone has an account that follows them
between devices, and a coach controls who is on the roster.

### 4.1 Run the remaining migrations

**In order**, each as its own **SQL Editor → New query → Run**:

| File | What it adds |
|---|---|
| [`0002_accounts.sql`](../supabase/migrations/0002_accounts.sql) | Membership, the rules for who may accept whom, and `claim_team` so a brand-new team's first coach is not waiting on an approval only they could give. |
| [`0003_invites.sql`](../supabase/migrations/0003_invites.sql) | Invites — `accept_invite` is the only path that makes somebody active without a coach pressing approve, and an email-bound invite is claimable only by the matching account. |

Run all three (`0001`, `0002`, `0003`) even if you are not using invites yet.
Skipping one leaves functions the app calls missing, and the failure shows up
later as a sign-in that half works rather than as an obvious error.

(With the Supabase CLI, `supabase db push` applies all of them at once.)

### 4.2 Turn on the sign-in methods

**Authentication → Providers.**

- **Email** is on by default. Leave "Confirm email" on — it is what stops
  somebody signing up as an address they do not own.
- **Google**: create an OAuth client at
  [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services
  → Credentials → OAuth client ID → Web application. Paste the callback URL
  Supabase shows you into "Authorised redirect URIs", then paste the client ID
  and secret back into Supabase.
- **GitHub**: Settings → Developer settings → OAuth Apps → New. Same idea — the
  callback URL comes from Supabase.

### 4.3 Set the redirect URLs

**Authentication → URL Configuration.** Site URL is where the app lives. Add
every address it is reachable at to Redirect URLs — the deployed one, and
`http://localhost:5173` if you develop locally. A missing entry here is the
single most common reason a Google sign-in lands on an error.

### 4.4 The first coach

Sign in with your own account, then in the app choose **Set up my team**. That
calls `claim_team`, which makes you a coach of a team that has no members yet
and refuses on a team that already does.

### 4.5 Everyone else

They open the same URL, sign in however they like, and land on a *waiting*
screen where they say who they are. You see them on the roster under **Asking to
join**, pick their role, and accept. Nothing about the team is visible to them
before that.

Signing in proves who somebody is. It does not put them on your team — that is
your decision, and it is the reason a public sign-up page is not also a way onto
every team's roster.

### There is no team password

There used to be one, and it was removed because it protected nothing. One
string that every member knows, that lives in a group chat and is never rotated,
adds nothing on top of individual passwords and a coach accepting people — and a
device that has never synced holds an empty season anyway, so there was nothing
on it to gate.

Whoever opens a freshly set-up app first creates their own account and is that
team's coach. There is nobody to approve them, so requiring approval would be a
deadlock. Everyone after that goes through the roster.

### Giving one person extra access

Roster → tap a member → **Also allowed to**. A trusted captain can approve
purchases; a treasurer parent can run the budget. It is per person and adds to
whatever their role already allows.

Two things are deliberately never grantable: handing out access, and changing
team settings. Either one would let a granted account grant itself the rest.

### Can we sign in with our FIRST account instead?

No, and not because it is hard.

FIRST publishes no sign-in service and no identity API. The FTC Events API
covers *event data* — schedules, scores, rankings — and needs a key you request
by email; it cannot tell an app who you are, and there is nothing to log in to.
Nobody outside FIRST can verify a person against a team's registration, so no
third-party app can do this. If that ever changes it would be the right answer;
today it does not exist.

The nearest honest substitute is what is already here: a coach, who knows the
team, accepting people by name.
