# Who owns a team number?

**The question:** what happens if a team sets up FTC Home under someone else's team number — by
typo, or deliberately — and how would we fix it?

Part design note, part description of what is built. The options are recorded so the decision is
not re-litigated from scratch later; [what is actually implemented](#what-is-actually-implemented)
says which of them shipped.

---

## The scenario, concretely

> Somebody who dislikes a team signs up, creates a coach account naming that team's number, and
> then never uses it. What happens to the real team?

**Nothing.** They set up their own workspace and carry on. The impostor is left holding an empty
room nobody visits.

That is not luck; it is the one design decision that makes this whole class of problem
uninteresting. A team number is a **label a workspace displays**, not a key one workspace holds and
another cannot. `teams.workspace_id` is the identity, two workspaces may both say 11138, and
neither blocks the other. `claim_team` refuses only on a workspace that already has active members
— which is the impostor's own, never the real team's.

So the attack costs the attacker a sign-up and yields an empty database nobody sees. No lockout, no
exposure, nothing for anybody to resolve, and no support queue.

What it does *not* prevent is **confusion**: two workspaces exist, and a new student could be handed
the wrong link. The mitigations there are ordinary rather than clever — a coach hands out the link,
and a coach accepts every person who asks to join. Somebody who lands in the impostor's workspace
sees nothing and is accepted by nobody, because the impostor is not there to accept them either.

`last_active_at` is written on every change, so a dormant workspace is visible if this is ever
hosted and somebody wants to sweep them up. It is not load-bearing.

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

The correct answer, and unavailable.

FIRST publishes no sign-in service and no identity API. The FTC Events API covers event data —
schedules, scores, rankings — and authenticates the *caller* with a key requested by email; it has
no concept of an end user, and there is nothing for a person to log in to. There is no OAuth, no
OpenID Connect, no endpoint mapping a team number to a verified adult contact, and no supported way
to ask "is this person on this team's registration".

So "sign in with FIRST" is not a matter of effort. It cannot be built by anyone outside FIRST. If
that ever changes it immediately becomes the right answer and most of this page becomes
unnecessary.

The nearest honest substitute is the one already shipped: a coach, who knows the team, accepting
people by name.

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

## What is actually implemented

Of the above, three are in the app today:

- **A — non-exclusive team numbers.** `teams.workspace_id` is the identity; the number is a label.
  This is what makes the squatting scenario a non-event.
- **C — first-come, plus a coach in the loop.** Anybody can sign in; only a coach puts somebody on
  a roster. A wrong workspace is therefore a room you cannot get into rather than a leak.
- **E's precondition — `last_active_at`,** recorded on every write, so dormant workspaces are
  visible if expiry is ever wanted.

F (transfer tokens) and B (website verification) are not built. Neither is needed while the app is
self-hosted, and both are cheap to add if it stops being.

## The one thing worth doing now

Not a claim system — a guard rail on exposure, which is the only part that is genuinely serious.

When someone joins a workspace whose team number does not match the one they typed, say so plainly
before they add anybody's contact details. That is cheap, needs no server, and addresses risk 3
directly. It is also correct behaviour in the self-hosted world we are actually in today, where a
mistyped number and a shared secret is the realistic version of this mistake.
