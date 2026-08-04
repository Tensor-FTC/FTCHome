import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Chip, Field, SectionLabel, Select, Toggle } from '@/components/ui'
import { useStore, currentMember } from '@/store/useStore'
import { can } from '@/domain/permissions'
import { readConfig, testConnection, writeConfig } from '@/lib/supabase'
import { fetchCompetition, hasApiKey, readApiKey, writeApiKey } from '@/lib/ftcEvents'
import { permission, requestPermission } from '@/lib/notifications'
import { backupJson, download, parseBackup } from '@/lib/exporters'
import { blobBytes } from '@/lib/idb'
import { ago, bytes } from '@/lib/format'
import { sampleCompetition } from '@/domain/seed'
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
  const setCompetition = useStore((s) => s.setCompetition)
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

  const [apiKey, setApiKey] = useState(readApiKey())
  const [eventCode, setEventCode] = useState(season.settings.ftcEventCode)
  const [ftcSeason, setFtcSeason] = useState(season.settings.ftcSeason)
  const [pulling, setPulling] = useState(false)

  const [notifyState, setNotifyState] = useState(permission())
  const [storedBytes, setStoredBytes] = useState(0)
  const restoreRef = useRef<HTMLInputElement>(null)

  const manage = can(session.role, 'settings.manage')

  useEffect(() => {
    void blobBytes().then(setStoredBytes)
  }, [season.media.length])

  async function pullEvent() {
    setPulling(true)
    try {
      const comp = await fetchCompetition(ftcSeason, eventCode.trim().toUpperCase())
      setCompetition(comp)
      updateSettings({ ftcEventCode: eventCode.trim().toUpperCase(), ftcSeason })
      notify(`Pulled ${comp.matches.length} matches from ${comp.name}`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not reach the FTC Events API', 'warn')
    } finally {
      setPulling(false)
    }
  }

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
                    Restore demo season
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
            <SectionLabel aside={hasApiKey() ? <span className="meta">key set</span> : undefined}>
              Live data · FIRST Events API
            </SectionLabel>
            <div className="card card-pad">
              <p className="meta pretty" style={{ marginBottom: 12 }}>
                Request a key at ftc-events.firstinspires.org/services/API. Paste it as{' '}
                <span className="mono">username:authorizationKey</span> — it stays in this browser and never
                syncs to other devices.
              </p>

              <Field
                label="API key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="username:authorizationKey"
                autoComplete="off"
              />
              <Button
                size="sm"
                style={{ marginTop: 9 }}
                onClick={() => {
                  writeApiKey(apiKey)
                  notify(apiKey.trim() ? 'API key saved to this browser' : 'API key cleared')
                }}
              >
                Save key
              </Button>

              <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
                <Field
                  label="Event code"
                  value={eventCode}
                  onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                  placeholder="ONMI"
                  mono
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Field
                  label="Season"
                  value={ftcSeason}
                  onChange={(e) => setFtcSeason(e.target.value)}
                  inputMode="numeric"
                  mono
                  style={{ width: 100, flex: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 9, marginTop: 11, flexWrap: 'wrap' }}>
                <Button size="sm" variant="primary" disabled={!hasApiKey() || pulling} onClick={() => void pullEvent()}>
                  {pulling ? 'Pulling…' : 'Pull rankings & schedule'}
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => {
                    setCompetition(sampleCompetition(season.competition.date))
                    notify('Reverted to sample event data')
                  }}
                >
                  Use sample data
                </Button>
              </div>

              <div className="meta" style={{ marginTop: 11 }}>
                Now showing: <strong style={{ color: 'var(--ink-2)' }}>{season.competition.name}</strong> ·{' '}
                {season.competition.source === 'ftc-api'
                  ? `live, fetched ${ago(season.competition.fetchedAt)}`
                  : season.competition.source}{' '}
                · {season.competition.matches.length} matches
              </div>
              <p className="field-note">
                If the pull fails with a network error in a browser, the FIRST API is refusing the
                cross-origin request; run the app from a deployed origin or proxy the call.
              </p>
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
                Team {season.team.number} · {season.team.name} · season {season.team.season}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function confirmErase(): boolean {
  return globalThis.confirm(
    'Erase every member, event, task, sponsor and uploaded file stored on this device?\n\nAnything already synced to Supabase stays there. This cannot be undone locally.',
  )
}
