import { useState, useEffect, useRef } from 'react'
import { useEgcaSyncStatus, EgcaSyncError } from '../hooks/useEgcaSyncStatus'

// ── Theme (matches audit portal amber HUD) ─────────────────────────────────
const T = {
  bg:         '#0B0700',
  surface:    '#0A120E',
  border:     '#1A3020',
  primary:    '#FFB300',
  primaryDim: '#FFB30080',
  text:       '#FFE8A0',
  red:        '#FF3333',
  muted:      '#6A6040',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatAgo(ms: number | null): string {
  if (ms === null) return 'never'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60)   return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)   return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)     return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  } catch {
    return iso
  }
}

// ── Badge status config ──────────────────────────────────────────────────────

function getBadgeConfig(status: string | undefined, agoMs: number | null) {
  if (!status || status === 'NEVER_SYNCED') {
    return { label: 'eGCA NO SYNC', colour: T.red, bgAlpha: '20' }
  }
  if (status === 'SYNCED') {
    return { label: 'eGCA SYNCED', colour: T.primary, bgAlpha: '20' }
  }
  if (status === 'STALE') {
    const agoLabel = agoMs ? formatAgo(agoMs) : '?'
    return { label: `eGCA SYNC: ${agoLabel}`, colour: T.primaryDim, bgAlpha: '10' }
  }
  // OUT_OF_SYNC
  return { label: 'eGCA OUT OF SYNC', colour: T.red, bgAlpha: '20' }
}

// ── Slide-out Panel ──────────────────────────────────────────────────────────

function SyncPanel({
  open,
  onClose,
  lastSyncTimestamp,
  permissionsSynced24h,
  pasDownloaded24h,
  syncEventsLast24h,
  errors,
  status,
  canForceSync,
  onForceSync,
  forceSyncing,
}: {
  open: boolean
  onClose: () => void
  lastSyncTimestamp: string | null
  permissionsSynced24h: number
  pasDownloaded24h: number
  syncEventsLast24h: number
  errors: EgcaSyncError[]
  status: string
  canForceSync: boolean
  onForceSync: () => void
  forceSyncing: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid the click that opened the panel from closing it
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [open, onClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const statusColour = status === 'SYNCED' ? T.primary
    : status === 'STALE' ? T.primaryDim
    : T.red

  return (
    <>
      {/* Backdrop overlay */}
      {open && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 9998,
        }} />
      )}

      {/* Slide-out panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          left: open ? '0' : '-360px',
          top: 0,
          bottom: 0,
          width: '340px',
          background: T.bg,
          borderRight: `1px solid ${T.border}`,
          zIndex: 9999,
          transition: 'left 0.25s ease',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'JetBrains Mono', monospace",
          boxShadow: open ? '4px 0 24px rgba(255,179,0,0.08)' : 'none',
        }}
      >
        {/* Panel header */}
        <div style={{
          padding: '1rem',
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{
            color: T.primary,
            fontWeight: 700,
            fontSize: '0.85rem',
            letterSpacing: '0.06em',
          }}>
            eGCA SYNC STATUS
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: `1px solid ${T.border}`,
              borderRadius: '4px',
              color: T.muted,
              cursor: 'pointer',
              padding: '0.2rem 0.5rem',
              fontSize: '0.75rem',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>

          {/* Overall status badge */}
          <div style={{
            padding: '0.6rem 0.75rem',
            background: statusColour + '15',
            border: `1px solid ${statusColour}40`,
            borderRadius: '6px',
            marginBottom: '1rem',
            textAlign: 'center',
          }}>
            <span style={{
              color: statusColour,
              fontWeight: 700,
              fontSize: '0.85rem',
              letterSpacing: '0.04em',
            }}>
              {status === 'SYNCED' ? 'SYNCED'
                : status === 'STALE' ? 'STALE'
                : status === 'OUT_OF_SYNC' ? 'OUT OF SYNC'
                : 'NEVER SYNCED'}
            </span>
          </div>

          {/* Last sync timestamp */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: T.muted, fontSize: '0.7rem', marginBottom: '0.25rem', letterSpacing: '0.04em' }}>
              LAST SYNC
            </div>
            <div style={{ color: T.text, fontSize: '0.8rem' }}>
              {formatTimestamp(lastSyncTimestamp)}
            </div>
          </div>

          {/* Stats grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
            marginBottom: '1rem',
          }}>
            <StatCard label="Permissions (24h)" value={permissionsSynced24h} />
            <StatCard label="PAs Downloaded" value={pasDownloaded24h} />
            <StatCard label="Sync Events (24h)" value={syncEventsLast24h} />
            <StatCard label="Errors (24h)" value={errors.length} valueColour={errors.length > 0 ? T.red : undefined} />
          </div>

          {/* Errors section */}
          {errors.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ color: T.red, fontSize: '0.7rem', marginBottom: '0.5rem', letterSpacing: '0.04em', fontWeight: 600 }}>
                SYNC ERRORS
              </div>
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}>
                {errors.map((err, i) => (
                  <div key={i} style={{
                    background: T.red + '10',
                    border: `1px solid ${T.red}30`,
                    borderRadius: '4px',
                    padding: '0.5rem 0.6rem',
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: '0.2rem',
                    }}>
                      <span style={{ color: T.red, fontWeight: 600, fontSize: '0.72rem' }}>
                        {err.errorCode}
                      </span>
                      <span style={{ color: T.muted, fontSize: '0.65rem' }}>
                        {formatTimestamp(err.timestamp)}
                      </span>
                    </div>
                    <div style={{ color: T.text, fontSize: '0.7rem', opacity: 0.8 }}>
                      {err.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No errors */}
          {errors.length === 0 && (
            <div style={{
              color: T.muted,
              fontSize: '0.75rem',
              marginBottom: '1rem',
              fontStyle: 'italic',
            }}>
              No sync errors in the last 24 hours.
            </div>
          )}
        </div>

        {/* Force sync button — footer */}
        {canForceSync && (
          <div style={{
            padding: '0.75rem 1rem',
            borderTop: `1px solid ${T.border}`,
          }}>
            <button
              onClick={onForceSync}
              disabled={forceSyncing}
              style={{
                width: '100%',
                padding: '0.6rem',
                background: forceSyncing ? T.border : T.primary + '20',
                border: `1px solid ${T.primary}40`,
                borderRadius: '6px',
                cursor: forceSyncing ? 'wait' : 'pointer',
                color: T.primary,
                fontWeight: 600,
                fontSize: '0.8rem',
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.03em',
              }}
            >
              {forceSyncing ? 'Syncing...' : 'Force Sync'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, valueColour }: { label: string; value: number; valueColour?: string }) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: '4px',
      padding: '0.5rem 0.6rem',
    }}>
      <div style={{ color: T.muted, fontSize: '0.6rem', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
        {label}
      </div>
      <div style={{
        color: valueColour ?? T.text,
        fontSize: '1rem',
        fontWeight: 700,
      }}>
        {value}
      </div>
    </div>
  )
}

// ── Main Badge Component ─────────────────────────────────────────────────────

export function EgcaSyncBadge({
  token,
  role,
  collapsed,
}: {
  token: string | null
  role: string | null
  collapsed: boolean
}) {
  const { data, forceSync } = useEgcaSyncStatus(token)
  const [panelOpen, setPanelOpen]     = useState(false)
  const [forceSyncing, setForceSyncing] = useState(false)

  // Recalculate agoMs live every 15 seconds for label freshness
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  const liveAgoMs = data?.lastSyncTimestamp
    ? nowTick - new Date(data.lastSyncTimestamp).getTime()
    : null

  const config = getBadgeConfig(data?.status, liveAgoMs)

  const canForceSync = role === 'PLATFORM_SUPER_ADMIN' || role === 'DGCA_AUDITOR'

  const handleForceSync = async () => {
    setForceSyncing(true)
    try {
      await forceSync()
    } finally {
      setForceSyncing(false)
    }
  }

  return (
    <>
      {/* Badge button */}
      <button
        onClick={() => setPanelOpen(true)}
        title={config.label}
        style={{
          width: '100%',
          padding: collapsed ? '0.35rem 0' : '0.35rem 0.5rem',
          background: config.colour + config.bgAlpha,
          border: `1px solid ${config.colour}40`,
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: '0.4rem',
          marginBottom: '0.4rem',
          transition: 'all 0.15s ease',
        }}
      >
        {/* Status dot */}
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: config.colour,
          flexShrink: 0,
          boxShadow: `0 0 6px ${config.colour}`,
        }} />

        {/* Label text */}
        {!collapsed && (
          <span style={{
            color: config.colour,
            fontSize: '0.65rem',
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.03em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {config.label}
          </span>
        )}
      </button>

      {/* Slide-out panel */}
      <SyncPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        lastSyncTimestamp={data?.lastSyncTimestamp ?? null}
        permissionsSynced24h={data?.permissionsSynced24h ?? 0}
        pasDownloaded24h={data?.pasDownloaded24h ?? 0}
        syncEventsLast24h={data?.syncEventsLast24h ?? 0}
        errors={data?.errors ?? []}
        status={data?.status ?? 'NEVER_SYNCED'}
        canForceSync={canForceSync}
        onForceSync={handleForceSync}
        forceSyncing={forceSyncing}
      />
    </>
  )
}
