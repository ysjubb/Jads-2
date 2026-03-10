import React, { useMemo } from 'react'
import { T } from '../../theme'
import { assembleFPL, formatField7, formatField8, formatField9, formatField10, formatField13, formatField15, formatField16, formatField18 } from '../../utils/aftnFormatter'
import type { ICAOFlightPlan } from '../../types/flightPlan'

interface AftnMessagePreviewProps {
  flightPlan: Partial<ICAOFlightPlan>
  recipientAddresses?: string[]
  originatorAddress?: string
  priority?: 'FF' | 'GG' | 'SS' | 'DD' | 'KK'
}

const FIELD_LABELS: Record<string, string> = {
  f7: 'Field 7 — Aircraft Identification',
  f8: 'Field 8 — Flight Rules / Type',
  f9: 'Field 9 — Number & Type / Wake Cat',
  f10: 'Field 10 — Equipment & SSR',
  f13: 'Field 13 — Departure Aerodrome & Time',
  f15: 'Field 15 — Route',
  f16: 'Field 16 — Destination & EET',
  f18: 'Field 18 — Other Information',
}

export function AftnMessagePreview({
  flightPlan,
  recipientAddresses = ['VIDPZQZX', 'VIDFZPZX'],
  originatorAddress = 'VIDPYFYX',
  priority = 'FF',
}: AftnMessagePreviewProps) {
  const fpl = flightPlan

  const fields = useMemo(() => ({
    f7: formatField7(fpl.aircraftId ?? ''),
    f8: formatField8(fpl.flightRules ?? 'I', fpl.flightType ?? 'S'),
    f9: formatField9(fpl.aircraftType ?? 'ZZZZ', fpl.wakeTurbulence ?? 'M'),
    f10: formatField10(fpl.equipment ?? ['S'], fpl.ssr ?? 'C', fpl.adsb),
    f13: formatField13(fpl.departureAerodrome ?? 'ZZZZ', fpl.eobt ?? '0000'),
    f15: formatField15(fpl.cruisingSpeed ?? 'N0440', fpl.cruisingLevel ?? 'F350', fpl.route ?? ''),
    f16: formatField16(fpl.destinationAerodrome ?? 'ZZZZ', fpl.eet ?? '0000', fpl.alternate1, fpl.alternate2),
    f18: formatField18(fpl.field18 ?? {} as Record<string, string>),
  }), [fpl])

  const fullFPL = useMemo(() => assembleFPL(fpl), [fpl])

  const aftnMessage = useMemo(() => {
    const now = new Date()
    const dtg = `${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`
    return [
      `ZCZC`,
      `${priority} ${recipientAddresses.join(' ')}`,
      `${dtg} ${originatorAddress}`,
      '',
      fullFPL,
      '',
      `NNNN`,
    ].join('\n')
  }, [fullFPL, priority, recipientAddresses, originatorAddress])

  const copyToClipboard = () => {
    navigator.clipboard.writeText(aftnMessage)
  }

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: '4px',
      padding: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ color: T.textBright, fontSize: '0.85rem', margin: 0 }}>
          AFTN Message Preview
        </h3>
        <button
          onClick={copyToClipboard}
          style={{
            padding: '4px 10px', fontSize: '0.65rem', fontWeight: 600,
            background: T.primary + '20', color: T.primary,
            border: `1px solid ${T.primary}40`, borderRadius: '3px', cursor: 'pointer',
          }}
        >
          Copy Message
        </button>
      </div>

      {/* Field breakdown */}
      <div style={{ marginBottom: '1rem' }}>
        {Object.entries(fields).map(([key, value]) => (
          <div key={key} style={{
            display: 'flex', gap: '0.5rem', padding: '3px 0',
            fontSize: '0.7rem', borderBottom: `1px solid ${T.border}08`,
          }}>
            <span style={{ color: T.muted, minWidth: '180px', fontSize: '0.6rem' }}>
              {FIELD_LABELS[key]}
            </span>
            <span style={{ color: T.textBright, fontFamily: 'monospace' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Full AFTN message */}
      <div style={{ position: 'relative' }}>
        <div style={{ color: T.muted, fontSize: '0.6rem', marginBottom: '4px' }}>
          Full AFTN Transmission:
        </div>
        <pre style={{
          background: '#000',
          color: '#00FF88',
          fontFamily: '"Courier New", monospace',
          fontSize: '0.7rem',
          padding: '0.75rem',
          borderRadius: '3px',
          border: `1px solid ${T.border}`,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          margin: 0,
          lineHeight: 1.5,
        }}>
          {aftnMessage}
        </pre>
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.55rem', color: T.muted }}>
        Format: ICAO Doc 4444 PANS-ATM &middot; Priority: {priority} (Flight Safety)
      </div>
    </div>
  )
}
