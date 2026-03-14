import React, { useState, useEffect } from 'react'
import { T } from '../../theme'
import { userApi } from '../../api/client'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string
  type: 'SUBMITTED' | 'STATUS_CHANGED' | 'PA_DOWNLOADED' | 'SIGNATURE_VERIFIED'
       | 'LOG_UPLOADED' | 'EXPIRED' | 'ARCHIVED' | 'REJECTED' | 'APPROVED'
  timestamp: string
  actor: string
  details: string
}

interface Props {
  applicationId: string
  onClose: () => void
}

// ── Event styling ────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<string, { color: string; label: string }> = {
  SUBMITTED:          { color: T.primary, label: 'Application Submitted' },
  STATUS_CHANGED:     { color: T.amber,   label: 'Status Changed' },
  PA_DOWNLOADED:      { color: '#40C4AA', label: 'PA Downloaded' },
  SIGNATURE_VERIFIED: { color: '#22C55E', label: 'Signature Verified' },
  LOG_UPLOADED:       { color: '#8B5CF6', label: 'Flight Log Uploaded' },
  EXPIRED:            { color: '#6B7280', label: 'Permission Expired' },
  ARCHIVED:           { color: '#6B7280', label: 'Archived' },
  REJECTED:           { color: T.red,     label: 'Application Rejected' },
  APPROVED:           { color: '#22C55E', label: 'Application Approved' },
}

// ── Component ────────────────────────────────────────────────────────────────

export function PATimelineModal({ applicationId, onClose }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await userApi().get(`/drone/pa/${applicationId}/timeline`)
        if (!cancelled) setEvents(data.events ?? [])
      } catch (e: any) {
        if (!cancelled) setError(e.response?.data?.error ?? 'Failed to load timeline')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [applicationId])

  const fmtTimestamp = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    }) + ' ' + d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: '6px', width: '540px', maxWidth: '90vw',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1rem 1.2rem', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ color: T.textBright, fontSize: '0.9rem', margin: 0 }}>
              PA Lifecycle Timeline
            </h2>
            <span style={{
              color: T.muted, fontSize: '0.65rem', fontFamily: 'JetBrains Mono, monospace',
            }}>
              {applicationId}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: `1px solid ${T.border}`,
              color: T.muted, cursor: 'pointer', padding: '4px 10px',
              borderRadius: '3px', fontSize: '0.7rem', fontWeight: 600,
            }}
          >
            CLOSE
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.2rem' }}>
          {loading && (
            <p style={{ color: T.muted, fontSize: '0.75rem', textAlign: 'center' }}>
              Loading timeline...
            </p>
          )}

          {error && (
            <p style={{ color: T.red, fontSize: '0.75rem', textAlign: 'center' }}>
              {error}
            </p>
          )}

          {!loading && !error && events.length === 0 && (
            <p style={{ color: T.muted, fontSize: '0.75rem', textAlign: 'center' }}>
              No timeline events found.
            </p>
          )}

          {!loading && !error && events.length > 0 && (
            <div style={{ position: 'relative', paddingLeft: '28px' }}>
              {/* Vertical line */}
              <div style={{
                position: 'absolute', left: '8px', top: '8px',
                bottom: '8px', width: '2px',
                background: `linear-gradient(to bottom, ${T.primary}40, ${T.border})`,
              }} />

              {events.map((event, idx) => {
                const cfg = EVENT_CONFIG[event.type] ?? { color: T.muted, label: event.type }
                const isLast = idx === events.length - 1

                return (
                  <div
                    key={event.id}
                    style={{
                      position: 'relative',
                      marginBottom: isLast ? 0 : '1.2rem',
                      paddingBottom: isLast ? 0 : '0.4rem',
                    }}
                  >
                    {/* Dot */}
                    <div style={{
                      position: 'absolute', left: '-24px', top: '4px',
                      width: '12px', height: '12px', borderRadius: '50%',
                      background: cfg.color, border: `2px solid ${T.surface}`,
                      boxShadow: `0 0 0 2px ${cfg.color}40`,
                    }} />

                    {/* Event card */}
                    <div style={{
                      background: T.bg, border: `1px solid ${T.border}`,
                      borderRadius: '4px', padding: '0.6rem 0.8rem',
                      borderLeft: `3px solid ${cfg.color}`,
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: '0.3rem',
                      }}>
                        <span style={{
                          color: cfg.color, fontSize: '0.7rem', fontWeight: 700,
                        }}>
                          {cfg.label}
                        </span>
                        <span style={{
                          color: T.muted, fontSize: '0.6rem',
                          fontFamily: 'JetBrains Mono, monospace',
                        }}>
                          {fmtTimestamp(event.timestamp)}
                        </span>
                      </div>

                      <div style={{
                        color: T.text, fontSize: '0.7rem', marginBottom: '0.2rem',
                      }}>
                        {event.details}
                      </div>

                      <div style={{
                        color: T.muted, fontSize: '0.6rem', fontStyle: 'italic',
                      }}>
                        by {event.actor}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
