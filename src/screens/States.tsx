import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, LockedValue, Toggle } from '@/components/ui'
import { useStore } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { pendingWrites, syncTarget } from '@/lib/sync'
import { isSupabaseConfigured } from '@/lib/supabase'
import { ago, bytes } from '@/lib/format'
import type { OutboxEntry } from '@/domain/types'

/**
 * 11 · States
 *
 * Offline and queued, a rookie's empty first week, and permission denied — the
 * three states that decide whether a team trusts the app.
 *
 * Offline is grey and specific: what is queued, how big, and when it goes. Never
 * red, never a retry button. Red is reserved and, with no internet, a lie —
 * nothing is broken.
 */
export function StatesScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const allow = useCan()
  const online = useStore((s) => s.online)
  const syncing = useStore((s) => s.syncing)
  const lastResult = useStore((s) => s.lastSyncResult)
  const sync = useStore((s) => s.sync)
  const updateSettings = useStore((s) => s.updateSettings)

  const [queue, setQueue] = useState<OutboxEntry[]>([])
  const offline = !online || season.settings.simulateOffline

  useEffect(() => {
    let live = true
    const load = () => void pendingWrites().then((q) => live && setQueue(q))
    load()
    const id = setInterval(load, 2000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [syncing])

  const queuedBytes = queue.reduce((sum, e) => sum + e.bytes, 0)

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <h1 className="h1">States &amp; sync</h1>
        <p className="lede" style={{ marginTop: 4 }}>
          What is queued, what is empty, and what is withheld.
        </p>
      </div>

      <div className="cols cols-2">
        <div>
          {/* ── offline / queue ──────────────────────────── */}
          <div className="section">
            <div className="label" style={{ marginBottom: 9 }}>
              {offline ? 'Offline · queued sync' : 'Connected'}
            </div>
            <div className="card card-pad">
              <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 12 }}>
                <span className={`dot ${offline ? '' : 'dot-live'}`} style={{ width: 8, height: 8 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '500 13.5px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>
                    {offline ? 'Working from cache' : 'Live'}
                  </div>
                  <div className="meta">
                    Last sync {ago(season.settings.lastSyncAt)} · {syncTarget()}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 11 }} className="stack">
                {queue.length === 0 ? (
                  <span className="meta">Nothing queued. Every change is already saved on this device.</span>
                ) : (
                  queue.slice(0, 8).map((entry) => (
                    <div
                      key={entry.id}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}
                    >
                      <span style={{ font: '400 11.5px var(--font-sans)', color: '#9ba5a9', minWidth: 0 }}>
                        {entry.label}
                      </span>
                      <span
                        className="num"
                        style={{ font: '500 10.5px var(--font-mono)', color: 'var(--ink-4)', flex: 'none' }}
                      >
                        {entry.bytes > 1024 * 512 ? 'ON WI-FI' : 'QUEUED'} · {bytes(entry.bytes)}
                      </span>
                    </div>
                  ))
                )}
                {queue.length > 8 && <span className="meta">and {queue.length - 8} more</span>}
              </div>

              <div className="meta" style={{ marginTop: 11, color: 'var(--ink-rail)' }}>
                Nothing is lost. It sends when there&rsquo;s signal.
                {queuedBytes > 0 ? ` ${bytes(queuedBytes)} waiting.` : ''}
              </div>

              <div style={{ display: 'flex', gap: 9, marginTop: 13, flexWrap: 'wrap' }}>
                <Button size="sm" variant="primary" disabled={syncing || !isSupabaseConfigured()} onClick={() => void sync({ announce: true })}>
                  {syncing ? 'Syncing…' : 'Sync now'}
                </Button>
                {!isSupabaseConfigured() && (
                  <Button size="sm" variant="quiet" onClick={() => navigate('/settings')}>
                    Set up cloud sync
                  </Button>
                )}
              </div>

              {lastResult?.error && (
                <div className="meta" style={{ marginTop: 10, color: 'var(--pressure-ink)' }}>
                  {lastResult.error}
                </div>
              )}
            </div>
          </div>

          {/* ── simulate ─────────────────────────────────── */}
          {allow('settings.manage') && (
            <div className="section">
              <div className="card-quiet card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '500 12.5px var(--font-sans)', color: 'var(--ink-2)' }}>
                    Rehearse offline
                  </div>
                  <div className="meta" style={{ marginTop: 2 }}>
                    Forces the offline treatment on so you can check a screen before you need it.
                  </div>
                </div>
                <Toggle
                  checked={season.settings.simulateOffline}
                  onChange={(v) => updateSettings({ simulateOffline: v })}
                  label="Simulate offline"
                />
              </div>
            </div>
          )}
        </div>

        <div>
          {/* ── empty ────────────────────────────────────── */}
          <div className="section">
            <div className="label" style={{ marginBottom: 9 }}>
              Empty · rookie week 1
            </div>
            <EmptyState
              title="No week yet"
              body="Your first dashboard builds itself once there's a meeting on the calendar."
              action={
                allow('calendar.edit')
                  ? { label: 'Add first meeting', onClick: () => navigate('/calendar/edit') }
                  : undefined
              }
            />
          </div>

          {/* ── permission denied ────────────────────────── */}
          <div className="section">
            <div className="label" style={{ marginBottom: 9 }}>
              Permission denied
            </div>
            <div className="card card-pad">
              <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    flex: 'none',
                    borderRadius: 9,
                    background: 'var(--srf-3)',
                    border: '1px solid var(--line-2)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <svg width="12" height="14" viewBox="0 0 10 12" aria-hidden="true">
                    <path d="M2 5V3.5a3 3 0 016 0V5" stroke="var(--ink-3)" strokeWidth="1.3" fill="none" />
                    <rect x="1" y="5" width="8" height="6" rx="1.2" fill="var(--ink-5)" />
                  </svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '500 13.5px/1.3 var(--font-sans)', color: 'var(--ink-body)' }}>
                    Contact details
                  </div>
                  <div className="meta" style={{ marginTop: 3 }}>
                    {allow('roster.readContact')
                      ? 'You can read these because you are staff. Students and captains cannot.'
                      : "Coaches and mentors only. Your captain can't see this either."}
                  </div>
                  {/*
                   * Only mask it when it is actually withheld. Showing dots to
                   * somebody who has just been told they may read these is a
                   * flat contradiction, and it read as a permissions bug.
                   */}
                  {allow('roster.readContact') ? (
                    <Button size="sm" style={{ marginTop: 11 }} onClick={() => navigate('/roster')}>
                      Open the roster
                    </Button>
                  ) : (
                    <>
                      <div style={{ marginTop: 11 }}>
                        <LockedValue shape="•••• ••• ••••" />
                      </div>
                      <Button size="sm" style={{ marginTop: 11 }} onClick={() => navigate('/roster')}>
                        Request access
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
