// ── Alert Management Page ────────────────────────────────────────────────────
// PLATFORM_SUPER_ADMIN interface for managing notification alerts, broadcasts,
// and monitoring delivery status.
//
// Uses the dark green HUD theme (ZT) from theme.ts.
// Route: /alert-management
//
// Features:
//   1. Alert config table — 13 notification types with enable/email toggles
//   2. Broadcast message composer — send to all, by category, or by region
//   3. Delivery status table — notification delivery stats
//   4. "Upcoming Expiries" report with CSV export

import React, { useEffect, useState, useCallback } from 'react'
import { useAdminAuth, adminAxios } from '../../hooks/useAdminAuth'
import { ZT } from '../../theme'

// ── Types ────────────────────────────────────────────────────────────────────

interface AlertConfig {
  type:          string
  label:         string
  category:      string
  enabled:       boolean
  emailEnabled:  boolean
  thresholdDays: number | null
}

interface DeliveryStats {
  total:  number
  unread: number
  read:   number
  byType: Array<{ type: string; count: number }>
}

interface ExpiryRecord {
  userId:        string
  email:         string | null
  phone:         string | null
  licenseNumber: string | null
  expiryDate:    string | null
  daysRemaining: number | null
  role:          string
  accountStatus: string
}

// ── Utility ──────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  EXPIRY:     '#FFB800',
  PERMISSION: ZT.phosphor,
  COMPLIANCE: ZT.red,
  SYSTEM:     '#8B5CF6',
}

function formatType(type: string): string {
  return type.replace(/_/g, ' ')
}

// ── Component ────────────────────────────────────────────────────────────────

export function AlertManagementPage() {
  const { token } = useAdminAuth()
  const [activeTab, setActiveTab] = useState<'configs' | 'broadcast' | 'delivery' | 'expiries'>('configs')

  // Alert configs
  const [configs, setConfigs]           = useState<AlertConfig[]>([])
  const [configLoading, setConfigLoading] = useState(false)

  // Broadcast
  const [bcTitle, setBcTitle]         = useState('')
  const [bcBody, setBcBody]           = useState('')
  const [bcRecipients, setBcRecipients] = useState<'all' | 'PILOT' | 'DRONE_OPERATOR'>('all')
  const [bcSending, setBcSending]     = useState(false)
  const [bcResult, setBcResult]       = useState<string | null>(null)

  // Delivery stats
  const [stats, setStats]             = useState<DeliveryStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Upcoming expiries
  const [expiries, setExpiries]       = useState<ExpiryRecord[]>([])
  const [expiryDays, setExpiryDays]   = useState(90)
  const [expiryLoading, setExpiryLoading] = useState(false)

  const api = useCallback(() => adminAxios(token!), [token])

  // ── Fetch alert configs ──────────────────────────────────────────────────

  const fetchConfigs = useCallback(async () => {
    setConfigLoading(true)
    try {
      const { data } = await api().get('/alert-configs')
      setConfigs(data.configs ?? [])
    } catch { /* silent */ }
    setConfigLoading(false)
  }, [api])

  // ── Toggle config ───────────────────────────────────────────────────────

  const toggleConfig = async (type: string, field: 'enabled' | 'emailEnabled') => {
    const config = configs.find(c => c.type === type)
    if (!config) return
    try {
      const { data } = await api().put(`/alert-configs/${type}`, {
        [field]: !config[field],
      })
      setConfigs(prev => prev.map(c => c.type === type ? data.config : c))
    } catch { /* silent */ }
  }

  // ── Send broadcast ──────────────────────────────────────────────────────

  const sendBroadcast = async () => {
    if (!bcTitle.trim() || !bcBody.trim()) return
    setBcSending(true)
    setBcResult(null)
    try {
      const { data } = await api().post('/broadcast', {
        title:      bcTitle.trim(),
        body:       bcBody.trim(),
        recipients: bcRecipients === 'all' ? 'all' : undefined,
        category:   bcRecipients !== 'all' ? bcRecipients : undefined,
      })
      setBcResult(`Broadcast sent to ${data.count} recipients`)
      setBcTitle('')
      setBcBody('')
    } catch {
      setBcResult('Failed to send broadcast')
    }
    setBcSending(false)
  }

  // ── Fetch delivery stats ────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const { data } = await api().get('/delivery-stats')
      setStats(data.stats)
    } catch { /* silent */ }
    setStatsLoading(false)
  }, [api])

  // ── Fetch upcoming expiries ─────────────────────────────────────────────

  const fetchExpiries = useCallback(async () => {
    setExpiryLoading(true)
    try {
      const { data } = await api().get('/upcoming-expiries', { params: { days: expiryDays } })
      setExpiries(data.expiries ?? [])
    } catch { /* silent */ }
    setExpiryLoading(false)
  }, [api, expiryDays])

  const exportCsv = () => {
    window.open(`/api/admin/upcoming-expiries?days=${expiryDays}&format=csv`, '_blank')
  }

  // ── Load data on tab change ─────────────────────────────────────────────

  useEffect(() => {
    if (!token) return
    if (activeTab === 'configs')   fetchConfigs()
    if (activeTab === 'delivery')  fetchStats()
    if (activeTab === 'expiries')  fetchExpiries()
  }, [activeTab, token, fetchConfigs, fetchStats, fetchExpiries])

  // ── Styles ──────────────────────────────────────────────────────────────

  const cellStyle: React.CSSProperties = {
    padding: '0.5rem 0.6rem', fontSize: '0.72rem', color: ZT.text,
    borderBottom: `1px solid ${ZT.border}`, verticalAlign: 'middle',
  }

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle, color: ZT.muted, fontWeight: 600, fontSize: '0.65rem',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    position: 'sticky', top: 0, background: ZT.surface, zIndex: 1,
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 1rem', border: 'none', borderRadius: '4px 4px 0 0',
    background: active ? ZT.surface : 'transparent',
    color: active ? ZT.phosphor : ZT.muted,
    fontSize: '0.75rem', fontWeight: active ? 700 : 500,
    cursor: 'pointer', borderBottom: active ? `2px solid ${ZT.phosphor}` : '2px solid transparent',
  })

  const toggleBtn = (on: boolean): React.CSSProperties => ({
    width: '38px', height: '20px', borderRadius: '10px',
    background: on ? ZT.phosphor + '30' : ZT.border,
    border: `1px solid ${on ? ZT.phosphor : ZT.muted}`,
    cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
  })

  const toggleDot = (on: boolean): React.CSSProperties => ({
    width: '14px', height: '14px', borderRadius: '50%',
    background: on ? ZT.phosphor : ZT.muted,
    position: 'absolute', top: '2px',
    left: on ? '20px' : '2px', transition: 'left 0.2s',
  })

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px' }}>
      {/* Header */}
      <h1 style={{ color: ZT.textBright, fontSize: '1.1rem', margin: '0 0 0.2rem 0', fontWeight: 700 }}>
        ALERT MANAGEMENT
      </h1>
      <p style={{ color: ZT.muted, fontSize: '0.7rem', margin: '0 0 1rem 0' }}>
        Configure notification alerts, send broadcasts, and monitor delivery
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.2rem', borderBottom: `1px solid ${ZT.border}`, marginBottom: '1rem' }}>
        <button style={tabStyle(activeTab === 'configs')}   onClick={() => setActiveTab('configs')}>Alert Config</button>
        <button style={tabStyle(activeTab === 'broadcast')} onClick={() => setActiveTab('broadcast')}>Broadcast</button>
        <button style={tabStyle(activeTab === 'delivery')}  onClick={() => setActiveTab('delivery')}>Delivery Status</button>
        <button style={tabStyle(activeTab === 'expiries')}  onClick={() => setActiveTab('expiries')}>Upcoming Expiries</button>
      </div>

      {/* ── Alert Config Tab ──────────────────────────────────────────────── */}
      {activeTab === 'configs' && (
        <div style={{ border: `1px solid ${ZT.border}`, borderRadius: '8px', overflow: 'auto' }}>
          {configLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: ZT.muted }}>Loading...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>TYPE</th>
                  <th style={headerCellStyle}>CATEGORY</th>
                  <th style={headerCellStyle}>LABEL</th>
                  <th style={{ ...headerCellStyle, width: '80px', textAlign: 'center' }}>THRESHOLD</th>
                  <th style={{ ...headerCellStyle, width: '80px', textAlign: 'center' }}>ENABLED</th>
                  <th style={{ ...headerCellStyle, width: '80px', textAlign: 'center' }}>EMAIL</th>
                </tr>
              </thead>
              <tbody>
                {configs.map(c => (
                  <tr key={c.type}>
                    <td style={cellStyle}>
                      <span style={{
                        padding: '0.15rem 0.4rem', borderRadius: '3px',
                        fontSize: '0.6rem', fontWeight: 600,
                        background: (CATEGORY_COLORS[c.category] ?? ZT.muted) + '20',
                        color: CATEGORY_COLORS[c.category] ?? ZT.muted,
                      }}>
                        {formatType(c.type)}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, fontSize: '0.65rem' }}>{c.category}</td>
                    <td style={cellStyle}>{c.label}</td>
                    <td style={{ ...cellStyle, textAlign: 'center', fontSize: '0.7rem' }}>
                      {c.thresholdDays !== null ? `${c.thresholdDays}d` : '--'}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      <button style={toggleBtn(c.enabled)} onClick={() => toggleConfig(c.type, 'enabled')}>
                        <span style={toggleDot(c.enabled)} />
                      </button>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      <button style={toggleBtn(c.emailEnabled)} onClick={() => toggleConfig(c.type, 'emailEnabled')}>
                        <span style={toggleDot(c.emailEnabled)} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Broadcast Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'broadcast' && (
        <div style={{
          border: `1px solid ${ZT.border}`, borderRadius: '8px',
          padding: '1rem', maxWidth: '600px',
        }}>
          <div style={{ marginBottom: '0.8rem' }}>
            <label style={{ color: ZT.text, fontSize: '0.7rem', display: 'block', marginBottom: '0.3rem' }}>
              Recipients
            </label>
            <select
              value={bcRecipients}
              onChange={e => setBcRecipients(e.target.value as any)}
              style={{
                width: '100%', padding: '0.4rem 0.6rem',
                background: ZT.bg, border: `1px solid ${ZT.border}`,
                borderRadius: '4px', color: ZT.text, fontSize: '0.72rem',
              }}
            >
              <option value="all">All Users</option>
              <option value="PILOT">Pilots Only</option>
              <option value="DRONE_OPERATOR">Drone Operators Only</option>
            </select>
          </div>

          <div style={{ marginBottom: '0.8rem' }}>
            <label style={{ color: ZT.text, fontSize: '0.7rem', display: 'block', marginBottom: '0.3rem' }}>
              Title
            </label>
            <input
              type="text"
              value={bcTitle}
              onChange={e => setBcTitle(e.target.value)}
              placeholder="Notification title..."
              style={{
                width: '100%', padding: '0.4rem 0.6rem',
                background: ZT.bg, border: `1px solid ${ZT.border}`,
                borderRadius: '4px', color: ZT.text, fontSize: '0.72rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '0.8rem' }}>
            <label style={{ color: ZT.text, fontSize: '0.7rem', display: 'block', marginBottom: '0.3rem' }}>
              Message Body
            </label>
            <textarea
              value={bcBody}
              onChange={e => setBcBody(e.target.value)}
              placeholder="Enter your broadcast message..."
              rows={4}
              style={{
                width: '100%', padding: '0.4rem 0.6rem',
                background: ZT.bg, border: `1px solid ${ZT.border}`,
                borderRadius: '4px', color: ZT.text, fontSize: '0.72rem',
                resize: 'vertical', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            onClick={sendBroadcast}
            disabled={bcSending || !bcTitle.trim() || !bcBody.trim()}
            style={{
              padding: '0.5rem 1.2rem', borderRadius: '4px',
              border: `1px solid ${ZT.phosphor}`,
              background: ZT.phosphor + '15',
              color: ZT.phosphor, fontSize: '0.75rem', fontWeight: 600,
              cursor: bcSending ? 'wait' : 'pointer',
              opacity: (!bcTitle.trim() || !bcBody.trim()) ? 0.5 : 1,
            }}
          >
            {bcSending ? 'Sending...' : 'Send Broadcast'}
          </button>

          {bcResult && (
            <div style={{
              marginTop: '0.6rem', padding: '0.4rem 0.6rem',
              borderRadius: '4px', fontSize: '0.7rem',
              background: bcResult.includes('Failed') ? ZT.red + '15' : ZT.phosphor + '15',
              color: bcResult.includes('Failed') ? ZT.red : ZT.phosphor,
              border: `1px solid ${bcResult.includes('Failed') ? ZT.red + '40' : ZT.phosphor + '40'}`,
            }}>
              {bcResult}
            </div>
          )}
        </div>
      )}

      {/* ── Delivery Status Tab ───────────────────────────────────────────── */}
      {activeTab === 'delivery' && (
        <div>
          {statsLoading || !stats ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: ZT.muted }}>Loading...</div>
          ) : (
            <>
              {/* Summary cards */}
              <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'TOTAL',  value: stats.total,  color: ZT.phosphor },
                  { label: 'READ',   value: stats.read,   color: '#22C55E' },
                  { label: 'UNREAD', value: stats.unread,  color: ZT.amber },
                ].map(card => (
                  <div key={card.label} style={{
                    padding: '0.8rem 1.2rem', borderRadius: '8px',
                    border: `1px solid ${ZT.border}`, background: ZT.surface,
                    minWidth: '120px',
                  }}>
                    <div style={{ color: ZT.muted, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                      {card.label}
                    </div>
                    <div style={{ color: card.color, fontSize: '1.4rem', fontWeight: 700, marginTop: '0.2rem' }}>
                      {card.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {/* By type table */}
              <div style={{ border: `1px solid ${ZT.border}`, borderRadius: '8px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={headerCellStyle}>NOTIFICATION TYPE</th>
                      <th style={{ ...headerCellStyle, textAlign: 'right', width: '100px' }}>COUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byType.map(row => (
                      <tr key={row.type}>
                        <td style={cellStyle}>{formatType(row.type)}</td>
                        <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Upcoming Expiries Tab ─────────────────────────────────────────── */}
      {activeTab === 'expiries' && (
        <div>
          {/* Controls */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.8rem',
            marginBottom: '1rem', flexWrap: 'wrap',
          }}>
            <label style={{ color: ZT.text, fontSize: '0.72rem' }}>
              Within{' '}
              <select
                value={expiryDays}
                onChange={e => setExpiryDays(Number(e.target.value))}
                style={{
                  padding: '0.3rem 0.5rem', background: ZT.bg,
                  border: `1px solid ${ZT.border}`, borderRadius: '4px',
                  color: ZT.text, fontSize: '0.72rem',
                }}
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
              </select>
            </label>
            <button
              onClick={exportCsv}
              style={{
                padding: '0.35rem 0.8rem', borderRadius: '4px',
                border: `1px solid ${ZT.phosphor}40`,
                background: ZT.phosphor + '10',
                color: ZT.phosphor, fontSize: '0.7rem', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Export CSV
            </button>
            <span style={{ color: ZT.muted, fontSize: '0.68rem' }}>
              {expiries.length} record{expiries.length !== 1 ? 's' : ''} found
            </span>
          </div>

          {/* Expiries table */}
          <div style={{
            border: `1px solid ${ZT.border}`, borderRadius: '8px',
            overflow: 'auto', maxHeight: 'calc(100vh - 300px)',
          }}>
            {expiryLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: ZT.muted }}>Loading...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={headerCellStyle}>USER ID</th>
                    <th style={headerCellStyle}>EMAIL</th>
                    <th style={headerCellStyle}>LICENSE #</th>
                    <th style={headerCellStyle}>EXPIRY DATE</th>
                    <th style={{ ...headerCellStyle, textAlign: 'right' }}>DAYS LEFT</th>
                    <th style={headerCellStyle}>ROLE</th>
                    <th style={headerCellStyle}>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {expiries.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ ...cellStyle, textAlign: 'center', padding: '2rem', color: ZT.muted }}>
                        No upcoming expiries within {expiryDays} days
                      </td>
                    </tr>
                  ) : (
                    expiries.map(e => {
                      const urgent = (e.daysRemaining ?? 999) <= 7
                      const expired = (e.daysRemaining ?? 999) <= 0
                      return (
                        <tr key={e.userId}>
                          <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '0.65rem' }}>
                            {e.userId.slice(0, 12)}...
                          </td>
                          <td style={cellStyle}>{e.email ?? '--'}</td>
                          <td style={cellStyle}>{e.licenseNumber ?? '--'}</td>
                          <td style={cellStyle}>
                            {e.expiryDate ? new Date(e.expiryDate).toLocaleDateString('en-IN') : '--'}
                          </td>
                          <td style={{
                            ...cellStyle, textAlign: 'right', fontWeight: 600,
                            color: expired ? ZT.red : urgent ? ZT.amber : ZT.text,
                          }}>
                            {expired ? 'EXPIRED' : e.daysRemaining ?? '--'}
                          </td>
                          <td style={{ ...cellStyle, fontSize: '0.65rem' }}>{e.role}</td>
                          <td style={cellStyle}>
                            <span style={{
                              padding: '0.1rem 0.4rem', borderRadius: '3px',
                              fontSize: '0.6rem', fontWeight: 600,
                              background: e.accountStatus === 'ACTIVE' ? ZT.phosphor + '20' : ZT.amber + '20',
                              color: e.accountStatus === 'ACTIVE' ? ZT.phosphor : ZT.amber,
                            }}>
                              {e.accountStatus}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
