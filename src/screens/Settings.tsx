import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, Field, SectionLabel, Select, Toggle } from '@/components/ui'
import { useStore, currentMember } from '@/store/useStore'
import { can } from '@/domain/permissions'
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
import { installState, onInstallStateChange, promptInstall } from '@/lib/install'
import { backupJson, download, parseBackup } from '@/lib/exporters'
import { blobBytes, clearApiCache } from '@/lib/idb'
import { ago, bytes } from '@/lib/format'
import { ROLE_LABEL, type Alliance, type Role } from '@/domain/types'

/**
 * Settings — the parts of the app that are configuration rather than season.
 *
 * Everything here is optional. With none of it filled in the app is a complete,
 * single-device, offline season manager; these fields add cloud sync, live event
 * data and alerts on top.
 */
export function SettingsScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const session = useStore((s) => s.session)
  const me = useStore(currentMember)
  const updateSettings = useStore((s) => s.updateSettings)
  const loadEvent = useStore((s) => s.loadEvent)
  const refreshTeam = useStore((s) => s.refreshTeam)
  const scoutBusy = useStore((s) => s.scoutBusy)
  const replaceSeason = useStore((s) => s.replaceSeason)
  const resetSeason = useStore((s) => s.resetSeason)
  const eraseEverything = useStore((s) => s.eraseEverything)
  const setRole = useStore((s) => s.setRole)
  const signOut = useStore((s) => s.signOut)
  const notify = useStore((s) => s.notify)

  const cfg = readConfig()
  const [url, setUrl] = useState(cfg.url)
  const [anonKey, setAnonKey] = useState(cfg.anonKey)
  const [teamSecret, setTeamSecret] = useState(cfg.teamSecret)
  const [testing, setTesting] = useState(false)
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null)

  const [eventCode, setEventCode] = useState(season.settings.eventCode)
  const [teamEvents, setTeamEvents] = useState<TeamParticipation[]>([])

  const [notifyState, setNotifyState] = useState(permission())
  const [storedBytes, setStoredBytes] = useState(0)
  const restoreRef = useRef<HTMLInputElement>(null)

  const manage = can(session.role, 'settings.manage')

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
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <h1 className="h1">Settings</h1>
        <p className="lede" style={{ marginTop: 4 }}>
          Everything here is optional. The app works fully offline with none of it set.
        </p>
      </div>

      <div className="cols cols-2">
        <div>
          {/* ── account ──────────────────────────────────── */}
          <div className="section">
            <SectionLabel>Account</SectionLabel>
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
                <Button size="sm" onClick={() => { signOut(); navigate('/') }}>
                  Sign out
                </Button>
              </div>

              {/*
               * Role preview is a real capability check against the same matrix
               * the app uses, so a coach can verify what a student actually sees
               * before a parent night. It changes the session view only.
               */}
              {manage && (
                <div style={{ marginTop: 14 }}>
                  <div className="label" style={{ marginBottom: 8 }}>
                    Preview as
                  </div>
                  <div className="wrap">
                    {(['coach', 'mentor', 'captain', 'student', 'parent'] as Role[]).map((r) => (
                      <Chip key={r} active={session.role === r} onClick={() => setRole(r)}>
                        {ROLE_LABEL[r]}
                      </Chip>
                    ))}
                  </div>
                  <p className="field-note">
                    Changes what this session can see, not what your account is. Sign out and back in to
                    reset.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── match + alerts ───────────────────────────── */}
          <div className="section">
            <SectionLabel>Match &amp; alerts</SectionLabel>
            <div className="card card-pad">
              <div className="label" style={{ marginBottom: 8 }}>
                Alliance
              </div>
              <div className="wrap" style={{ marginBottom: 14 }}>
                {(['red', 'blue'] as Alliance[]).map((a) => (
                  <Chip key={a} active={season.settings.alliance === a} onClick={() => updateSettings({ alliance: a })}>
                    {a === 'red' ? 'Red' : 'Blue'}
                  </Chip>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
                <Field
                  label="Match"
                  value={season.settings.matchLabel}
                  onChange={(e) => updateSettings({ matchLabel: e.target.value })}
                  mono
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Field
                  label="Field"
                  value={season.settings.matchField}
                  onChange={(e) => updateSettings({ matchField: e.target.value })}
                  mono
                  style={{ width: 90, flex: 'none' }}
                />
              </div>

              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '500 12.5px var(--font-sans)', color: 'var(--ink-2)' }}>Match alerts</div>
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

          {/* ── data ─────────────────────────────────────── */}
          <div className="section">
            <SectionLabel>Season data</SectionLabel>
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
                {manage && (
                  <Button size="sm" variant="quiet" onClick={() => void resetSeason()}>
                    Clear season data
                  </Button>
                )}
              </div>

              <p className="field-note">
                Backups omit password hashes and API keys, so a file you email around carries neither.
              </p>

              {manage && (
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
              )}
            </div>
          </div>
        </div>

        <div>
          {/* ── live data ────────────────────────────────── */}
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
                <div style={{ display: 'flex', gap: 9 }}>
                  <Select
                    label="Season"
                    value={String(season.settings.season)}
                    onChange={(e) => updateSettings({ season: Number(e.target.value) })}
                    style={{ flex: 1, minWidth: 0 }}
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
                    style={{ flex: 1, minWidth: 0 }}
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

          {/* ── sync ─────────────────────────────────────── */}
          <div className="section">
            <SectionLabel>Cloud sync · Supabase</SectionLabel>
            <div className="card card-pad">
              <p className="meta pretty" style={{ marginBottom: 12 }}>
                Run <span className="mono">supabase/migrations/0001_init.sql</span> against a project, then{' '}
                <span className="mono">select * from provision_team(&#39;{season.team.number}&#39;, &#39;{season.team.name}&#39;)</span>{' '}
                to get a team secret. Paste all three below. Use the anon key, never the service_role key.
              </p>

              <div className="stack" style={{ gap: 11 }}>
                <Field label="Project URL" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
                <Field label="Anon key" type="password" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} autoComplete="off" />
                <Field label="Team secret" type="password" value={teamSecret} onChange={(e) => setTeamSecret(e.target.value)} autoComplete="off" />
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
                The team secret is a shared credential, the same strength as the team code — it scopes rows
                to your team but does not identify individuals. See README → Security model.
              </p>
            </div>
          </div>

          {/* ── install ──────────────────────────────────── */}
          <div className="section">
            <SectionLabel>Install</SectionLabel>
            <InstallCard />
          </div>

          {/* ── about ────────────────────────────────────── */}
          <div className="section">
            <SectionLabel>About</SectionLabel>
            <div className="card-quiet card-pad">
              <div className="meta pretty">
                FTC Home · one place, all season. Built on the Anodized design system: graphite planes,
                hairline edges, one signal colour, alliance red and blue reserved for which side of the
                field you are on.
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
              <Button
                size="sm"
                variant="quiet"
                style={{ marginTop: 10, paddingLeft: 0 }}
                onClick={async () => {
                  await clearApiCache()
                  await refreshTeam()
                  notify('Cached FTCScout responses cleared')
                }}
              >
                Clear cached FTCScout data
              </Button>
            </div>
          </div>
        </div>
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
  const notify = useStore((s) => s.notify)

  useEffect(() => onInstallStateChange(() => setState(installState())), [])

  return (
    <div className="card card-pad">
      {state === 'installed' && (
        <>
          <div style={{ font: '500 12.5px var(--font-sans)', color: 'var(--ink-2)' }}>Installed</div>
          <p className="meta pretty" style={{ marginTop: 6 }}>
            Running as an app. The service worker is caching screens, and the season is stored with
            persistent storage so the browser will not evict it under pressure.
          </p>
        </>
      )}

      {state === 'available' && (
        <>
          <p className="meta pretty" style={{ marginBottom: 11 }}>
            Add FTC Home to your home screen. It opens without a browser bar and keeps working with no
            signal — which is the point at a competition.
          </p>
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              const outcome = await promptInstall()
              if (outcome === 'dismissed') notify('Install dismissed — you can do it later from here')
            }}
          >
            Install
          </Button>
        </>
      )}

      {state === 'manual-ios' && (
        <>
          <div style={{ font: '500 12.5px var(--font-sans)', color: 'var(--ink-2)' }}>On iPhone or iPad</div>
          <p className="meta pretty" style={{ marginTop: 6 }}>
            Safari has no install button for us to call. Tap <strong>Share</strong>, then{' '}
            <strong>Add to Home Screen</strong>.
          </p>
        </>
      )}

      {state === 'unavailable' && (
        <p className="meta pretty">
          This browser has not offered an install prompt. The app still works — installing only adds the
          home-screen launch.
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
