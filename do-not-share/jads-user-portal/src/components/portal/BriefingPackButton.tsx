import React, { useState } from 'react'
import { T } from '../../theme'
import { generateBriefingPack, formatBriefingText } from '../../services/briefingPackService'
import type { BriefingPack } from '../../services/briefingPackService'
import type { ICAOFlightPlan } from '../../types/flightPlan'

interface BriefingPackButtonProps {
  flightPlan: Partial<ICAOFlightPlan>
}

const SEV_COLOR = { INFO: T.primary, CAUTION: T.amber, WARNING: T.red }

export function BriefingPackButton({ flightPlan }: BriefingPackButtonProps) {
  const [pack, setPack] = useState<BriefingPack | null>(null)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const generate = async () => {
    setLoading(true)
    const p = await generateBriefingPack(flightPlan)
    setPack(p)
    setLoading(false)
    setShowModal(true)
  }

  const downloadText = () => {
    if (!pack) return
    const text = formatBriefingText(pack)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `briefing-${pack.flightRef}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <button
        onClick={generate}
        disabled={loading}
        style={{
          padding: '6px 14px', fontSize: '0.7rem', fontWeight: 600,
          background: T.primary + '20', color: T.primary,
          border: `1px solid ${T.primary}40`, borderRadius: '3px', cursor: 'pointer',
        }}
      >
        {loading ? 'Generating...' : 'Generate Briefing Pack'}
      </button>

      {showModal && pack && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowModal(false)}>
          <div
            style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: '6px', padding: '1.5rem', maxWidth: '650px',
              width: '90%', maxHeight: '80vh', overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ color: T.textBright, fontSize: '0.9rem', margin: 0 }}>
                Pre-Flight Briefing Pack
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={downloadText} style={{
                  padding: '4px 10px', fontSize: '0.6rem', background: T.primary + '20',
                  color: T.primary, border: `1px solid ${T.primary}40`, borderRadius: '3px', cursor: 'pointer',
                }}>
                  Download TXT
                </button>
                <button onClick={() => setShowModal(false)} style={{
                  padding: '4px 10px', fontSize: '0.6rem', background: T.red + '20',
                  color: T.red, border: `1px solid ${T.red}40`, borderRadius: '3px', cursor: 'pointer',
                }}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ fontSize: '0.65rem', color: T.muted, marginBottom: '0.75rem' }}>
              Flight: {pack.flightRef} | Generated: {new Date(pack.generatedAt).toUTCString()}
              {' | '}
              Status: <span style={{
                color: pack.complianceStatus === 'PASS' ? T.primary : pack.complianceStatus === 'WARN' ? T.amber : T.red,
                fontWeight: 700,
              }}>{pack.complianceStatus}</span>
            </div>

            {pack.sections.map((s, i) => (
              <div key={i} style={{
                padding: '0.5rem', marginBottom: '0.4rem',
                background: T.bg, border: `1px solid ${T.border}`,
                borderLeft: `3px solid ${SEV_COLOR[s.severity]}`,
                borderRadius: '3px',
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: SEV_COLOR[s.severity], marginBottom: '3px' }}>
                  {s.title}
                </div>
                <div style={{ fontSize: '0.65rem', color: T.text }}>{s.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
