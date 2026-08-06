import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Chip, Field, SectionLabel, Select, Toggle } from '@/components/ui'
import { useStore, currentMember } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { AUDIENCE_LABEL } from '@/domain/permissions'
import { staffingIssues } from '@/domain/staffing'
import { readConfig, testConnection, writeConfig } from '@/lib/supabase'
import {
  getTeamSeason,
  INTERNATIONAL_REGIONS,
  REGION_GROUPS,
  regionLabel,
  SEASON_NAMES,
  SEASONS,
  US_REGIONS,
  type Season as ScoutSeason,
  type TeamParticipation,
} from '@/lib/ftcScout'
import { permission, requestPermission } from '@/lib/notifications'
import { installState, onInstallStateChange, platform, promptInstall } from '@/lib/install'
import { backupJson, download, parseBackup } from '@/lib/exporters'
import { blobBytes, clearApiCache } from '@/lib/idb'
import { ago, bytes } from '@/lib/format'
import { ROLE_LABEL, type Alliance, type Audience, type Role, type TeamPolicy } from '@/domain/types'

/**
 * Settings — the parts of the app that are configuration rather than season.
 *
 * Everything here is optional. With none of it filled in the app is a complete,
 * single-device, offline season manager; these panels add cloud sync, live event
 * data and alerts on top.
 *
 * Split into five tabs on purpose. As one page it was a wall of unrelated
 * controls — a student's sign-out button sitting next to a Postgres URL — and
 * the things a team actually changes were buried under the things a team sets
 * once. Each tab now answers one question.
 */

type Tab = 'you' | 'team' | 'data' | 'sync' | 'app'

const TABS: { id: Tab; label: string }[] = [
  { id: 'you', label: 'You' },
  { id: 'team', label: 'Team' },
  { id: 'data', label: 'Data' },
  { id: 'sync', label: 'Sync' },
  { id: 'app', label: 'App' },
]

export function SettingsScreen() {
  const [tab, setTab] = useState<Tab>('you')

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <h1 className="h1">Settings</h1>
        <p className="lede" style={{ marginTop: 4 }}>
          Everything here is optional. The app works fully offline with none of it set.
        </p>
      </div>

      <div className="section" style={{ paddingTop: 12 }}>
        <div className="wrap">
          {TABS.map((t) => (
            <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      {tab === 'you' && <YouTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'data' && <DataTab />}
      {tab === 'sync' && <SyncTab />}
      {tab === 'app' && <AppTab />}
    </div>
  )
}

// ── you ─────────────────────────────────────────────────────

function YouTab() {
  const navigate = useNavigate()
  const session = useStore((s) => s.session)
  const me = useStore(currentMember)
  const setRole = useStore((s) => s.setRole)
  const signOut = useStore((s) => s.signOut)
  const allow = useCan()

  return (
    <div className="cols cols-2">
      <div className="section">
        <SectionLabel>Signed in as</SectionLabel>
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: '500 14px var(--font-sans)', color: 'var(--ink)' }}>
                {me?.name ?? 'Browsing as guest'}
              </div>
              <div className="meta-mono">
                {me?.username ?? '—'} · {ROLE_LABEL[session.role]}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                signOut()
                navigate('/')
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>

      {allow('settings.manage') && (
        <div className="section">
          <SectionLabel>Check what others see</SectionLabel>
          <div className="card card-pad">
            {/*
             * A real capability check against the same matrix the app uses, so a
             * coach can verify what a student actually sees before a parent
             * night rather than trusting the settings copy.
             */}
            <div className="wrap">
              {(['coach', 'mentor', 'captain', 'student', 'parent'] as Role[]).map((r) => (
                <Chip key={r} active={session.role === r} onClick={() => setRole(r)}>
                  {ROLE_LABEL[r]}
                </Chip>
              ))}
            </div>
            <p className="field-note">
              Switches this session's view only — it does not change your account or anyone else's. Sign
              out and back in to reset.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── team ────────────────────────────────────────────────────

const AUDIENCES: Audience[] = ['everyone', 'members', 'staff']

/** The visibility settings a coach can move, and what each one actually gates. */
const POLICY_ROWS: {
  key: keyof TeamPolicy
  title: string
  detail: string
  /** Contact records are safeguarding, not preference — they never open to guests. */
  max?: Audience
}[] = [
  {
    key: 'budgetFigures',
    title: 'Sponsor totals and the fundraising goal',
    detail: 'The meter is always public. This is who sees the actual numbers behind it.',
  },
  {
    key: 'purchaseAmounts',
    title: 'What individual purchases cost',
    detail: 'Requests are visible either way; this hides the amounts.',
  },
  {
    key: 'contactRecords',
    title: 'Contact and medical records',
    detail: "Members' phone numbers, guardians and allergies. Never visible to guests or parents.",
    max: 'members',
  },
  {
    key: 'rosterEditing',
    title: 'Who can edit the roster',
    detail: 'Adding people, changing roles and subteams.',
    max: 'members',
  },
  {
    key: 'calendarEditing',
    title: 'Who can add to the calendar',
    detail: 'Meetings, deadlines and task due dates.',
    max: 'members',
  },
]

const ARCHIVE_WINDOWS = [
  { days: 7, label: 'A week old' },
  { days: 14, label: 'Two weeks old' },
  { days: 30, label: 'A month old' },
  { days: 90, label: 'Three months old' },
  { days: 0, label: 'Never archive' },
]

function TeamTab() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const updateSettings = useStore((s) => s.updateSettings)
  const allow = useCan()
  const policy = season.settings.policy
  const manage = allow('policy.manage')
  const issues = staffingIssues(season)

  const setPolicy = (patch: Partial<TeamPolicy>) => updateSettings({ policy: { ...policy, ...patch } })

  return (
    <div className="cols cols-2">
      <div className="section">
        <SectionLabel>Who can see what</SectionLabel>
        <div className="card card-pad">
          <p className="meta pretty" style={{ marginBottom: 14 }}>
            Everything starts visible to the whole team, because the students raising the money should be
            able to see the money. Narrow anything your team needs tighter.
          </p>

          <div className="stack" style={{ gap: 14 }}>
            {POLICY_ROWS.map((row) => {
              const options = row.max === 'members' ? AUDIENCES.filter((a) => a !== 'everyone') : AUDIENCES
              return (
                <div key={row.key}>
                  <Select
                    label={row.title}
                    value={String(policy[row.key])}
                    disabled={!manage}
                    onChange={(e) => setPolicy({ [row.key]: e.target.value as Audience })}
                  >
                    {options.map((a) => (
                      <option key={a} value={a}>
                        {AUDIENCE_LABEL[a]}
                      </option>
                    ))}
                  </Select>
                  <p className="field-note">{row.detail}</p>
                </div>
              )
            })}
          </div>

          {!manage && (
            <p className="meta" style={{ marginTop: 12 }}>
              Coaches and mentors set these.
            </p>
          )}
          <p className="field-note" style={{ marginTop: 12 }}>
            Deciding spending and managing settings are never configurable: a student cannot approve their
            own purchase whatever is set here.
          </p>
        </div>
      </div>

      <div>
        <div className="section">
          <SectionLabel>Archive</SectionLabel>
          <div className="card card-pad">
            <Select
              label="Move finished things out of the way when they are"
              value={String(policy.archiveAfterDays)}
              disabled={!manage}
              onChange={(e) => setPolicy({ archiveAfterDays: Number(e.target.value) })}
            >
              {ARCHIVE_WINDOWS.map((w) => (
                <option key={w.days} value={w.days}>
                  {w.label}
                </option>
              ))}
            </Select>
            <p className="field-note">
              Nothing is deleted — it moves to the{' '}
              <Link to="/archive" style={{ color: 'var(--signal)' }}>
                archive
              </Link>
              . Unfinished work never archives, however old.
            </p>
          </div>
        </div>

        <div className="section">
          <SectionLabel>People</SectionLabel>
          <div className="card card-pad">
            <div className="meta" style={{ marginBottom: 10 }}>
              {season.members.length} members · {season.members.filter((m) => m.pending).length} invites
              pending
            </div>
            {issues.length === 0 ? (
              <p className="meta pretty">No staffing problems. More than one adult can approve spending.</p>
            ) : (
              issues.map((issue) => (
                <p key={issue.id} className="meta pretty" style={{ marginBottom: 8 }}>
                  <strong style={{ color: issue.severity === 'blocking' ? 'var(--signal)' : 'var(--ink-2)' }}>
                    {issue.title}.
                  </strong>{' '}
                  {issue.detail}
                </p>
              ))
            )}
            <Button size="sm" style={{ marginTop: 10 }} onClick={() => navigate('/roster')}>
              Open the roster
            </Button>
          </div>
        </div>

        <div className="section">
          <SectionLabel>Pit board</SectionLabel>
          <div className="card card-pad">
            {/*
             * Nothing to type: which match, field and alliance all come from the
             * loaded schedule. The only setting is the colour to fall back to
             * when no match is queued.
             */}
            <div className="label" style={{ marginBottom: 8 }}>
              Alliance when no match is queued
            </div>
            <div className="wrap">
              {(['red', 'blue'] as Alliance[]).map((a) => (
                <Chip
                  key={a}
                  active={season.settings.alliance === a}
                  onClick={() => updateSettings({ alliance: a })}
                >
                  {a === 'red' ? 'Red' : 'Blue'}
                </Chip>
              ))}
            </div>
            <p className="field-note">
              During an event the countdown uses the real alliance from the schedule, not this.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── data ────────────────────────────────────────────────────

function DataTab() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const allow = useCan()
  const updateSettings = useStore((s) => s.updateSettings)
  const loadEvent = useStore((s) => s.loadEvent)
  const refreshTeam = useStore((s) => s.refreshTeam)
  const scoutBusy = useStore((s) => s.scoutBusy)
  const replaceSeason = useStore((s) => s.replaceSeason)
  const resetSeason = useStore((s) => s.resetSeason)
  const notify = useStore((s) => s.notify)

  const [eventCode, setEventCode] = useState(season.settings.eventCode)
  const [teamEvents, setTeamEvents] = useState<TeamParticipation[]>([])
  const [storedBytes, setStoredBytes] = useState(0)
  const restoreRef = useRef<HTMLInputElement>(null)
  const manage = allow('settings.manage')

  useEffect(() => {
    void blobBytes().then(setStoredBytes)
  }, [season.media.length])

  // The team's own registered events, so loading one is a tap rather than a
  // remembered event code.
  useEffect(() => {
    if (!season.team.number) return
    let live = true
    void getTeamSeason(season.team.number, season.settings.season as ScoutSeason).then((rows) => {
      if (live) setTeamEvents(rows)
    })
    return () => {
      live = false
    }
  }, [season.team.number, season.settings.season])

  return (
    <div className="cols cols-2">
      <div className="section">
        <SectionLabel aside={<span className="meta">no key needed</span>}>Live data · FTCScout</SectionLabel>
        <div className="card card-pad">
          <p className="meta pretty" style={{ marginBottom: 12 }}>
            Team identity, competitions, rankings, match results and OPR all come from{' '}
            <a href="https://ftcscout.org" target="_blank" rel="noreferrer noopener">
              ftcscout.org
            </a>
            . It is a free public API — nothing to sign up for.
          </p>

          <div className="stack" style={{ gap: 11 }}>
            <div className="field-row">
              <Select
                label="Season"
                value={String(season.settings.season)}
                onChange={(e) => updateSettings({ season: Number(e.target.value) })}
              >
                {[...SEASONS].reverse().map((s) => (
                  <option key={s} value={s}>
                    {s} · {SEASON_NAMES[s]}
                  </option>
                ))}
              </Select>
              <Select
                label="Region"
                value={season.settings.region}
                onChange={(e) => updateSettings({ region: e.target.value })}
              >
                <optgroup label="Groups">
                  {REGION_GROUPS.map((r) => (
                    <option key={r} value={r}>
                      {regionLabel(r)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="United States">
                  {US_REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="International">
                  {INTERNATIONAL_REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                Your events this season
              </div>
              {teamEvents.length === 0 ? (
                <p className="meta">
                  No {SEASON_NAMES[season.settings.season as never] ?? season.settings.season} events
                  registered for {season.team.number || 'this team'} yet.
                </p>
              ) : (
                <div className="wrap">
                  {teamEvents.map((e) => (
                    <Chip
                      key={e.eventCode}
                      active={season.settings.eventCode === e.eventCode}
                      disabled={scoutBusy}
                      onClick={async () => {
                        const r = await loadEvent(e.eventCode)
                        notify(r.message, r.ok ? 'ok' : 'warn')
                      }}
                    >
                      {e.eventCode}
                    </Chip>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end' }}>
              <Field
                label="Or any event code"
                value={eventCode}
                onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                placeholder="USWABAM1"
                mono
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button
                variant="primary"
                disabled={scoutBusy || !eventCode.trim()}
                onClick={async () => {
                  const r = await loadEvent(eventCode)
                  notify(r.message, r.ok ? 'ok' : 'warn')
                }}
              >
                {scoutBusy ? 'Loading…' : 'Load'}
              </Button>
            </div>
          </div>

          <div className="meta" style={{ marginTop: 12 }}>
            {season.competition.source === 'ftc-scout' ? (
              <>
                Loaded: <strong style={{ color: 'var(--ink-2)' }}>{season.competition.name}</strong> ·{' '}
                {season.competition.rankings.length} teams · {season.competition.matches.length} matches ·{' '}
                {season.competition.stale ? 'cached' : 'updated'} {ago(season.competition.fetchedAt)}
              </>
            ) : (
              'No event loaded yet.'
            )}
          </div>

          <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
            <Button size="sm" disabled={scoutBusy} onClick={() => void refreshTeam()}>
              Refresh team &amp; schedule
            </Button>
            <Button size="sm" variant="quiet" onClick={() => navigate('/identity')}>
              Change team
            </Button>
          </div>
        </div>
      </div>

      <div className="section">
        <SectionLabel>Your season</SectionLabel>
        <div className="card card-pad">
          <div className="meta" style={{ marginBottom: 12 }}>
            {season.members.length} members · {season.events.length} events · {season.media.length} media ·{' '}
            {bytes(storedBytes)} of files on this device
          </div>

          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              onClick={() =>
                download(
                  `ftc-${season.team.number}-backup-${new Date().toISOString().slice(0, 10)}.json`,
                  backupJson(season),
                  'application/json',
                )
              }
            >
              Export backup
            </Button>
            <input
              ref={restoreRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const restored = parseBackup(await file.text())
                  await replaceSeason(restored)
                  notify(`Restored ${restored.team.number} ${restored.team.name}`)
                } catch (err) {
                  notify(err instanceof Error ? err.message : 'Could not read that file', 'warn')
                }
                e.target.value = ''
              }}
            />
            <Button size="sm" onClick={() => restoreRef.current?.click()}>
              Restore backup
            </Button>
          </div>

          <p className="field-note">
            Backups omit password hashes and API keys, so a file you email around carries neither.
          </p>

          {manage && (
            <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
              <Button size="sm" variant="quiet" onClick={() => void resetSeason()}>
                Clear season data
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── sync ────────────────────────────────────────────────────

function SyncTab() {
  const season = useStore((s) => s.season)
  const notify = useStore((s) => s.notify)
  const allow = useCan()

  const cfg = readConfig()
  const [url, setUrl] = useState(cfg.url)
  const [anonKey, setAnonKey] = useState(cfg.anonKey)
  const [teamSecret, setTeamSecret] = useState(cfg.teamSecret)
  const [testing, setTesting] = useState(false)
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null)

  if (!allow('settings.manage')) {
    return (
      <div className="section">
        <div className="card-quiet card-pad">
          <p className="meta pretty">
            Coaches and mentors set up sync. Your work is saved on this device either way — nothing is
            lost if sync is never configured.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="cols cols-2">
      <div className="section">
        <SectionLabel>What sync actually is</SectionLabel>
        <div className="card-quiet card-pad">
          <p className="meta pretty">
            FTC Home keeps your whole season in your browser's own database. That is the real copy — every
            screen reads from it, and it works with the wifi off.
          </p>
          <p className="meta pretty" style={{ marginTop: 10 }}>
            Sync is optional and additive. Turn it on and every change is also written to a queue, and when
            there is signal that queue is pushed to a Postgres database you own at{' '}
            <a href="https://supabase.com" target="_blank" rel="noreferrer noopener">
              Supabase
            </a>
            . Other devices on your team pull the same rows back. Nothing waits on the network, so a slow
            venue never blocks the app.
          </p>
          <p className="meta pretty" style={{ marginTop: 10 }}>
            When two devices edit the same record, the later edit wins. That is deliberate: a coach fixing
            a time on the drive over should not lose to a stale tab left open in the pit.
          </p>
          <Link to="/help">
            <Button size="sm" variant="quiet" style={{ marginTop: 12, paddingLeft: 0 }}>
              Full setup walkthrough
            </Button>
          </Link>
        </div>
      </div>

      <div className="section">
        <SectionLabel>Connect a project</SectionLabel>
        <div className="card card-pad">
          <p className="meta pretty" style={{ marginBottom: 12 }}>
            Run <span className="mono">supabase/migrations/0001_init.sql</span> against a project, then{' '}
            <span className="mono">
              select * from provision_team(&#39;{season.team.number || '12345'}&#39;, &#39;
              {season.team.name || 'Your team'}&#39;)
            </span>{' '}
            to get a team secret. Paste all three below. Use the anon key, never the service_role key.
          </p>

          <div className="stack" style={{ gap: 11 }}>
            <Field
              label="Project URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxx.supabase.co"
            />
            <Field
              label="Anon key"
              type="password"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              autoComplete="off"
            />
            <Field
              label="Team secret"
              type="password"
              value={teamSecret}
              onChange={(e) => setTeamSecret(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                writeConfig({ url, anonKey, teamSecret })
                notify('Sync settings saved')
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              disabled={testing}
              onClick={async () => {
                writeConfig({ url, anonKey, teamSecret })
                setTesting(true)
                setVerdict(await testConnection())
                setTesting(false)
              }}
            >
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            <Link to="/states">
              <Button size="sm" variant="quiet">
                See the queue
              </Button>
            </Link>
          </div>

          {verdict && (
            <div
              className="meta"
              style={{ marginTop: 11, color: verdict.ok ? 'var(--signal)' : 'var(--pressure-ink)' }}
            >
              {verdict.message}
            </div>
          )}

          <p className="field-note">
            The team secret is a shared credential, the same strength as the team code — it scopes rows to
            your team but does not identify individuals. See README → Security model.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── app ─────────────────────────────────────────────────────

function AppTab() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const allow = useCan()
  const updateSettings = useStore((s) => s.updateSettings)
  const refreshTeam = useStore((s) => s.refreshTeam)
  const eraseEverything = useStore((s) => s.eraseEverything)
  const notify = useStore((s) => s.notify)
  const [notifyState, setNotifyState] = useState(permission())
  const manage = allow('settings.manage')

  return (
    <div className="cols cols-2">
      <div>
        <div className="section">
          <SectionLabel>Install</SectionLabel>
          <InstallCard />
        </div>

        <div className="section">
          <SectionLabel>Match alerts</SectionLabel>
          <div className="card card-pad">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: '500 12.5px var(--font-sans)', color: 'var(--ink-2)' }}>
                  Notify me before a match
                </div>
                <div className="meta" style={{ marginTop: 2 }}>
                  {notifyState === 'unsupported'
                    ? 'This browser has no Notification API.'
                    : notifyState === 'denied'
                      ? 'Blocked in browser settings.'
                      : 'Fires at the lead time, at one minute, and at zero. Never repeats.'}
                </div>
              </div>
              <Toggle
                checked={season.settings.notificationsEnabled && notifyState === 'granted'}
                label="Match alerts"
                onChange={async (next) => {
                  if (next) {
                    const result = await requestPermission()
                    setNotifyState(result)
                    updateSettings({ notificationsEnabled: result === 'granted' })
                    if (result !== 'granted') notify('Notifications were not allowed', 'warn')
                  } else {
                    updateSettings({ notificationsEnabled: false })
                  }
                }}
              />
            </div>

            <Select
              label="Lead time"
              value={String(season.settings.notifyLeadSeconds)}
              onChange={(e) => updateSettings({ notifyLeadSeconds: Number(e.target.value) })}
            >
              <option value="180">3 minutes</option>
              <option value="300">5 minutes</option>
              <option value="600">10 minutes</option>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <div className="section">
          <SectionLabel>About</SectionLabel>
          <div className="card-quiet card-pad">
            <div className="meta pretty">
              FTC Home · one place, all season. Real data from FTCScout, everything else your team's own.
            </div>
            <div className="meta-mono" style={{ marginTop: 10 }}>
              {season.team.number
                ? `${season.team.number} ${season.team.name} · ${[season.team.city, season.team.state].filter(Boolean).join(', ')}`
                : 'No team linked'}
            </div>
            <div className="meta-mono">
              {SEASON_NAMES[season.settings.season as ScoutSeason] ?? season.settings.season} · identity
              synced {ago(season.team.syncedAt)}
            </div>
            <Link to="/help">
              <Button size="sm" variant="quiet" style={{ marginTop: 10, paddingLeft: 0 }}>
                How this works
              </Button>
            </Link>
          </div>
        </div>

        {manage && (
          <div className="section">
            <SectionLabel>Advanced</SectionLabel>
            <div className="card card-pad">
              <p className="meta pretty" style={{ marginBottom: 12 }}>
                Only needed when something is stuck. Neither of these touches anything already synced to
                your own database.
              </p>
              <Button
                size="sm"
                onClick={async () => {
                  await clearApiCache()
                  await refreshTeam()
                  notify('Cached FTCScout responses cleared')
                }}
              >
                Clear cached FTCScout data
              </Button>
              <Button
                size="sm"
                variant="danger"
                style={{ marginTop: 12 }}
                onClick={() => {
                  // Two-step rather than a modal: the second press is the confirmation.
                  if (confirmErase()) {
                    void eraseEverything().then(() => {
                      notify('Local data erased')
                      navigate('/')
                    })
                  }
                }}
              >
                Erase everything on this device
              </Button>
              <p className="field-note">
                Export a backup first if you have never set up sync — this device would be the only copy.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Installing matters more here than in most apps: a home-screen launch gets the
 * service worker and persistent storage, which is what "works in a gym" rests on.
 */
function InstallCard() {
  const [state, setState] = useState(installState())
  const where = platform()
  const notify = useStore((s) => s.notify)

  useEffect(() => onInstallStateChange(() => setState(installState())), [])

  return (
    <div className="card card-pad">
      {state === 'installed' && (
        <>
          <div style={{ font: '500 12.5px var(--font-sans)', color: 'var(--ink-2)' }}>Installed</div>
          <p className="meta pretty" style={{ marginTop: 6 }}>
            Running as an app. Screens are cached by the service worker and the season is held in
            persistent storage, so the browser will not evict it under pressure.
          </p>
        </>
      )}

      {state === 'available' && (
        <>
          <p className="meta pretty" style={{ marginBottom: 11 }}>
            {where === 'desktop'
              ? 'Installs as a desktop app with its own window and taskbar icon — no browser chrome.'
              : 'Adds FTC Home to your home screen. Opens without a browser bar and keeps working with no signal.'}
          </p>
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              const outcome = await promptInstall()
              if (outcome === 'dismissed') notify('Install dismissed — you can do it later from here')
            }}
          >
            Install FTC Home
          </Button>
        </>
      )}

      {state === 'manual-ios' && (
        <>
          <div style={{ font: '500 12.5px var(--font-sans)', color: 'var(--ink-2)' }}>On iPhone or iPad</div>
          <p className="meta pretty" style={{ marginTop: 6 }}>
            Safari has no install button we can call. Tap <strong>Share</strong>, scroll down, then{' '}
            <strong>Add to Home Screen</strong>. It then launches full-screen like any other app.
          </p>
        </>
      )}

      {state === 'manual-safari-desktop' && (
        <>
          <div style={{ font: '500 12.5px var(--font-sans)', color: 'var(--ink-2)' }}>On Safari for Mac</div>
          <p className="meta pretty" style={{ marginTop: 6 }}>
            Choose <strong>File → Add to Dock</strong>. Chrome and Edge offer a one-click install instead.
          </p>
        </>
      )}

      {state === 'insecure' && (
        <p className="meta pretty">
          Installing needs an <strong>https</strong> address (or localhost). Deploy the app and open it
          over https — see the README for a one-command GitHub Pages setup.
        </p>
      )}

      {state === 'unavailable' && (
        <p className="meta pretty">
          This browser has not offered an install prompt. Chrome, Edge and Android browsers support it;
          Firefox does not install desktop web apps. The app works either way — installing only adds the
          standalone window and offline caching.
        </p>
      )}
    </div>
  )
}

function confirmErase(): boolean {
  return globalThis.confirm(
    'Erase every member, event, task, sponsor and uploaded file stored on this device?\n\nAnything already synced to Supabase stays there. This cannot be undone locally.',
  )
}
