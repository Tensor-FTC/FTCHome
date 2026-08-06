# Who owns a team number?

**The question:** what happens if a team sets up FTC Home under someone else's team number — by
typo, or deliberately — and how would we fix it?

This is a design note, not a description of shipped behaviour. It records the options and the
recommendation so the decision is not re-litigated from scratch later.

---

## First: today, this problem does not exist

It is worth being precise about the current architecture, because it dissolves most of the question.

- A team number is looked up on **FTCScout**, which is read-only and public. Typing 11138 does not
  claim anything from anyone; it fetches facts about a team that already exists.
- Cloud sync is **self-hosted**. Each team creates their own Supabase project and mints their own
  team secret. There is no shared namespace, so there is nothing to squat on. Two teams both
  entering 11138 get two entirely separate databases that never meet.
- The team secret is bound to a row *inside one project*. It is not a global identity.

So the honest answer today is: **a wrong team number is a cosmetic error in one team's own copy,
fixable in ten seconds under Settings → Data → Change team.** No one else is affected, and no
support process is needed.

The question only becomes real if FTC Home is ever offered as a **hosted service** where one
database holds many teams. Everything below is about that case.

---

## What is actually at stake in the hosted case

Ranked by how much it would matter:

1. **Lockout** — the real team cannot use the app because someone else holds their number.
2. **Impersonation** — a stranger appears to be that team to anyone who sees the workspace.
3. **Data exposure** — a member of the real team joins the wrong workspace and posts a roster,
   including minors' contact details, where strangers can read it. This is the serious one.
4. **Confusion** — two workspaces, and nobody knows which is current.

Number 3 is the reason this deserves thought at all. The rest is annoyance.

---

## Options

### A. Make the collision harmless — decouple identity from the number

Give each workspace a random id. The team number becomes a *displayed attribute*, exactly like the
city and the rookie year, rather than the primary key. Two workspaces can both say "11138" without
either blocking the other, and nobody is ever locked out.

- **Cost:** almost nothing; this is close to the current model already.
- **Fixes:** lockout entirely.
- **Does not fix:** impersonation or a member joining the wrong workspace.

This should be the foundation whatever else is chosen, because it removes the worst outcome without
needing a human in the loop.

### B. Automatic proof via the team's registered website

FTCScout already returns a `website` field for many teams — the URL the team gave FIRST. A claim
can be verified by asking the claimer to put a token at that URL (a `/.well-known/ftc-home.txt`
file, or a `<meta>` tag), then fetching it.

- **Cost:** low. One fetch, one comparison.
- **Strength:** genuinely good. Control of the registered website is strong evidence.
- **Coverage:** partial — many teams have no website, and some list a school page they cannot edit.

Worth doing as an *optional badge* ("verified via the team's registered website") rather than a
requirement, since it can never cover everyone.

### C. First claim wins, with a dispute path

Whoever sets up first holds the number. A visible "this is our team, not theirs" link opens a form
that emails a maintainer, who checks and transfers.

- **Cost:** low to build, ongoing to run. Someone has to read the email.
- **Strength:** it is what nearly every small tool does, and it works, because the volume is tiny.
- **Risk:** the maintainer becomes the single point of failure and has no authoritative source to
  check against — FIRST does not publish team contacts.

Combined with option A the stakes are low enough that a slow human process is fine.

### D. Vouching by an existing member

A second person from the same team confirms the claim. Prevents a lone actor from squatting.

- **Cost:** medium. Needs a real invite flow with per-person identity.
- **Weakness:** useless for the first claim, which is exactly the case in question.

### E. Claims expire each season

A workspace not opened for a whole season releases its number. Abandoned squats self-heal, and so
do the far more common cases: a coach who left, a graduated captain who set it up on a school
account nobody can get into.

- **Cost:** low. One scheduled job.
- **Worth doing regardless**, because the graduating-seniors case is real every single year.

### F. Manual transfer token

The current holder generates a code that hands the workspace to someone else. Not about disputes at
all — it is about the handover that happens every June.

- **Cost:** low.
- **Worth doing regardless**, for the same reason as E.

### G. Verify against FIRST's own systems

The correct answer, and unavailable: there is no public API that maps a team number to a verified
adult contact. The FIRST API covers event data, not identity. Not pursuable.

---

## Recommendation

If FTC Home is ever hosted, do these in order:

1. **A — random workspace ids.** Nobody can be locked out. This alone removes the worst outcome and
   should be built even if nothing else is.
2. **F and E — transfer tokens and season expiry.** These are not really about disputes; they solve
   the annual handover, which is a certainty rather than a hypothetical.
3. **C — first-come plus an email dispute path.** The volume will be a handful a year. A human
   reading an email is proportionate, and pretending otherwise builds machinery nobody needs.
4. **B — website verification as an optional badge.** Nice, cheap, partial. Not a gate.

Explicitly **not** recommended: requiring verification before a team can start. The app's whole
premise is that a coach can be useful with it inside two minutes, offline, at a kickoff event. A
verification wall at the front door costs far more than the problem it prevents.

## The one thing worth doing now

Not a claim system — a guard rail on exposure, which is the only part that is genuinely serious.

When someone joins a workspace whose team number does not match the one they typed, say so plainly
before they add anybody's contact details. That is cheap, needs no server, and addresses risk 3
directly. It is also correct behaviour in the self-hosted world we are actually in today, where a
mistyped number and a shared secret is the realistic version of this mistake.
