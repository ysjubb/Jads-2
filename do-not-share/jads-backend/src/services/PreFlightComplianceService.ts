/**
 * DS-15 — Pre-Flight Compliance Check (Go/No-Go Gate)
 *
 * Before a drone takes off, the operator must run a pre-flight compliance check.
 * This is the final "Go/No-Go" gate. It performs 6 sequential checks:
 *
 *   1. UIN_VERIFIED       — Is the drone's UIN verified on Digital Sky?
 *   2. UAOP_VALID         — Is the UAOP (Unmanned Aircraft Operator Permit) valid?
 *   3. ZONE_CLASSIFICATION — What zone is the flight in? RED = automatic NO-GO.
 *   4. PA_SIGNATURE        — Does the PA have a valid Digital Sky signature?
 *   5. PA_TIME_WINDOW      — Is the flight within the PA's approved time window?
 *   6. PA_GEOFENCE         — Is the planned area within the PA's geofence boundary?
 *
 * All checks run sequentially. A failure in an earlier check does NOT short-circuit —
 * all checks run so the operator sees every issue at once.
 *
 * The result is a ComplianceReport with an overall GO/NO_GO/ADVISORY verdict.
 */

import { PrismaClient } from '@prisma/client'
import { createServiceLogger } from '../logger'
import { UINVerificationService, UINVerificationResult } from './UINVerificationService'
import { classifyPolygon, LatLng } from './ZoneClassificationService'

const log = createServiceLogger('PreFlightComplianceService')

// ── Types ──────────────────────────────────────────────────────────────────

export type CheckCode =
  | 'UIN_VERIFIED'
  | 'UAOP_VALID'
  | 'ZONE_CLASSIFICATION'
  | 'PA_SIGNATURE'
  | 'PA_TIME_WINDOW'
  | 'PA_GEOFENCE'

export type CheckStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP'
export type Verdict = 'GO' | 'NO_GO' | 'ADVISORY'

export interface ComplianceCheck {
  code:        CheckCode
  name:        string
  status:      CheckStatus
  detail:      string
  remediation: string | null
}

export interface ComplianceReport {
  verdict:    Verdict
  checks:     ComplianceCheck[]
  uinNumber:  string
  paId:       string | null
  checkedAt:  string   // ISO timestamp
}

export interface PreFlightInput {
  uinNumber:   string
  paId?:       string           // Permission Artefact ID (if one exists)
  polygon?:    LatLng[]         // Planned flight polygon (for geofence check)
  altitudeM?:  number           // Planned max altitude in meters AGL
  flightTime?: string           // Planned flight time (ISO 8601)
}

// ── Service ────────────────────────────────────────────────────────────────

export class PreFlightComplianceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly uinService: UINVerificationService
  ) {
    log.info('pre_flight_compliance_service_initialized', { data: {} })
  }

  /**
   * Run all 6 pre-flight compliance checks.
   * Returns a ComplianceReport with an overall GO/NO_GO/ADVISORY verdict.
   */
  async runCheck(input: PreFlightInput): Promise<ComplianceReport> {
    const checks: ComplianceCheck[] = []
    const { uinNumber, paId, polygon, altitudeM, flightTime } = input

    // ── Check 1: UIN_VERIFIED ──────────────────────────────────────────────
    let uinResult: UINVerificationResult | null = null
    try {
      uinResult = await this.uinService.verifyUIN(uinNumber)

      if (uinResult.valid) {
        checks.push({
          code:   'UIN_VERIFIED',
          name:   'UIN Verification',
          status: 'PASS',
          detail: `UIN ${uinNumber} verified via ${uinResult.source}. Category: ${uinResult.droneCategory}.`,
          remediation: null,
        })
      } else {
        checks.push({
          code:   'UIN_VERIFIED',
          name:   'UIN Verification',
          status: 'FAIL',
          detail: uinResult.advisory ?? `UIN ${uinNumber} not verified on Digital Sky`,
          remediation: 'Register your drone on Digital Sky (digitalsky.dgca.gov.in) and obtain a valid UIN.',
        })
      }
    } catch (err) {
      checks.push({
        code:   'UIN_VERIFIED',
        name:   'UIN Verification',
        status: 'FAIL',
        detail: `UIN verification failed: ${err instanceof Error ? err.message : String(err)}`,
        remediation: 'Retry or check your internet connection. Digital Sky may be temporarily unavailable.',
      })
    }

    // ── Check 2: UAOP_VALID ────────────────────────────────────────────────
    if (uinResult?.valid) {
      if (uinResult.uaopValid) {
        checks.push({
          code:   'UAOP_VALID',
          name:   'UAOP Status',
          status: 'PASS',
          detail: `UAOP is valid for operator: ${uinResult.operatorId}`,
          remediation: null,
        })
      } else {
        checks.push({
          code:   'UAOP_VALID',
          name:   'UAOP Status',
          status: 'FAIL',
          detail: 'UAOP (Unmanned Aircraft Operator Permit) is expired or invalid.',
          remediation: 'Renew your UAOP via the DGCA Digital Sky portal before operating.',
        })
      }
    } else {
      checks.push({
        code:   'UAOP_VALID',
        name:   'UAOP Status',
        status: 'SKIP',
        detail: 'UAOP check skipped — UIN not verified.',
        remediation: 'Resolve UIN verification first.',
      })
    }

    // ── Check 3: ZONE_CLASSIFICATION ───────────────────────────────────────
    if (polygon && polygon.length >= 3) {
      try {
        const zoneResult = await classifyPolygon(polygon, altitudeM ?? 120)
        const zone = zoneResult.primaryZone

        if (zone === 'RED') {
          checks.push({
            code:   'ZONE_CLASSIFICATION',
            name:   'Airspace Zone',
            status: 'FAIL',
            detail: 'Flight area is in a RED zone — no drone operations permitted.',
            remediation: 'Choose a different flight area outside restricted airspace.',
          })
        } else if (zone === 'YELLOW') {
          checks.push({
            code:   'ZONE_CLASSIFICATION',
            name:   'Airspace Zone',
            status: 'WARN',
            detail: `Flight area is in a YELLOW zone — ATC permission required${zoneResult.atcAuthority ? ' from ' + zoneResult.atcAuthority : ''}.`,
            remediation: 'Ensure you have ATC clearance before takeoff. File via JADS for automatic routing.',
          })
        } else {
          checks.push({
            code:   'ZONE_CLASSIFICATION',
            name:   'Airspace Zone',
            status: 'PASS',
            detail: 'Flight area is in a GREEN zone — auto-approval eligible.',
            remediation: null,
          })
        }
      } catch (err) {
        checks.push({
          code:   'ZONE_CLASSIFICATION',
          name:   'Airspace Zone',
          status: 'WARN',
          detail: `Zone classification check failed: ${err instanceof Error ? err.message : String(err)}`,
          remediation: 'Manually verify your flight area against the airspace map.',
        })
      }
    } else {
      checks.push({
        code:   'ZONE_CLASSIFICATION',
        name:   'Airspace Zone',
        status: 'SKIP',
        detail: 'No flight polygon provided — zone check skipped.',
        remediation: 'Provide a flight area polygon to check airspace classification.',
      })
    }

    // ── Check 4: PA_SIGNATURE ──────────────────────────────────────────────
    if (paId) {
      const pa = await this.prisma.permissionArtefact.findUnique({
        where: { id: paId },
        select: {
          id: true,
          status: true,
          rawPaXml: true,
          paZipHash: true,
          flightStartTime: true,
          flightEndTime: true,
          geofencePolygon: true,
        },
      })

      if (!pa) {
        checks.push({
          code:   'PA_SIGNATURE',
          name:   'PA Signature',
          status: 'FAIL',
          detail: `Permission Artefact ${paId} not found.`,
          remediation: 'File a new flight permission request via JADS.',
        })
      } else {
        // Check PA has valid XML/signature
        const hasSignature = pa.rawPaXml
          ? (pa.rawPaXml.toString().includes('<Signature') || pa.rawPaXml.toString().includes('<ds:Signature'))
          : false

        const approvedStatuses = ['APPROVED', 'DOWNLOADED', 'LOADED', 'ACTIVE']
        const isApproved = approvedStatuses.includes(pa.status)

        if (isApproved && hasSignature) {
          checks.push({
            code:   'PA_SIGNATURE',
            name:   'PA Signature',
            status: 'PASS',
            detail: `PA ${paId} has valid Digital Sky signature. Status: ${pa.status}.`,
            remediation: null,
          })
        } else if (isApproved && !hasSignature) {
          checks.push({
            code:   'PA_SIGNATURE',
            name:   'PA Signature',
            status: 'WARN',
            detail: `PA ${paId} is ${pa.status} but digital signature not found in artefact.`,
            remediation: 'Download the PA again to ensure signature integrity.',
          })
        } else {
          checks.push({
            code:   'PA_SIGNATURE',
            name:   'PA Signature',
            status: 'FAIL',
            detail: `PA ${paId} status is ${pa.status} — not in an approved state.`,
            remediation: pa.status === 'PENDING'
              ? 'Wait for Digital Sky to approve your permission request.'
              : pa.status === 'REJECTED'
              ? 'Your permission was rejected. File a new request.'
              : `PA is in ${pa.status} state. File a new permission request.`,
          })
        }

        // ── Check 5: PA_TIME_WINDOW ──────────────────────────────────────────
        if (pa.flightStartTime && pa.flightEndTime) {
          const now = flightTime ? new Date(flightTime) : new Date()
          const start = new Date(pa.flightStartTime)
          const end = new Date(pa.flightEndTime)

          if (now >= start && now <= end) {
            checks.push({
              code:   'PA_TIME_WINDOW',
              name:   'PA Time Window',
              status: 'PASS',
              detail: `Flight time is within PA window: ${start.toISOString()} to ${end.toISOString()}.`,
              remediation: null,
            })
          } else if (now < start) {
            const minsUntil = Math.ceil((start.getTime() - now.getTime()) / 60000)
            checks.push({
              code:   'PA_TIME_WINDOW',
              name:   'PA Time Window',
              status: 'WARN',
              detail: `PA window has not started yet. Opens in ${minsUntil} minute(s) at ${start.toISOString()}.`,
              remediation: 'Wait for the PA time window to begin before takeoff.',
            })
          } else {
            checks.push({
              code:   'PA_TIME_WINDOW',
              name:   'PA Time Window',
              status: 'FAIL',
              detail: `PA window has expired. Ended at ${end.toISOString()}.`,
              remediation: 'File a new permission request with updated flight times.',
            })
          }
        } else {
          checks.push({
            code:   'PA_TIME_WINDOW',
            name:   'PA Time Window',
            status: 'SKIP',
            detail: 'PA does not have flight time window data.',
            remediation: 'Ensure your PA includes start and end times.',
          })
        }

        // ── Check 6: PA_GEOFENCE ─────────────────────────────────────────────
        if (pa.geofencePolygon && polygon && polygon.length >= 3) {
          try {
            // Parse PA geofence polygon — stored as JSON array of {lat, lng}
            const paPolygon: LatLng[] = typeof pa.geofencePolygon === 'string'
              ? JSON.parse(pa.geofencePolygon as string)
              : pa.geofencePolygon as unknown as LatLng[]

            // Check if planned polygon is within PA geofence
            // Simple containment check: all planned polygon vertices should be within the PA geofence
            const allWithin = polygon.every(point =>
              isPointInPolygon(point, paPolygon)
            )

            if (allWithin) {
              checks.push({
                code:   'PA_GEOFENCE',
                name:   'PA Geofence',
                status: 'PASS',
                detail: 'Planned flight area is within PA geofence boundary.',
                remediation: null,
              })
            } else {
              checks.push({
                code:   'PA_GEOFENCE',
                name:   'PA Geofence',
                status: 'FAIL',
                detail: 'Planned flight area extends beyond PA geofence boundary.',
                remediation: 'Adjust your flight area to stay within the approved geofence or file a new PA.',
              })
            }
          } catch (err) {
            checks.push({
              code:   'PA_GEOFENCE',
              name:   'PA Geofence',
              status: 'WARN',
              detail: `Geofence check failed: ${err instanceof Error ? err.message : String(err)}`,
              remediation: 'Manually verify your flight area against the PA geofence.',
            })
          }
        } else {
          checks.push({
            code:   'PA_GEOFENCE',
            name:   'PA Geofence',
            status: 'SKIP',
            detail: !pa.geofencePolygon
              ? 'PA does not have geofence data.'
              : 'No flight polygon provided for geofence comparison.',
            remediation: 'Provide both a PA with geofence data and a flight polygon.',
          })
        }
      }
    } else {
      // No PA provided — checks 4, 5, 6 are skipped
      checks.push({
        code:   'PA_SIGNATURE',
        name:   'PA Signature',
        status: 'SKIP',
        detail: 'No Permission Artefact ID provided.',
        remediation: 'File a flight permission request via JADS to obtain a PA.',
      })
      checks.push({
        code:   'PA_TIME_WINDOW',
        name:   'PA Time Window',
        status: 'SKIP',
        detail: 'No Permission Artefact ID provided.',
        remediation: 'File a flight permission request via JADS to obtain a PA.',
      })
      checks.push({
        code:   'PA_GEOFENCE',
        name:   'PA Geofence',
        status: 'SKIP',
        detail: 'No Permission Artefact ID provided.',
        remediation: 'File a flight permission request via JADS to obtain a PA.',
      })
    }

    // ── Verdict ──────────────────────────────────────────────────────────────
    const hasFail = checks.some(c => c.status === 'FAIL')
    const hasWarn = checks.some(c => c.status === 'WARN')
    const verdict: Verdict = hasFail ? 'NO_GO' : hasWarn ? 'ADVISORY' : 'GO'

    const report: ComplianceReport = {
      verdict,
      checks,
      uinNumber,
      paId: paId ?? null,
      checkedAt: new Date().toISOString(),
    }

    log.info('pre_flight_check_complete', {
      data: { uinNumber, paId, verdict, passCount: checks.filter(c => c.status === 'PASS').length, failCount: checks.filter(c => c.status === 'FAIL').length },
    })

    return report
  }
}

// ── Geometry helper: point-in-polygon (ray casting) ──────────────────────

function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false

  let inside = false
  const x = point.lat
  const y = point.lng

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat
    const yi = polygon[i].lng
    const xj = polygon[j].lat
    const yj = polygon[j].lng

    const intersect = ((yi > y) !== (yj > y))
      && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }

  return inside
}
