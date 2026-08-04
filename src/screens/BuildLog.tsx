import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Chip, EmptyState, Field, Meter, Sheet, TextArea } from '@/components/ui'
import { MediaThumb } from '@/components/MediaThumb'
import { useStore, currentMember } from '@/store/useStore'
import { can } from '@/domain/permissions'
import { importFile, storageEstimate, blobUrl } from '@/lib/media'
import { isSupabaseConfigured } from '@/lib/supabase'
import { bytes } from '@/lib/format'
import { longStamp, today as todayIso } from '@/lib/date'
import type { MediaItem, MediaKind } from '@/domain/types'

const FILTERS: { id: MediaKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'photo', label: 'Photos' },
  { id: 'video', label: 'Video' },
  { id: 'cad', label: 'CAD' },
  { id: 'match', label: 'Match' },
]

/**
 * 08 · Build log
 *
 * Where robot photos, video and CAD live — and stay. Grouped by build day, kept
 * past June.
 *
 * Uploads are real: files go into IndexedDB as blobs with a generated thumbnail.
 * When offline they are marked queued and shown in a calm grey progress row,
 * never an error.
 */
export function BuildLogScreen() {
  const season = useStore((s) => s.season)
  const role = useStore((s) => s.session.role)
  const me = useStore(currentMember)
  const online = useStore((s) => s.online)
  const addMedia = useStore((s) => s.addMedia)
  const updateMedia = useStore((s) => s.updateMedia)
  const removeMedia = useStore((s) => s.removeMedia)
  const notify = useStore((s) => s.notify)

  const fileRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<MediaKind | 'all'>('all')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<MediaItem | null>(null)
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null)

  const offline = !online || season.settings.simulateOffline

  useEffect(() => {
    void storageEstimate().then(setEstimate)
  }, [season.media.length])

  const visible = useMemo(
    () => season.media.filter((m) => filter === 'all' || m.kind === filter),
    [season.media, filter],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, MediaItem[]>()
    for (const item of visible) {
      const list = map.get(item.day) ?? []
      list.push(item)
      map.set(item.day, list)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [visible])

  const usedBytes = season.media.reduce((sum, m) => sum + m.size, 0)
  const quotaBytes = season.team.storageQuotaGb * 1024 ** 3
  const byKind = (kind: MediaKind) =>
    season.media.filter((m) => m.kind === kind).reduce((sum, m) => sum + m.size, 0)
  const queued = season.media.filter((m) => m.queued)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    let added = 0
    for (const file of Array.from(files)) {
      try {
        const imported = await importFile(file)
        addMedia({
          kind: imported.kind,
          name: imported.name,
          caption: '',
          author: me?.name ?? 'Unknown',
          day: todayIso(),
          size: imported.size,
          durationSec: imported.durationSec,
          tags: [],
          blobKey: imported.blobKey,
          thumbKey: imported.thumbKey,
          mimeType: imported.mimeType,
          // "Queued" means waiting to reach the cloud. With no project
          // configured there is nowhere for it to go, so the file is simply
          // stored — claiming otherwise would be a lie the user can't resolve.
          queued: offline && isSupabaseConfigured(),
        })
        added++
      } catch {
        notify(`Could not read ${file.name}`, 'warn')
      }
    }
    setBusy(false)
    if (added) {
      notify(
        offline && isSupabaseConfigured()
          ? `${added} queued — will upload on Wi-Fi`
          : `${added} added to the build log`,
      )
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="screen">
      <div className="section" style={{ paddingTop: 10 }}>
        <h1 className="h1">Build log</h1>
        <p className="lede" style={{ marginTop: 4 }}>
          Photos, video and CAD, kept past June.
        </p>
      </div>

      <div className="cols cols-2">
        <div>
          {/* ── storage ──────────────────────────────────── */}
          <div className="section">
            <div className="card card-pad" style={{ padding: '14px 15px' }}>
              <div className="section-head" style={{ marginBottom: 9 }}>
                <span className="label">Team storage</span>
                <span className="num" style={{ font: '500 12px var(--font-mono)', color: 'var(--ink-2)' }}>
                  {bytes(usedBytes)} / {season.team.storageQuotaGb} GB
                </span>
              </div>
              <Meter
                small
                label="Storage by media type"
                segments={[
                  { value: byKind('video'), of: quotaBytes },
                  { value: byKind('photo'), of: quotaBytes, tone: 'dim' },
                  { value: byKind('cad') + byKind('match'), of: quotaBytes, tone: 'pressure' },
                ]}
              />
              <div style={{ display: 'flex', gap: 14, marginTop: 9, flexWrap: 'wrap' }}>
                <span className="meta">Video {bytes(byKind('video'))}</span>
                <span className="meta">Photos {bytes(byKind('photo'))}</span>
                <span className="meta">CAD {bytes(byKind('cad'))}</span>
              </div>
              {estimate && estimate.quota > 0 && (
                <div className="meta" style={{ marginTop: 8, color: 'var(--ink-rail)' }}>
                  This browser has allowed {bytes(estimate.quota)} on this device; {bytes(estimate.usage)} used.
                </div>
              )}

              {can(role, 'media.upload') && (
                <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,.step,.stp,.stl,.f3d,.sldprt,.dxf,.dwg"
                    style={{ display: 'none' }}
                    onChange={(e) => void onFiles(e.target.files)}
                  />
                  <Button variant="primary" block disabled={busy} onClick={() => fileRef.current?.click()}>
                    {busy ? 'Reading…' : 'Upload'}
                  </Button>
                  <Button
                    block
                    disabled={busy}
                    onClick={() => {
                      if (fileRef.current) {
                        fileRef.current.setAttribute('capture', 'environment')
                        fileRef.current.click()
                        fileRef.current.removeAttribute('capture')
                      }
                    }}
                  >
                    Camera
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ── offline queue ────────────────────────────── */}
          {queued.length > 0 && (
            <div className="section">
              <div style={{ borderRadius: 16, background: 'var(--srf-inset)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ font: '500 11.5px var(--font-sans)', color: 'var(--ink-2)' }}>
                    {queued.length} {queued.length === 1 ? 'clip' : 'clips'} queued — will upload on Wi-Fi
                  </span>
                  <span className="num" style={{ font: '500 10.5px var(--font-mono)', color: 'var(--ink-3)' }}>
                    {bytes(queued.reduce((sum, m) => sum + m.size, 0))}
                  </span>
                </div>
                <div
                  style={{
                    height: 3,
                    borderRadius: 2,
                    background: '#242b2e',
                    marginTop: 9,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '30%',
                      background: 'var(--ink-5)',
                      animation: 'sweep 2.2s linear infinite',
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="section">
            <div className="wrap">
              {FILTERS.map((f) => (
                <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </Chip>
              ))}
            </div>
          </div>

          {byDay.length === 0 ? (
            <div className="section">
              <EmptyState
                title="Nothing in the log yet"
                body="One photo per build day is enough. It is what the notebook and the weekly dashboard both pull from."
                action={
                  can(role, 'media.upload') ? { label: 'Add the first photo', onClick: () => fileRef.current?.click() } : undefined
                }
              />
            </div>
          ) : (
            byDay.map(([day, items]) => (
              <div key={day} className="section">
                <div className="label" style={{ marginBottom: 9 }}>
                  {longStamp(day)} · {items.length}
                </div>
                <div className="grid-3" style={{ gap: 6 }}>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelected(item)}
                      style={{
                        borderRadius: 9,
                        border: '1px solid var(--line)',
                        overflow: 'hidden',
                        display: 'block',
                        width: '100%',
                      }}
                      aria-label={`Open ${item.name}`}
                    >
                      <MediaThumb item={item} square />
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}

          <div className="section">
            <div
              className="card-quiet"
              style={{ padding: '13px 15px', display: 'flex', gap: 12, alignItems: 'center', borderRadius: 16 }}
            >
              <div className="meta pretty" style={{ flex: 1 }}>
                Season archives lock at kickoff each year — that is the mechanism against losing everything
                each June.
              </div>
              <Button size="sm" disabled title="Previous seasons appear here once one has been archived">
                {Number(season.team.season) - 1}–{String(Number(season.team.season)).slice(2)}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/*
       * Detail pane rather than a lightbox, so on desktop you can keep scrolling
       * the grid behind it.
       */}
      {selected && (
        <MediaDetail
          item={selected}
          canDelete={can(role, 'media.delete')}
          onClose={() => setSelected(null)}
          onSave={(patch) => {
            updateMedia(selected.id, patch)
            setSelected({ ...selected, ...patch })
          }}
          onDelete={async () => {
            await removeMedia(selected.id)
            setSelected(null)
            notify('Removed from the build log')
          }}
        />
      )}
    </div>
  )
}

function MediaDetail({
  item,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: {
  item: MediaItem
  canDelete: boolean
  onClose: () => void
  onSave: (patch: Partial<MediaItem>) => void
  onDelete: () => Promise<void>
}) {
  const [caption, setCaption] = useState(item.caption)
  const [name, setName] = useState(item.name)
  const [fullUrl, setFullUrl] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void blobUrl(item.blobKey).then((u) => live && setFullUrl(u))
    return () => {
      live = false
    }
  }, [item.blobKey])

  return (
    <Sheet
      title={item.name}
      subtitle={`${item.kind} · ${bytes(item.size)} · ${longStamp(item.day)}`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 9 }}>
          <Button
            variant="primary"
            block
            onClick={() => {
              onSave({ caption, name })
              onClose()
            }}
          >
            Save
          </Button>
          {canDelete && (
            <Button variant="danger" onClick={() => void onDelete()}>
              Delete
            </Button>
          )}
        </div>
      }
    >
      <div className="card" style={{ overflow: 'hidden', marginBottom: 14 }}>
        {item.kind === 'video' && fullUrl ? (
          <video src={fullUrl} controls playsInline style={{ width: '100%', maxHeight: 320, background: '#000' }} />
        ) : fullUrl && item.kind === 'photo' ? (
          <img src={fullUrl} alt={item.caption || item.name} style={{ width: '100%', maxHeight: 360, objectFit: 'contain', background: '#000' }} />
        ) : (
          <MediaThumb item={item} height={200} />
        )}
      </div>

      <div className="stack" style={{ gap: 11 }}>
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextArea
          label="Caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="What is it, and what changed?"
          hint="Captions appear in the weekly dashboard, in a solid plate under the image."
        />
        <div className="meta-mono">Added by {item.author}</div>
      </div>
    </Sheet>
  )
}
