import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, Button, Chip, Field, IconButton, Sheet, TextArea } from '@/components/ui'
import { useStore, currentMember } from '@/store/useStore'
import { useCan } from '@/domain/useCan'
import { channelMessages, groupRuns, lastMessage, unreadCount, visibleChannels } from '@/domain/chat'
import { isStaff } from '@/domain/permissions'
import { membersOf, subteamLabel } from '@/domain/subteams'
import type { Channel, Member } from '@/domain/types'
import { longStamp, today as todayIso } from '@/lib/date'

/**
 * 13 · Chat
 *
 * The team channel, the subteam channels, and whatever groups people make.
 *
 * Every team already has a chat — a group message nobody can search, that the
 * coach is not in, and that loses everything each September. This one sits
 * next to the calendar and the build log it keeps referring to, and it goes
 * through the same outbox as everything else, so a message typed somewhere with
 * no signal sends itself later rather than being lost.
 *
 * Subteam membership is derived from the roster rather than maintained by
 * hand: a student moving from mechanical to software should not need anybody
 * to remember to move them between two rooms.
 */
export function ChatScreen() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const season = useStore((s) => s.season)
  const session = useStore((s) => s.session)
  const me = useStore(currentMember)
  const ensureChannels = useStore((s) => s.ensureChannels)
  const ready = useStore((s) => s.ready)
  const allow = useCan()

  const [composing, setComposing] = useState(false)

  /*
   * Only once the season is loaded. Creating channels against the empty season
   * that exists before hydration writes them to disk and then has them wiped
   * from memory when the real season lands — they reappear on the next reload,
   * which is a confusing way to find out about a race.
   */
  useEffect(() => {
    if (ready) ensureChannels()
  }, [ready, ensureChannels])

  const channels = useMemo(() => {
    const visible = visibleChannels(season, me)
    const order = { team: 0, subteam: 1, group: 2 }
    return visible.sort(
      (a, b) =>
        order[a.kind] - order[b.kind] ||
        (lastMessage(season, b.id)?.sentAt ?? '').localeCompare(lastMessage(season, a.id)?.sentAt ?? '') ||
        a.name.localeCompare(b.name),
    )
  }, [season, me])

  const active = channels.find((c) => c.id === channelId) ?? channels[0]

  if (!me || me.status !== 'active') {
    return (
      <div className="screen">
        <div className="section" style={{ paddingTop: 10 }}>
          <h1 className="h1">Chat</h1>
          <p className="lede" style={{ marginTop: 4 }}>
            Chat is for people on the team. A coach adds you from the roster.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <div className="section-head" style={{ padding: 0 }}>
          <div>
            <h1 className="h1">Chat</h1>
            <p className="lede" style={{ marginTop: 4 }}>
              Goes through the same queue as everything else, so a message typed with no signal sends
              itself later.
            </p>
          </div>
          {allow('chat.manageChannels') && (
            <Button size="sm" onClick={() => setComposing(true)}>
              New group
            </Button>
          )}
        </div>
      </div>

      <div className="chat-layout">
        <div className="chat-list">
          {channels.map((channel) => {
            const unread = unreadCount(season, session, channel.id)
            const preview = lastMessage(season, channel.id)
            return (
              <button
                key={channel.id}
                type="button"
                className={`chat-channel${channel.id === active?.id ? ' is-active' : ''}`}
                onClick={() => navigate(`/chat/${channel.id}`)}
              >
                <span className="chat-channel-top">
                  <span className="chat-channel-name">{channelLabel(channel)}</span>
                  {unread > 0 && <span className="chat-badge">{unread > 99 ? '99+' : unread}</span>}
                </span>
                <span className="chat-channel-preview">
                  {preview ? `${preview.authorName}: ${preview.body}` : (channel.topic ?? 'No messages yet')}
                </span>
              </button>
            )
          })}
        </div>

        {active ? (
          <Thread key={active.id} channel={active} me={me} />
        ) : (
          <div className="card-dashed" style={{ padding: 24, textAlign: 'center' }}>
            <span className="meta">No channels yet.</span>
          </div>
        )}
      </div>

      {composing && <NewGroupSheet onClose={() => setComposing(false)} />}
    </div>
  )
}

function channelLabel(channel: Channel): string {
  if (channel.kind === 'team') return channel.name
  if (channel.kind === 'subteam') return `# ${channel.name}`
  return channel.staffOnly ? `${channel.name} · staff` : channel.name
}

// ── one channel ─────────────────────────────────────────────

function Thread({ channel, me }: { channel: Channel; me: Member }) {
  const season = useStore((s) => s.season)
  const sendMessage = useStore((s) => s.sendMessage)
  const removeMessage = useStore((s) => s.removeMessage)
  const markChannelRead = useStore((s) => s.markChannelRead)
  const online = useStore((s) => s.online)
  const allow = useCan()

  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const messages = useMemo(() => channelMessages(season, channel.id), [season, channel.id])
  const runs = useMemo(() => groupRuns(messages), [messages])

  // Opening a channel marks it read; the effect re-runs as messages arrive so a
  // channel you are sitting in does not accumulate a badge.
  useEffect(() => {
    markChannelRead(channel.id)
  }, [channel.id, messages.length, markChannelRead])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, channel.id])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    sendMessage(channel.id, draft)
    setDraft('')
  }

  const members =
    channel.kind === 'group'
      ? season.members.filter((m) => channel.memberIds?.includes(m.id))
      : channel.kind === 'subteam'
        ? membersOf(season, channel.subteam ?? '')
        : season.members.filter((m) => m.status === 'active')

  return (
    <div className="chat-thread">
      <div className="chat-thread-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '500 13.5px var(--font-sans)', color: 'var(--ink)' }}>
            {channelLabel(channel)}
          </div>
          <div className="meta">
            {members.length} {members.length === 1 ? 'person' : 'people'}
            {channel.topic ? ` · ${channel.topic}` : ''}
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {runs.length === 0 && (
          <p className="meta pretty" style={{ padding: '20px 4px', textAlign: 'center' }}>
            Nothing here yet. {channel.kind === 'team' ? 'This one reaches the whole team.' : ''}
          </p>
        )}
        {runs.map((run) => {
          const first = run[0]
          const mine = first.authorId === me.id
          return (
            <div key={first.id} className={`chat-run${mine ? ' is-mine' : ''}`}>
              {!mine && <Avatar name={first.authorName} size="sm" />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="chat-run-head">
                  <span className="chat-author">{mine ? 'You' : first.authorName}</span>
                  <span className="meta-mono">{stamp(first.sentAt)}</span>
                </div>
                {run.map((message) => (
                  <div key={message.id} className="chat-bubble">
                    <span>{message.body}</span>
                    {(mine || allow('chat.moderate')) && (
                      <IconButton
                        label={`Delete message from ${message.authorName}`}
                        small
                        className="chat-delete"
                        onClick={() => removeMessage(message.id)}
                      >
                        ×
                      </IconButton>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {allow('chat.post') ? (
        <form onSubmit={submit} className="chat-compose">
          <input
            className="field"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${channelLabel(channel)}`}
            aria-label={`Message ${channelLabel(channel)}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit(e)
              }
            }}
          />
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      ) : (
        <p className="meta" style={{ padding: '10px 4px' }}>
          You can read this channel but not post in it.
        </p>
      )}

      {!online && (
        <p className="meta" style={{ padding: '0 4px 8px' }}>
          Offline — anything you send waits in the queue and goes when there is signal.
        </p>
      )}
    </div>
  )
}

/** Today shows a time; anything older needs the date to mean anything. */
function stamp(iso: string): string {
  const at = new Date(iso)
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const day = iso.slice(0, 10)
  return day === todayIso() ? time : `${longStamp(day)} · ${time}`
}

// ── new group ───────────────────────────────────────────────

function NewGroupSheet({ onClose }: { onClose: () => void }) {
  const season = useStore((s) => s.season)
  const createChannel = useStore((s) => s.createChannel)
  const notify = useStore((s) => s.notify)
  const navigate = useNavigate()
  const me = useStore(currentMember)

  const [name, setName] = useState('')
  const [topic, setTopic] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [staffOnly, setStaffOnly] = useState(false)

  const candidates = season.members.filter((m) => m.status === 'active' && m.id !== me?.id)

  return (
    <Sheet
      title="New group"
      subtitle="For the drive team, or the four people writing the notebook this week."
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          block
          disabled={!name.trim() || picked.length === 0}
          onClick={() => {
            const channel = createChannel({ name, memberIds: picked, topic, staffOnly })
            notify(`Created ${channel.name}`)
            onClose()
            navigate(`/chat/${channel.id}`)
          }}
        >
          Create
        </Button>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Drive team" />
        <TextArea
          label="What is it for"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Optional. Shows under the channel name."
        />
        <div>
          <span className="label" style={{ display: 'block', marginBottom: 7 }}>
            Who is in it · {picked.length + 1}
          </span>
          {candidates.length === 0 ? (
            <p className="meta">Nobody else on the roster yet.</p>
          ) : (
            <div className="wrap">
              {candidates.map((m) => (
                <Chip
                  key={m.id}
                  active={picked.includes(m.id)}
                  onClick={() => setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                >
                  {m.name}
                  {m.subteams?.length ? ` · ${m.subteams.map((id) => subteamLabel(season, id)).join(', ')}` : ''}
                </Chip>
              ))}
            </div>
          )}
          <p className="field-note">You are always in a group you create.</p>
        </div>

        {me && isStaff(me.role) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span className="lede">
              Staff only
              <span className="meta" style={{ display: 'block' }}>
                Hidden from students even if they are added. For coach coordination.
              </span>
            </span>
            <Chip active={staffOnly} onClick={() => setStaffOnly((v) => !v)}>
              {staffOnly ? 'On' : 'Off'}
            </Chip>
          </div>
        )}
      </div>
    </Sheet>
  )
}
