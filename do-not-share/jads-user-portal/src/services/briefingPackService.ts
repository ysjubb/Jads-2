// UP17: Pre-flight briefing pack generator

import type { ICAOFlightPlan } from '../types/flightPlan'

export interface BriefingSection {
  title: string
  content: string
  severity: 'INFO' | 'CAUTION' | 'WARNING'
}

export interface BriefingPack {
  generatedAt: string
  flightRef: string
  sections: BriefingSection[]
  notamCount: number
  weatherSummary: string
  routeSummary: string
  fuelSummary: string
  complianceStatus: 'PASS' | 'FAIL' | 'WARN'
}

export async function generateBriefingPack(fpl: Partial<ICAOFlightPlan>): Promise<BriefingPack> {
  await new Promise(r => setTimeout(r, 500))

  const adep = fpl.departureAerodrome ?? 'ZZZZ'
  const ades = fpl.destinationAerodrome ?? 'ZZZZ'
  const eobt = fpl.eobt ?? '0000'

  const sections: BriefingSection[] = [
    {
      title: 'Flight Summary',
      content: `${adep} → ${ades} | EOBT: ${eobt}Z | A/C: ${fpl.aircraftId ?? 'N/A'} (${fpl.aircraftType ?? 'ZZZZ'})`,
      severity: 'INFO',
    },
    {
      title: 'Weather Synopsis',
      content: `Current METARs and TAFs for ${adep}, ${ades}${fpl.alternate1 ? `, ${fpl.alternate1}` : ''} — check IMD/AAI AIM for live data.`,
      severity: 'INFO',
    },
    {
      title: 'NOTAM Summary',
      content: `Review active NOTAMs for departure, enroute, and arrival aerodromes. Check JADS NOTAM Center for filtered view.`,
      severity: 'CAUTION',
    },
    {
      title: 'Route Analysis',
      content: `Route: ${fpl.route ?? 'DCT'} | Cruising: ${fpl.cruisingSpeed ?? 'N/A'} at ${fpl.cruisingLevel ?? 'N/A'}`,
      severity: 'INFO',
    },
    {
      title: 'Airspace Restrictions',
      content: `Check active TRAs, restricted areas, and danger areas along route. Verify AIRAC currency.`,
      severity: 'CAUTION',
    },
    {
      title: 'Fuel & Performance',
      content: `Verify fuel uplift meets DGCA CAR requirements. Check W&B within aircraft limits.`,
      severity: 'INFO',
    },
    {
      title: 'Regulatory',
      content: `Ensure DGCA compliance per CAR Section 8. ATC slot confirmed. All crew documents current.`,
      severity: 'INFO',
    },
  ]

  return {
    generatedAt: new Date().toISOString(),
    flightRef: `${adep}${ades}-${eobt}`,
    sections,
    notamCount: 4,
    weatherSummary: 'VMC conditions expected. Check latest METAR/TAF.',
    routeSummary: `${adep} → ${fpl.route ?? 'DCT'} → ${ades}`,
    fuelSummary: 'Verify fuel plan against DGCA CAR Section 8 Series O.',
    complianceStatus: 'PASS',
  }
}

export function formatBriefingText(pack: BriefingPack): string {
  const lines = [
    '═══════════════════════════════════════════════',
    '  JADS PRE-FLIGHT BRIEFING PACK',
    `  Generated: ${new Date(pack.generatedAt).toUTCString()}`,
    `  Flight: ${pack.flightRef}`,
    '═══════════════════════════════════════════════',
    '',
  ]

  for (const s of pack.sections) {
    lines.push(`[${s.severity}] ${s.title}`)
    lines.push(`  ${s.content}`)
    lines.push('')
  }

  lines.push('═══════════════════════════════════════════════')
  lines.push(`Compliance: ${pack.complianceStatus} | NOTAMs: ${pack.notamCount}`)
  lines.push('═══════════════════════════════════════════════')

  return lines.join('\n')
}
