import React, { useState } from 'react'
import { T } from '../../theme'
import type { ComplianceReport, ComplianceItem, ComplianceStatus } from '../../services/complianceEngine'

const STATUS_STYLE: Record<ComplianceStatus, { color: string; icon: string }> = {
  PASS: { color: '#00C864', icon: 'PASS' },
  FAIL: { color: T.red, icon: 'FAIL' },
  WARN: { color: T.amber, icon: 'WARN' },
  PENDING: { color: T.muted, icon: '...' },
}

interface ComplianceChecklistProps {
  report: ComplianceReport
  role: 'PILOT' | 'DRONE_OPERATOR' | 'DISPATCHER' | 'ADMIN'
  onProceed?: () => void
  onCancel?: () => void
}

export function ComplianceChecklist({ report, role, onProceed, onCancel }: ComplianceChecklistProps) {
  const [warnAcknowledged, setWarnAcknowledged] = useState<Set<string>>(new Set())

  // Pilot/operator can override WARN items; ADMIN cannot override operational decisions
  const canOverride = role === 'PILOT' || role === 'DRONE_OPERATOR' || role === 'DISPATCHER'
  const allWarnsAcked = report.items
    .filter(i => i.status === 'WARN')
    .every(i => warnAcknowledged.has(i.ruleId))
  const canProceed = report.failCount === 0 && (report.warnCount === 0 || allWarnsAcked)

  return (
    <div style={{ padding: '1rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: '6px' }}>
      <h3 style={{ color: T.textBright, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
        Pre-Flight Compliance Check
      </h3>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.65rem' }}>
        <span style={{ color: '#00C864' }}>Pass: {report.passCount}</span>
        <span style={{ color: T.amber }}>Warn: {report.warnCount}</span>
        <span style={{ color: T.red }}>Fail: {report.failCount}</span>
      </div>

      {report.items.map(item => {
        const s = STATUS_STYLE[item.status]
        const isWarn = item.status === 'WARN'
        const isAcked = warnAcknowledged.has(item.ruleId)

        return (
          <div key={item.ruleId} style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            padding: '0.4rem 0', borderBottom: `1px solid ${T.border}`,
          }}>
            <span style={{
              fontSize: '0.6rem', fontWeight: 700, color: s.color,
              minWidth: '35px', textAlign: 'center',
            }}>{s.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.7rem', color: T.textBright }}>
                {item.label}
                {item.category && <span style={{ color: T.muted, fontSize: '0.55rem', marginLeft: '0.5rem' }}>({item.category})</span>}
              </div>
              <div style={{ fontSize: '0.6rem', color: T.muted }}>{item.detail}</div>
              {item.status === 'FAIL' && item.fixGuidance && (
                <div style={{ fontSize: '0.55rem', color: T.red, marginTop: '0.15rem' }}>Fix: {item.fixGuidance}</div>
              )}
              {item.dgcaReference && (
                <div style={{ fontSize: '0.5rem', color: T.muted }}>Ref: {item.dgcaReference}</div>
              )}
            </div>
            {isWarn && canOverride && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.55rem', color: T.amber }}>
                <input type="checkbox" checked={isAcked}
                  onChange={e => {
                    setWarnAcknowledged(s => {
                      const next = new Set(s)
                      e.target.checked ? next.add(item.ruleId) : next.delete(item.ruleId)
                      return next
                    })
                  }} />
                Acknowledge
              </label>
            )}
          </div>
        )
      })}

      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        {onCancel && (
          <button onClick={onCancel} style={{
            padding: '0.4rem 1rem', background: 'transparent', border: `1px solid ${T.border}`,
            borderRadius: '4px', color: T.muted, cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'inherit',
          }}>Cancel</button>
        )}
        {onProceed && (
          <button onClick={onProceed} disabled={!canProceed} style={{
            padding: '0.4rem 1rem', background: canProceed ? T.primary : T.muted,
            border: 'none', borderRadius: '4px', color: '#fff',
            cursor: canProceed ? 'pointer' : 'default', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit',
          }}>
            {report.failCount > 0 ? 'Cannot Proceed (Fix Failures)' :
             !allWarnsAcked ? 'Acknowledge Warnings to Proceed' : 'Proceed — Submit to Approving Authority'}
          </button>
        )}
      </div>

      <p style={{ fontSize: '0.5rem', color: T.muted, marginTop: '0.5rem', fontStyle: 'italic' }}>
        {canOverride
          ? 'As filing authority, you may acknowledge WARN items. Approving authority makes the final decision.'
          : 'Only the filing pilot/operator can acknowledge warnings.'}
      </p>
    </div>
  )
}
