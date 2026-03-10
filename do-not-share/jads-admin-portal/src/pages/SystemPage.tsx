import React from 'react'
import { useAdminAuth } from '../hooks/useAdminAuth'
import { useEgcaStatus, HealthStatus, EgcaCallLogEntry } from '../hooks/useEgcaStatus'

// ── HUD Theme ────────────────────────────────────────────────────────────────
// Matches the AdminApp HUD theme specified in the prompt, aligned with
// existing admin panel colours from theme.ts.

const T = {
  bg:         '#020B04',
  surface:    '#071A0A',
  border:     '#1A3020',
  primary:    '#00FF5F',
  amber:      '#FFD600',
  red:        '#FF4444',
  muted:      '#4A7A5A',
  text:       '#b0c8b8',
  textBright: '#d0e8d8',
  mono:       "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const HEALTH_COLOUR: Record<HealthStatus, string> = {
  ONLINE:   T.primary,
  DEGRADED: T.amber,
  OFFLINE:  T.red,
}

const HEALTH_LABEL: Record<HealthStatus, string> = {
  ONLINE:   'ONLINE',
  DEGRADED: 'DEGRADED',
  OFFLINE:  'OFFLINE',
}

function formatCountdown(totalSeconds: number | null): string {
  if (totalSeconds == null) return '--:--'
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  } catch {
    return iso
  }
}

function callStatusColour(status: number): string {
  if (status >= 200 && status < 300) return T.primary
  if (status >= 400 && status < 500) return T.amber
  return T.red
}

// ── Corner Bracket Panel ─────────────────────────────────────────────────────
// Reusable panel component matching the admin HUD bracket styling.

function Panel({ title, children, style }: {
  title: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 0,
      position: 'relative',
      padding: '1.25rem 1.25rem 1rem 1.25rem',
      ...style,
    }}>
      {/* Corner brackets */}
      <span style={{
        position: 'absolute', top: 0, left: 0,
        width: 12, height: 12,
        borderTop: `2px solid ${T.primary}`,
        borderLeft: `2px solid ${T.primary}`,
      }} />
      <span style={{
        position: 'absolute', top: 0, right: 0,
        width: 12, height: 12,
        borderTop: `2px solid ${T.primary}`,
        borderRight: `2px solid ${T.primary}`,
      }} />
      <span style={{
        position: 'absolute', bottom: 0, left: 0,
        width: 12, height: 12,
        borderBottom: `2px solid ${T.primary}`,
        borderLeft: `2px solid ${T.primary}`,
      }} />
      <span style={{
        position: 'absolute', bottom: 0, right: 0,
        width: 12, height: 12,
        borderBottom: `2px solid ${T.primary}`,
        borderRight: `2px solid ${T.primary}`,
      }} />

      <div style={{
        fontSize: '0.65rem',
        fontFamily: T.mono,
        color: T.muted,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        marginBottom: '0.75rem',
      }}>
        [{title}]
      </div>
      {children}
    </div>
  )
}

// ── Status Dot ───────────────────────────────────────────────────────────────

function StatusDot({ colour, pulse }: { colour: string; pulse?: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 10, height: 10,
      borderRadius: '50%',
      background: colour,
      boxShadow: `0 0 6px ${colour}80`,
      marginRight: 8,
      animation: pulse ? 'egca-pulse 2s ease-in-out infinite' : undefined,
    }} />
  )
}

// ── Main Page Component ──────────────────────────────────────────────────────

export function SystemPage() {
  const { token } = useAdminAuth()
  const {
    data,
    loading,
    error,
    lastFetchedAt,
    reconnecting,
    reconnectError,
    fetch: refetch,
    reconnect,
    tokenCountdown,
  } = useEgcaStatus(token)

  return (
    <div style={{
      padding: '1.5rem',
      background: T.bg,
      minHeight: '100vh',
      fontFamily: T.mono,
    }}>
      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes egca-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <div>
          <h2 style={{ margin: 0, color: T.textBright, fontFamily: T.mono, fontSize: '1.1rem' }}>
            SYSTEM INTEGRATIONS
          </h2>
          <div style={{ fontSize: '0.7rem', color: T.muted, marginTop: '0.25rem' }}>
            External adapter status and diagnostics
          </div>
        </div>
        {lastFetchedAt && (
          <div style={{ fontSize: '0.65rem', color: T.muted, fontFamily: T.mono }}>
            Last poll: {lastFetchedAt.toLocaleTimeString('en-IN', { hour12: false })}
            {' | '}30s interval
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem', marginBottom: '1rem',
          background: T.red + '15', border: `1px solid ${T.red}40`,
          fontSize: '0.8rem', color: T.red, fontFamily: T.mono,
        }}>
          STATUS FETCH ERROR: {error}
          <button onClick={refetch} style={{
            marginLeft: '1rem', background: 'transparent', border: `1px solid ${T.red}`,
            color: T.red, cursor: 'pointer', padding: '2px 8px', fontSize: '0.7rem',
            fontFamily: T.mono,
          }}>
            RETRY
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div style={{ color: T.muted, fontSize: '0.85rem', fontFamily: T.mono }}>
          Polling eGCA adapter status...
        </div>
      )}

      {/* Main grid */}
      {data && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
        }}>

          {/* ── Panel 1: eGCA API Health ─────────────────────────────────── */}
          <Panel title="eGCA API Health">
            <div style={{
              display: 'flex', alignItems: 'center',
              fontSize: '1rem', fontWeight: 700,
              color: HEALTH_COLOUR[data.health.status],
              fontFamily: T.mono,
            }}>
              <StatusDot
                colour={HEALTH_COLOUR[data.health.status]}
                pulse={data.health.status === 'ONLINE'}
              />
              eGCA API: {HEALTH_LABEL[data.health.status]}
            </div>

            <div style={{
              marginTop: '0.75rem',
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem', fontSize: '0.75rem',
            }}>
              <div>
                <div style={{ color: T.muted, fontSize: '0.6rem', marginBottom: 2 }}>LATENCY</div>
                <div style={{
                  color: data.health.latencyMs < 2000 ? T.primary : data.health.latencyMs < 10000 ? T.amber : T.red,
                  fontFamily: T.mono, fontWeight: 600,
                }}>
                  {data.health.latencyMs}ms
                </div>
              </div>
              <div>
                <div style={{ color: T.muted, fontSize: '0.6rem', marginBottom: 2 }}>BASE URL</div>
                <div style={{
                  color: T.text, fontFamily: T.mono, fontSize: '0.65rem',
                  wordBreak: 'break-all',
                }}>
                  {data.adapter.baseUrl}
                </div>
              </div>
            </div>

            {data.health.error && (
              <div style={{
                marginTop: '0.5rem', padding: '0.4rem 0.6rem',
                background: T.red + '15', fontSize: '0.7rem',
                color: T.red, fontFamily: T.mono, wordBreak: 'break-all',
              }}>
                {data.health.error}
              </div>
            )}
          </Panel>

          {/* ── Panel 2: JWT Token Status ────────────────────────────────── */}
          <Panel title="JWT Token Status">
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
            }}>
              <StatusDot
                colour={
                  !data.token.hasToken ? T.red :
                  (tokenCountdown ?? 0) < 300 ? T.amber : T.primary
                }
                pulse={data.token.hasToken && (tokenCountdown ?? 0) >= 300}
              />
              <div>
                <div style={{
                  fontSize: '0.8rem', fontWeight: 600, fontFamily: T.mono,
                  color: data.token.hasToken ? T.primary : T.red,
                }}>
                  {data.token.hasToken ? 'TOKEN ACTIVE' : 'NO TOKEN'}
                </div>
              </div>
            </div>

            {data.token.hasToken && (
              <div style={{
                marginTop: '0.75rem',
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem', fontSize: '0.75rem',
              }}>
                <div>
                  <div style={{ color: T.muted, fontSize: '0.6rem', marginBottom: 2 }}>EXPIRES AT</div>
                  <div style={{ color: T.text, fontFamily: T.mono }}>
                    {data.token.expiresAt
                      ? new Date(data.token.expiresAt).toLocaleTimeString('en-IN', { hour12: false })
                      : '--'
                    }
                  </div>
                </div>
                <div>
                  <div style={{ color: T.muted, fontSize: '0.6rem', marginBottom: 2 }}>TIME REMAINING</div>
                  <div style={{
                    fontFamily: T.mono, fontWeight: 700, fontSize: '1.1rem',
                    color: (tokenCountdown ?? 0) < 300 ? T.amber :
                           (tokenCountdown ?? 0) < 60 ? T.red : T.primary,
                  }}>
                    {formatCountdown(tokenCountdown)}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          {/* ── Panel 3: Recent API Calls (full-width) ───────────────────── */}
          <Panel title="Recent eGCA API Calls" style={{ gridColumn: '1 / -1' }}>
            {data.recentCalls.length === 0 ? (
              <div style={{
                color: T.muted, fontSize: '0.75rem', fontFamily: T.mono,
                padding: '1rem 0', textAlign: 'center',
              }}>
                No recent eGCA API calls recorded
              </div>
            ) : (
              <div style={{
                fontFamily: T.mono,
                fontSize: '0.72rem',
                lineHeight: '1.8',
              }}>
                {/* Header row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 60px 1fr 80px 80px',
                  gap: '0.5rem',
                  color: T.muted,
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  borderBottom: `1px solid ${T.border}`,
                  paddingBottom: '0.35rem',
                  marginBottom: '0.35rem',
                }}>
                  <span>TIME</span>
                  <span>METHOD</span>
                  <span>PATH</span>
                  <span>STATUS</span>
                  <span>LATENCY</span>
                </div>

                {data.recentCalls.map((call: EgcaCallLogEntry, idx: number) => (
                  <div key={idx} style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 60px 1fr 80px 80px',
                    gap: '0.5rem',
                    padding: '0.15rem 0',
                    borderBottom: idx < data.recentCalls.length - 1
                      ? `1px solid ${T.border}50`
                      : undefined,
                  }}>
                    <span style={{ color: T.muted }}>{formatTimestamp(call.timestamp)}</span>
                    <span style={{ color: T.textBright }}>{call.method}</span>
                    <span style={{ color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {call.path}
                    </span>
                    <span style={{
                      color: callStatusColour(call.status), fontWeight: 600,
                    }}>
                      {call.status}
                      {call.error ? ' ERR' : ' OK'}
                    </span>
                    <span style={{ color: T.text }}>{call.latencyMs}ms</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ── Panel 4: Controls + Adapter Info ─────────────────────────── */}
          <Panel title="Adapter Controls">
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Force Reconnect button */}
              <button
                onClick={reconnect}
                disabled={reconnecting}
                style={{
                  background: 'transparent',
                  border: `1px solid ${T.primary}`,
                  color: T.primary,
                  padding: '0.5rem 1.25rem',
                  fontFamily: T.mono,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: reconnecting ? 'wait' : 'pointer',
                  opacity: reconnecting ? 0.5 : 1,
                  letterSpacing: '0.05em',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  if (!reconnecting) {
                    (e.target as HTMLButtonElement).style.background = T.primary + '20'
                  }
                }}
                onMouseLeave={e => {
                  (e.target as HTMLButtonElement).style.background = 'transparent'
                }}
              >
                {reconnecting ? 'RECONNECTING...' : 'FORCE RECONNECT'}
              </button>

              {/* Refresh status button */}
              <button
                onClick={refetch}
                disabled={loading}
                style={{
                  background: 'transparent',
                  border: `1px solid ${T.border}`,
                  color: T.muted,
                  padding: '0.5rem 1rem',
                  fontFamily: T.mono,
                  fontSize: '0.7rem',
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {loading ? 'POLLING...' : 'REFRESH NOW'}
              </button>
            </div>

            {reconnectError && (
              <div style={{
                marginTop: '0.5rem', padding: '0.4rem 0.6rem',
                background: T.red + '15', fontSize: '0.7rem',
                color: T.red, fontFamily: T.mono,
              }}>
                Reconnect failed: {reconnectError}
              </div>
            )}
          </Panel>

          {/* ── Panel 5: Adapter Version Badge ───────────────────────────── */}
          <Panel title="Adapter Info">
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem', fontSize: '0.75rem',
            }}>
              <div>
                <div style={{ color: T.muted, fontSize: '0.6rem', marginBottom: 2 }}>MODE</div>
                <div style={{
                  display: 'inline-block',
                  padding: '2px 10px',
                  border: `1px solid ${data.adapter.mode === 'LIVE' ? T.primary : T.amber}`,
                  color: data.adapter.mode === 'LIVE' ? T.primary : T.amber,
                  fontFamily: T.mono,
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                }}>
                  {data.adapter.mode}
                </div>
              </div>
              <div>
                <div style={{ color: T.muted, fontSize: '0.6rem', marginBottom: 2 }}>VERSION</div>
                <div style={{
                  display: 'inline-block',
                  padding: '2px 10px',
                  background: T.primary + '15',
                  border: `1px solid ${T.primary}40`,
                  color: T.primary,
                  fontFamily: T.mono,
                  fontWeight: 600,
                  fontSize: '0.7rem',
                }}>
                  v{data.adapter.version}
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
