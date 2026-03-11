// Stub implementation of IAfmluAdapter.
// Returns deterministic ADC records per AFMLU.
// Government replaces this with their AFMLU portal data feeds.
// This stub must never make network calls.

import type {
  IAfmluAdapter, AdcPullResult, AdcUpdateResult,
  AdcClearanceRequest, AdcClearanceResponse,
  AdcConflictAlert,
} from '../interfaces/IAfmluAdapter'

const AS_OF = new Date().toISOString()

// One stub zone per AFMLU (representative sample — government provides real data)
function makeZone(afmluId: number, adcNumber: string, adcType: string, lat: number, lon: number) {
  const d = 0.2  // degree offset for polygon
  return {
    afmluId,
    adcNumber,
    adcType,
    area: {
      type: 'Polygon' as const,
      coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]]
    },
    verticalLimits: { lowerFt: 0, lowerRef: 'AGL', upperFt: 400, upperRef: 'AGL' },
    effectiveFrom: '2024-01-01T00:00:00Z',
    effectiveTo:   null as string | null,
    activitySchedule: 'H24',
    contactFrequency: '122.800',
    remarks: `AFMLU-${afmluId} controlled zone`,
    fetchedAtUtc: AS_OF,
  }
}

const STUB_ADC: Record<number, ReturnType<typeof makeZone>[]> = {
  1:  [makeZone(1,  'ADC-001-001', 'RESTRICTED',  28.5, 77.1)],
  2:  [makeZone(2,  'ADC-002-001', 'PROHIBITED',  19.1, 72.9)],
  3:  [makeZone(3,  'ADC-003-001', 'CONTROLLED',  13.0, 80.1)],
  4:  [makeZone(4,  'ADC-004-001', 'RESTRICTED',  22.7, 88.3)],
  5:  [makeZone(5,  'ADC-005-001', 'DANGER',      12.9, 77.6)],
  6:  [makeZone(6,  'ADC-006-001', 'RESTRICTED',  17.4, 78.5)],
  7:  [makeZone(7,  'ADC-007-001', 'PROHIBITED',  23.0, 72.6)],
  8:  [makeZone(8,  'ADC-008-001', 'CONTROLLED',  15.5, 73.8)],
  9:  [makeZone(9,  'ADC-009-001', 'RESTRICTED',  26.8, 80.9)],
  10: [makeZone(10, 'ADC-010-001', 'DANGER',      11.6, 92.7)],
}

export class AfmluAdapterStub implements IAfmluAdapter {
  async pullAdcRecords(afmluId: number): Promise<AdcPullResult> {
    return {
      records:  STUB_ADC[afmluId] ?? [],
      asOfUtc:  AS_OF,
    }
  }

  async pullAdcUpdates(afmluId: number, _sinceUtc: string): Promise<AdcUpdateResult> {
    return {
      newRecords:          STUB_ADC[afmluId] ?? [],
      withdrawnAdcNumbers: [],
      asOfUtc:             AS_OF,
    }
  }

  // ── OUTBOUND (JADS → AFMLU) ────────────────────────────────

  async submitFlightPlanForAdc(_afmluId: number, request: AdcClearanceRequest): Promise<AdcClearanceResponse> {
    const now = new Date().toISOString()
    return {
      accepted:               true,
      adcNumber:              `ADC-STUB-${request.flightPlanId.slice(0, 8).toUpperCase()}`,
      rejectionReason:        null,
      estimatedProcessingMin: 5,
      respondedAtUtc:         now,
    }
  }

  async acknowledgeAdcUpdate(_adcNumber: string, _acknowledged: boolean): Promise<void> {
    // Stub: no-op — live implementation sends acknowledgement to AFMLU
  }

  async pushConflictAlert(_afmluId: number, alert: AdcConflictAlert): Promise<{ acknowledged: boolean }> {
    console.log(`[AfmluAdapterStub] conflict_alert_pushed | ${alert.severity} | drone=${alert.dronePlanId} flight=${alert.flightPlanId} callsign=${alert.callsign} | drone=${alert.droneAltitudeAglM.min}-${alert.droneAltitudeAglM.max}m AGL (${alert.droneAltitudeAmslFt.min}-${alert.droneAltitudeAmslFt.max}ft AMSL) vs flight=${alert.flightAltitudeAmslFt}ft AMSL | ground=${alert.groundElevationFt}ft | ${alert.overlapStartUtc} to ${alert.overlapEndUtc}`)
    return { acknowledged: true }
  }
}
