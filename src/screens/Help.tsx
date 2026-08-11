import { Link } from 'react-router-dom'
import { Button, SectionLabel } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { ROLE_LABEL, type Role } from '@/domain/types'

/**
 * How this works.
 *
 * Written for a student opening the app on their phone for the first time, not
 * as feature marketing. Every section answers a question somebody actually asks
 * in a shop: where do the numbers come from, why can't I see the money, what
 * happens when there is no signal.
 */
export function HelpScreen() {
  const season = useStore((s) => s.season)
  const role = useStore((s) => s.session.role)

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <h1 className="h1">How FTC Home works</h1>
        <p className="lede" style={{ marginTop: 4 }}>
          One place for the season: what&rsquo;s next, who&rsquo;s needed, what&rsquo;s blocked, and what
          happened at your last event.
        </p>
      </div>

      <div className="cols cols-2">
        <div>
          {/* ── the five tabs ────────────────────────────── */}
          <div className="section">
            <SectionLabel>The five tabs</SectionLabel>
            <div className="card" style={{ overflow: 'hidden' }}>
              <Row
                to="/today"
                name="Today"
                body="Your next competition, today's meeting, the tasks assigned to you, and anything waiting on a mentor. Start here."
              />
              <Row
                to="/calendar"
                name="Calendar"
                body="Every build session, deadline, task due date and competition. Competitions arrive automatically from FTCScout; you add the rest under Plan."
              />
              <Row
                to="/weekly"
                name="Weekly"
                body="A week's summary for parents and sponsors. Progress bars build themselves from your tasks; the write-up is yours."
              />
              <Row
                to="/build"
                name="Build"
                body="Photos, video and CAD, grouped by the day you did the work. This is what the notebook and the weekly page pull from."
              />
              <Row
                to="/live"
                name="Live"
                body="At a competition: your rank, record and match schedule. Scout takes you to every team at the event."
              />
            </div>
          </div>

          {/* ── where numbers come from ──────────────────── */}
          <div className="section">
            <SectionLabel>Where the numbers come from</SectionLabel>
            <div className="card card-pad">
              <p className="body pretty" style={{ color: 'var(--ink-3)', margin: 0 }}>
                Anything factual about your team or a competition is pulled from{' '}
                <a href="https://ftcscout.org" target="_blank" rel="noreferrer noopener">
                  FTCScout
                </a>{' '}
                — your name and city, your event schedule, match results, rankings and OPR. The app never
                makes those up, and it tells you when it is showing a cached copy.
              </p>
              <p className="body pretty" style={{ color: 'var(--ink-3)', marginTop: 12 }}>
                Everything else is yours to enter: the roster, tasks, budget, sponsorship money, photos
                and write-ups. That is why the app starts empty — there is no sample data to sort from
                the real thing later.
              </p>
              {season.team.number && (
                <div className="meta-mono" style={{ marginTop: 12 }}>
                  Linked to {season.team.number} {season.team.name} ·{' '}
                  {[season.team.city, season.team.state].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          {/* ── roles ────────────────────────────────────── */}
          <div className="section">
            <SectionLabel>What your role can do</SectionLabel>
            <div className="card" style={{ overflow: 'hidden' }}>
              {(['coach', 'mentor', 'captain', 'student', 'parent'] as Role[]).map((r) => (
                <div
                  key={r}
                  style={{
                    padding: '12px 15px',
                    borderBottom: '1px solid var(--line-soft)',
                    background: r === role ? 'var(--signal-bg)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        font: '500 12.5px var(--font-sans)',
                        color: r === role ? 'var(--signal-tint)' : 'var(--ink-body)',
                      }}
                    >
                      {ROLE_LABEL[r]}
                    </span>
                    {r === role && (
                      <span className="label" style={{ color: 'var(--signal)' }}>
                        you
                      </span>
                    )}
                  </div>
                  <div className="meta" style={{ marginTop: 3 }}>
                    {ROLE_HELP[r]}
                  </div>
                </div>
              ))}
            </div>
            <p className="field-note">
              These are the defaults. A coach can widen or narrow who sees budget figures, purchase
              amounts and contact records under <strong>Settings &rarr; Team</strong> — but never who
              gets to <em>decide</em> spending, which is fixed. Gating is real rather than cosmetic:
              figures you are not cleared for are never sent to your device, so there is nothing to
              find by poking around.
            </p>
          </div>

          {/* ── offline ──────────────────────────────────── */}
          <div className="section">
            <SectionLabel>No signal, no problem</SectionLabel>
            <div className="card card-pad">
              <p className="body pretty" style={{ color: 'var(--ink-3)', margin: 0 }}>
                The app never waits for the network, so it works with no internet at all. Everything you do
                is saved on your device immediately and queued to send later. A grey strip at the top
                means you are working from cache — nothing is broken and nothing is lost.
              </p>
              <p className="body pretty" style={{ color: 'var(--ink-3)', marginTop: 12 }}>
                Install it and that gets better: the app opens in its own window from your home screen,
                dock or Start menu, and every screen is cached before you lose signal. On iPhone that is
                <strong>Share → Add to Home Screen</strong> in Safari; on Windows and Mac it is the install
                icon in Chrome or Edge&rsquo;s address bar. <strong>Settings → App</strong> shows the exact
                steps for whatever you are on.
              </p>
              <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
                <Link to="/settings">
                  <Button size="sm" variant="primary">
                    Install the app
                  </Button>
                </Link>
                <Link to="/states">
                  <Button size="sm" variant="quiet">
                    See what&rsquo;s queued
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* ── sync ─────────────────────────────────────── */}
          <div className="section">
            <SectionLabel>What the Supabase thing is</SectionLabel>
            <div className="card card-pad">
              <p className="body pretty" style={{ color: 'var(--ink-3)', margin: 0 }}>
                Your season lives in your browser&rsquo;s own database, on your device. That is the real
                copy — every screen reads from it, which is why the app works with the wifi off.
              </p>
              <p className="body pretty" style={{ color: 'var(--ink-3)', marginTop: 12 }}>
                Sync is optional and it only adds. Turn it on and every change is <em>also</em> written
                to a queue, and when there is signal that queue is pushed to a{' '}
                <a href="https://supabase.com" target="_blank" rel="noreferrer noopener">
                  Supabase
                </a>{' '}
                database your team owns. Everyone else&rsquo;s device pulls the same rows back, so the
                roster, calendar, budget and scouting notes are the same everywhere.
              </p>
              <p className="body pretty" style={{ color: 'var(--ink-3)', marginTop: 12 }}>
                Nothing in the app waits for that to finish. If two people edit the same thing, the
                later edit wins — a coach fixing a meeting time on the drive over should not lose to a
                stale tab left open in the pit.
              </p>
              <p className="meta pretty" style={{ marginTop: 12 }}>
                Setting it up is a coach job and takes about fifteen minutes: make a free project, run
                one SQL file, and paste three values into Settings. Every device then pastes the same
                three. Without it the app still works completely — it just stays on one device per
                person, so take a backup now and then.
              </p>
              <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
                <Link to="/settings">
                  <Button size="sm">Set up sync</Button>
                </Link>
              </div>
            </div>
          </div>

          {/* ── shortcuts ────────────────────────────────── */}
          <div className="section">
            <SectionLabel>Worth knowing</SectionLabel>
            <div className="card card-pad">
              <Tip label="Search">
                <span className="mono">Ctrl</span> or <span className="mono">⌘</span> +{' '}
                <span className="mono">K</span> searches every event, task, person, part and pit note at
                once.
              </Tip>
              <Tip label="Competition Mode">
                From Live — a black, high-contrast board readable from across the room. Leave it running on a
                laptop in the pit.
              </Tip>
              <Tip label="The countdown">
                It appears on its own within three hours of a match on your loaded schedule, and is
                hidden the rest of the time. No match, no clock.
              </Tip>
              <Tip label="Match alerts">
                Turn them on in Settings and your phone warns you before you are queued, once — not
                every thirty seconds.
              </Tip>
              <Tip label="Repeating meetings">
                Add a build session once and set it to repeat — twice a week, for eight weeks. Skipping
                one week does not delete the series.
              </Tip>
              <Tip label="The archive">
                Anything finished and older than a month moves out of the working screens into the
                Archive. Nothing is deleted, and unfinished work never moves however old it is.
              </Tip>
              <Tip label="CAD">
                Upload an STL or OBJ and it spins right in the build log. Fusion&rsquo;s own .f3d files
                are a closed format nothing else can open — right-click the body in Fusion and choose
                Save as Mesh.
              </Tip>
              <Tip label="Export">
                Calendar to <span className="mono">.ics</span>, parts and roster to CSV, the whole
                season to a JSON backup.
              </Tip>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ROLE_HELP: Record<Role, string> = {
  coach: 'Everything: roster, contact details, the budget, and approving spending.',
  mentor: 'Same as a coach — approve purchases, manage the roster, read contact details.',
  captain: 'Edit the calendar, assign tasks, publish the weekly page. Sees budget totals, not purchase amounts.',
  student: 'Tick off your tasks, RSVP, upload to the build log, add pit notes, request a purchase.',
  parent: 'Read-only. Sees the schedule and the weekly page, but no money and no records.',
  guest: 'Browsing without an account — public event data only.',
}

function Row({ to, name, body }: { to: string; name: string; body: string }) {
  return (
    <Link
      to={to}
      style={{ display: 'block', padding: '13px 15px', borderBottom: '1px solid var(--line-soft)', color: 'inherit' }}
    >
      <div style={{ font: '500 13px var(--font-sans)', color: 'var(--ink-body)' }}>{name}</div>
      <div className="meta pretty" style={{ marginTop: 3 }}>
        {body}
      </div>
    </Link>
  )
}

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div className="meta pretty">{children}</div>
    </div>
  )
}
