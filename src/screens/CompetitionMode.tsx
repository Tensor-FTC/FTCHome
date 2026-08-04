import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/store/useStore'
import { clock } from '@/lib/format'
import type { Match } from '@/domain/types'

type Tab = 'match' | 'rank' | 'sched'

/**
 * 10 · Competition Mode
 *
 * Abandons the design system on purpose: pure black, no borders, no elevation,
 * 92px clock, solid alliance banner. At three metres in gym lighting, contrast
 * beats identity — and the identity has done its job by the time you are here.
 *
 * Only four facts survive: time, field, our number, who we are with and against.
 * Exit is a 78px bar at the bottom, reachable with a thumb while holding a
 * driver hub.
 */
export function CompetitionModeScreen() {
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const tick = useStore((s) => s.tickMatchClock)

  const [tab, setTab] = useState<Tab>('match')
  const [teamFilter, setTeamFilter] = useState<string | null>(null)

  const settings = season.settings
  const comp = season.competition
  const us = season.team.number
  const alliance = settings.alliance === 'red' ? 'RED' : 'BLUE'

  // Comp Mode is often the only screen open, so it drives the clock itself.
  useEffect(() => {
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [tick])

  // A pit board should not sleep mid-match.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    void navigator.wakeLock
      ?.request('screen')
      .then((l) => {
        lock = l
      })
      .catch(() => {
        /* Denied or unsupported — the clock still runs, the screen may just dim. */
      })
    return () => void lock?.release().catch(() => {})
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') navigate('/live')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navigate])

  const matches = useMemo(
    () => (teamFilter ? comp.matches.filter((m) => [...m.red, ...m.blue].includes(teamFilter)) : comp.matches),
    [comp.matches, teamFilter],
  )

  const hasUpcoming = Boolean(settings.matchLabel) && comp.matches.some((m) => !m.played)
  const ourRank = comp.rankings.find((r) => r.teamNumber === us)

  return (
    <div className="comp" data-alliance={settings.alliance}>
      <div className="comp-banner">{alliance} ALLIANCE</div>

      <div className="comp-tabs" role="tablist" aria-label="Competition mode">
        {(
          [
            ['match', 'MATCH'],
            ['rank', 'RANKINGS'],
            ['sched', 'SCHEDULE'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="comp-tab"
            onClick={() => {
              setTab(id)
              if (id !== 'sched') setTeamFilter(null)
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'match' &&
        (hasUpcoming ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 22px',
              gap: 26,
              minHeight: 0,
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  font: '700 13px var(--font-mono)',
                  color: '#8A8A8A',
                  letterSpacing: '0.3em',
                  marginBottom: 10,
                }}
              >
                MATCH {settings.matchLabel} · FIELD {settings.matchField}
              </div>
              <div className="comp-clock num" role="timer" aria-live="off">
                {clock(settings.matchSeconds)}
              </div>
              <div
                style={{ font: '700 14px var(--font-mono)', color: '#fff', letterSpacing: '0.26em', marginTop: 12 }}
              >
                {settings.matchSeconds < 40 ? 'GET TO THE FIELD' : 'QUEUE WHEN CALLED'}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <CompRow number={us} caption="US" background="var(--alliance)" height={74} size={30} />
              {settings.partner && (
                <CompRow
                  number={settings.partner}
                  caption="PARTNER"
                  background="var(--alliance-deep)"
                  height={60}
                  size={30}
                />
              )}
              {settings.opponents.length > 0 && (
                <CompRow
                  number={settings.opponents.join(' · ')}
                  caption="OPP"
                  background="#151515"
                  border="2px solid #333"
                  height={60}
                  size={26}
                  muted
                />
              )}
            </div>
          </div>
        ) : (
          /*
           * No match queued. Rather than a blank clock and empty alliance rows,
           * the board becomes a standings card — which is what a pit display is
           * for once the schedule is done.
           */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '0 22px',
              gap: 18,
              minHeight: 0,
              textAlign: 'center',
            }}
          >
            <div style={{ font: '700 13px var(--font-mono)', color: '#8A8A8A', letterSpacing: '0.3em' }}>
              {comp.finished ? 'EVENT COMPLETE' : 'NO MATCH QUEUED'}
            </div>
            <div className="num" style={{ font: '700 96px/0.9 var(--font-mono)', color: '#fff' }}>
              {ourRank ? `#${ourRank.rank}` : us}
            </div>
            {ourRank && (
              <div style={{ font: '700 20px var(--font-mono)', color: '#BFBFBF', letterSpacing: '0.1em' }}>
                {ourRank.wins}-{ourRank.losses}-{ourRank.ties} · OPR {ourRank.opr.toFixed(1)}
              </div>
            )}
            <div style={{ font: '500 14px var(--font-sans)', color: '#8A8A8A', maxWidth: 520 }}>
              {comp.name}
            </div>
          </div>
        ))}

      {tab === 'rank' && (
        <div className="scr" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div
            style={{
              display: 'flex',
              padding: '12px 16px',
              borderBottom: '2px solid #222',
              font: '700 11px var(--font-mono)',
              color: '#8A8A8A',
              letterSpacing: '0.16em',
              position: 'sticky',
              top: 0,
              background: '#000',
            }}
          >
            <span style={{ width: 38 }}>#</span>
            <span style={{ flex: 1 }}>TEAM</span>
            <span style={{ width: 62, textAlign: 'right' }}>W-L-T</span>
            <span style={{ width: 56, textAlign: 'right' }}>OPR</span>
          </div>
          {comp.rankings.map((row) => {
            const ours = row.teamNumber === us
            return (
              <button
                key={row.teamNumber}
                type="button"
                onClick={() => {
                  setTeamFilter(row.teamNumber)
                  setTab('sched')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '13px 16px',
                  borderBottom: '1px solid #1C1C1C',
                  background: ours ? '#121212' : '#000',
                  textAlign: 'left',
                }}
              >
                <span
                  className="num"
                  style={{ width: 38, font: '700 22px var(--font-mono)', color: ours ? 'var(--signal)' : '#8A8A8A' }}
                >
                  {row.rank}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="num"
                    style={{ display: 'block', font: '700 22px/1.15 var(--font-mono)', color: ours ? 'var(--signal)' : '#fff' }}
                  >
                    {row.teamNumber}
                  </span>
                  <span style={{ display: 'block', font: '500 12px/1.4 var(--font-sans)', color: '#8A8A8A' }}>
                    {row.teamName}
                  </span>
                </span>
                <span
                  className="num"
                  style={{ width: 62, textAlign: 'right', font: '700 18px var(--font-mono)', color: '#fff' }}
                >
                  {row.wins}-{row.losses}-{row.ties}
                </span>
                <span
                  className="num"
                  style={{ width: 56, textAlign: 'right', font: '700 18px var(--font-mono)', color: '#BFBFBF' }}
                >
                  {row.opr.toFixed(1)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {tab === 'sched' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderBottom: '2px solid #222',
              flex: 'none',
            }}
          >
            {teamFilter && (
              <button
                type="button"
                onClick={() => setTeamFilter(null)}
                style={{
                  height: 38,
                  padding: '0 13px',
                  border: '2px solid #444',
                  borderRadius: 5,
                  background: '#000',
                  color: '#fff',
                  font: '700 12px var(--font-mono)',
                  letterSpacing: '0.1em',
                }}
              >
                ← ALL
              </button>
            )}
            <span style={{ font: '700 12px var(--font-mono)', color: '#8A8A8A', letterSpacing: '0.18em' }}>
              {teamFilter ? `TEAM ${teamFilter} · ${matches.length} MATCHES` : `${matches.length} MATCHES`}
            </span>
          </div>
          <div className="scr" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {matches.map((match) => (
              <ScheduleRow key={match.id} match={match} us={us} filter={teamFilter} />
            ))}
          </div>
        </div>
      )}

      <button type="button" className="comp-exit" onClick={() => navigate('/live')}>
        EXIT
      </button>
    </div>
  )
}

function CompRow({
  number,
  caption,
  background,
  border,
  height,
  size,
  muted,
}: {
  number: string
  caption: string
  background: string
  border?: string
  height: number
  size: number
  muted?: boolean
}) {
  return (
    <div
      style={{
        background,
        border,
        borderRadius: 6,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
      }}
    >
      <span className="num" style={{ font: `700 ${size}px var(--font-mono)`, color: muted ? '#BFBFBF' : '#fff' }}>
        {number}
      </span>
      <span
        style={{ font: '700 13px var(--font-mono)', color: muted ? '#8A8A8A' : '#fff', letterSpacing: '0.16em' }}
      >
        {caption}
      </span>
    </div>
  )
}

function ScheduleRow({ match, us, filter }: { match: Match; us: string; filter: string | null }) {
  const highlight = (teams: string[]) => teams.includes(us) || (filter ? teams.includes(filter) : false)
  const cell = (teams: string[], isRed: boolean) => (
    <span
      className="num"
      style={{
        font: '700 15px var(--font-mono)',
        padding: '3px 7px',
        borderRadius: 4,
        color: '#fff',
        background: isRed
          ? highlight(teams)
            ? '#E23B2E'
            : '#4A1712'
          : highlight(teams)
            ? '#2F6BFF'
            : '#13224A',
      }}
    >
      {teams.join(' · ')}
    </span>
  )

  const live = !match.played && match.onDeck
  const result = live ? 'ON DECK' : match.played ? `${match.redScore}–${match.blueScore}` : '—'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '12px 16px',
        borderBottom: '1px solid #1C1C1C',
        background: live ? '#121212' : '#000',
      }}
    >
      <span className="num" style={{ width: 52, flex: 'none', font: '700 17px var(--font-mono)', color: '#fff' }}>
        {match.label}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
        {cell(match.red, true)}
        {cell(match.blue, false)}
      </span>
      <span style={{ width: 82, flex: 'none', textAlign: 'right' }}>
        <span
          className="num"
          style={{ display: 'block', font: '700 14px var(--font-mono)', color: live ? 'var(--signal)' : match.played ? '#fff' : '#8A8A8A' }}
        >
          {result}
        </span>
        <span
          style={{ display: 'block', font: '500 10.5px/1.5 var(--font-mono)', color: '#6A6A6A', letterSpacing: '0.1em' }}
        >
          F{match.field} · {match.time}
        </span>
      </span>
    </div>
  )
}
