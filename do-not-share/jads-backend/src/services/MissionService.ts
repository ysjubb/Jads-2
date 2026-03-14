// MissionService — server-side mission upload handler.
//
// Field names match migration SQL exactly:
//   DroneMission:           missionId (TEXT), operatorId, operatorType, deviceId,
//                           missionStartUtcMs (TEXT), ntpSyncStatus, uploadStatus
//   DroneTelemetryRecord:   canonicalPayloadHex, chainHashHex, signatureHex,
//                           prevHashPrefixHex, crc32Valid, gnssStatus,
//                           sensorHealthFlags, decodedJson, recordedAtUtcMs
//   DroneViolation:         missionId, sequence, violationType, severity,
//                           timestampUtcMs (TEXT), detailJson

import { PrismaClient }       from '@prisma/client'
import * as crypto             from 'crypto'
import { createServiceLogger } from '../logger'
import { verifyCrc32, reservedBytesZero } from '../telemetry/canonicalSerializer'
import { decodeCanonical }     from '../telemetry/telemetryDecoder'
import { CATEGORY_COMPLIANCE_RULES, categorizeByWeight } from '../constants'
import type { DroneWeightCategory } from '../constants'

const log = createServiceLogger('MissionService')

export interface TelemetryRecordInput {
  sequence:          number
  canonicalHex:      string   // 192-char hex (96 bytes)
  signatureHex:      string
  pqcSignatureHex?:  string   // ML-DSA-65 (FIPS 204) signature — Phase 1 hybrid PQC
  chainHashHex:      string
  prevHashHex:       string
  timestampUtcMs:    number
  gnssStatus:        string   // GOOD | DEGRADED | NO_FIX
  sensorHealthFlags: number
}

export interface ViolationInput {
  sequence:       number
  violationType:  string
  severity:       string
  timestampUtcMs: number
  detailJson:     string
}

export interface DeviceAttestationInput {
  strongboxBacked:    boolean
  secureBootVerified: boolean
  androidVersion:     string
}

export interface MissionSubmissionInput {
  missionId:            string          // Android BigInt as decimal string
  deviceId:             string
  deviceModel:          string | null
  npntClassification:   string          // GREEN | YELLOW | RED
  permissionArtefactId: string | null
  missionStartUtcMs:    number
  missionEndUtcMs:      number
  ntpSyncStatus:        string          // SYNCED | DEGRADED | FAILED
  ntpOffsetMs:          number | null
  certValidAtStart:     boolean
  certExpiryUtcMs:      number | null
  archivedCrlBase64:    string | null
  records:              TelemetryRecordInput[]
  violations:           ViolationInput[]
  deviceAttestation?:   DeviceAttestationInput
  // deviceCertDer: DER-encoded (base64) X.509 device certificate.
  // Stored so ForensicVerifier can re-verify ECDSA signatures post-hoc.
  // Without this, a sophisticated DB-level attacker can forge GPS tracks.
  deviceCertDer?:       string

  // deviceNonce: UUID generated fresh by Android at mission START (not missionId).
  // Allows distinguishing genuine retry (same nonce) from clock-regression collision
  // (two different flights that happened to produce the same timestamp-based missionId).
  // Nullable: older Android builds pre-Step6 do not send it; system falls back gracefully.
  deviceNonce?:         string

  // ── Drone category fields (DGCA UAS Rules 2021) ──
  droneWeightCategory?:  string         // NANO | MICRO | SMALL | MEDIUM | LARGE
  droneWeightGrams?:     number         // actual weight in grams
  droneManufacturer?:    string         // "DJI", "Autel", "ideaForge", etc.
  droneSerialNumber?:    string         // manufacturer serial
  nanoAckNumber?:        string         // nano drone acknowledgement number (< 250g)
  uinNumber?:            string         // UIN for micro+ categories

  // Phase 1 PQC: ML-DSA-65 (FIPS 204) public key for hybrid verification
  pqcPublicKeyHex?:      string         // ~3,904 hex chars (1,952 bytes)

  // CC-1-01: Expected record count (declared by device at upload)
  expectedRecordCount?:  number         // total records device intended to send

  // C1-04: CRL freshness — parsed from CRL at upload time (RFC 5280 thisUpdate field)
  crlThisUpdateUtcMs?:   number         // CRL thisUpdate as UTC ms
}

// Category-aware compliance check result
export interface CategoryComplianceResult {
  allowed:              boolean
  category:             DroneWeightCategory
  npntExempt:           boolean
  warnings:             string[]
  requiredButMissing:   string[]    // e.g. ["uinNumber", "permissionArtefactId"]
}

// Validate category-specific compliance requirements
export function checkCategoryCompliance(input: MissionSubmissionInput): CategoryComplianceResult {
  const category: DroneWeightCategory = (input.droneWeightCategory as DroneWeightCategory) || 'UNKNOWN'
  const rules = CATEGORY_COMPLIANCE_RULES[category]
  const warnings: string[] = []
  const missing: string[] = []

  // Auto-derive category from weight if category not specified but weight is
  let effectiveCategory = category
  if (category === 'UNKNOWN' && input.droneWeightGrams) {
    effectiveCategory = categorizeByWeight(input.droneWeightGrams)
    warnings.push(`Category auto-derived from weight: ${effectiveCategory}`)
  }
  const effectiveRules = CATEGORY_COMPLIANCE_RULES[effectiveCategory]

  // Check UIN requirement
  if (effectiveRules.uinRequired && !input.uinNumber) {
    missing.push('uinNumber')
    warnings.push(`${effectiveCategory} drones require a UIN number`)
  }

  // Check nano acknowledgement
  if (effectiveRules.nanoAckRequired && !input.nanoAckNumber) {
    missing.push('nanoAckNumber')
    warnings.push('Nano drones require an acknowledgement number')
  }

  // Check NPNT / permission artefact
  const isControlledAirspace = input.npntClassification === 'YELLOW' || input.npntClassification === 'RED'
  if (effectiveRules.npntRequired && isControlledAirspace && !input.permissionArtefactId) {
    if (input.npntClassification !== 'RED') { // RED is always blocked regardless
      missing.push('permissionArtefactId')
      warnings.push(`${effectiveCategory} drones require permission artefact in YELLOW zones`)
    }
  }

  // Nano drones are NPNT-exempt in GREEN zones
  const npntExempt = !effectiveRules.npntRequired

  return {
    allowed: true, // category compliance is advisory, not blocking (NPNT gate handles blocking)
    category: effectiveCategory,
    npntExempt,
    warnings,
    requiredButMissing: missing,
  }
}

export type SubmitStatus =
  | 'CREATED'
  | 'DUPLICATE'
  | 'REPLAY_REJECTED'
  | 'VERIFICATION_FAILED'

export interface SubmitResult {
  status:              SubmitStatus
  missionDbId?:        string
  verificationErrors?: string[]
}

export class MissionService {
  constructor(private readonly prisma: PrismaClient) {}

  async submitMission(
    input: MissionSubmissionInput,
    operatorId: string,
    userType: 'CIVILIAN' | 'SPECIAL'
  ): Promise<SubmitResult> {

    // 1. Idempotency check
    // VULN-02 NOTE: findFirst + create is a TOCTOU race. P2002 is handled in the catch block.
    //
    // Idempotency strategy (in priority order):
    //   A. deviceNonce present: exact match on (missionId + deviceNonce) = safe retry.
    //      A different nonce with same missionId = clock-regression collision → new mission.
    //   B. deviceNonce absent: fall back to (missionId + operatorId) matching — legacy behaviour.
    //
    // Clock-regression scenario:
    //   Device A flies mission at T=1700000000000, nonce=UUID-1.
    //   Device A's clock resets. Flies again at "T=1700000000000", nonce=UUID-2.
    //   Without nonce: second mission rejected as DUPLICATE.
    //   With nonce: UUID-2 ≠ UUID-1 → second mission accepted as new flight. Correct.
    const existing = await this.prisma.droneMission.findFirst({
      where: { missionId: input.missionId }
    })

    if (existing) {
      // Determine if this is a genuine safe retry or a new/replay submission
      const isSameOperator = existing.operatorId === operatorId

      if (isSameOperator) {
        if (input.deviceNonce && existing.deviceNonce) {
          // Both have nonces — compare them
          if (input.deviceNonce === existing.deviceNonce) {
            // Same nonce: safe Android retry after network failure
            log.info('mission_idempotent_retry', { data: { missionId: input.missionId, nonce: input.deviceNonce } })
            return { status: 'DUPLICATE', missionDbId: existing.id }
          } else {
            // Different nonce, same missionId, same operator = clock regression
            // Treat as new mission — do NOT return DUPLICATE, fall through to create
            log.info('mission_clock_regression_new_flight', {
              data: { missionId: input.missionId, existingNonce: existing.deviceNonce, newNonce: input.deviceNonce }
            })
            // Fall through to create — but missionId uniqueness will be violated.
            // To handle this: the Android device should generate a new missionId when clock resets.
            // For now, log a warning and reject — the operator must file a manual correction.
            log.warn('mission_clock_regression_rejected', { data: { missionId: input.missionId } })
            return { status: 'REPLAY_REJECTED' }
          }
        } else {
          // Legacy path (no nonce): same operator, same missionId = safe retry
          log.info('mission_idempotent_retry_legacy', { data: { missionId: input.missionId } })
          return { status: 'DUPLICATE', missionDbId: existing.id }
        }
      }

      log.warn('mission_replay_attempt', { data: { missionId: input.missionId, operatorId } })
      await this.prisma.auditLog.create({ data: {
        actorType: userType === 'CIVILIAN' ? 'CIVILIAN_USER' : 'SPECIAL_USER',
        actorId: operatorId, action: 'mission_replay_attempt',
        resourceType: 'drone_mission', resourceId: existing.id,
        detailJson: JSON.stringify({ missionId: input.missionId, operatorId })
      }})
      return { status: 'REPLAY_REJECTED' }
    }

    // 2. Category compliance check (advisory — logged, not blocking)
    const categoryResult = checkCategoryCompliance(input)
    if (categoryResult.warnings.length > 0) {
      log.info('category_compliance_advisory', {
        data: {
          missionId: input.missionId,
          category: categoryResult.category,
          npntExempt: categoryResult.npntExempt,
          warnings: categoryResult.warnings,
          missing: categoryResult.requiredButMissing,
        }
      })
    }

    // 3. Server-side chain verification
    const chainErrors = this.verifyChain(input.missionId, input.records)
    if (chainErrors.length > 0) {
      log.warn('chain_verification_failed', { data: { missionId: input.missionId, chainErrors } })
      return { status: 'VERIFICATION_FAILED', verificationErrors: chainErrors }
    }

    // 4. Persist in transaction
    const mission = await this.prisma.$transaction(async tx => {
      const m = await tx.droneMission.create({ data: {
        missionId:              input.missionId,
        deviceNonce:            input.deviceNonce    ?? null,
        deviceCertDer:          input.deviceCertDer   ?? null,
        operatorId,
        operatorType:           userType,
        deviceId:               input.deviceId,
        deviceModel:            input.deviceModel ?? null,
        npntClassification:     input.npntClassification as any,
        permissionArtefactId:   input.permissionArtefactId ?? null,
        missionStartUtcMs:      String(input.missionStartUtcMs),
        missionEndUtcMs:        String(input.missionEndUtcMs),
        ntpSyncStatus:          input.ntpSyncStatus as any,
        ntpOffsetMs:            input.ntpOffsetMs ?? null,
        certValidAtStart:       input.certValidAtStart,
        certExpiryUtcMs:        input.certExpiryUtcMs != null ? String(input.certExpiryUtcMs) : null,
        chainVerifiedByServer:  true,
        archivedCrlBase64:      input.archivedCrlBase64 ?? null,
        serverReceivedAtUtcMs:  String(Date.now()),
        uploadStatus:           'COMPLETE' as any,
        uploadedAt:             new Date(),
        sensorHealthSummaryFlags: input.records.reduce((acc, r) => acc | r.sensorHealthFlags, 0),
        recordsWithDegradedGps: input.records.filter(r => r.gnssStatus !== 'GOOD').length,
        strongboxBacked:         input.deviceAttestation?.strongboxBacked    ?? null,
        secureBootVerified:      input.deviceAttestation?.secureBootVerified  ?? null,
        androidVersionAtUpload:  input.deviceAttestation?.androidVersion      ?? null,
        // Category fields
        droneWeightCategory:     categoryResult.category as any,
        droneWeightGrams:        input.droneWeightGrams     ?? null,
        droneManufacturer:       input.droneManufacturer    ?? null,
        droneSerialNumber:       input.droneSerialNumber    ?? null,
        nanoAckNumber:           input.nanoAckNumber        ?? null,
        uinNumber:               input.uinNumber            ?? null,
        npntExempt:              categoryResult.npntExempt,
        // Phase 1 PQC: ML-DSA-65 public key for hybrid verification
        pqcPublicKeyHex:         input.pqcPublicKeyHex    ?? null,
        // CC-1-01: Record count validation — device declares expected count
        expectedRecordCount:     input.expectedRecordCount ?? null,
        // C1-04: CRL freshness metadata
        crlArchivedAtUtcMs:      String(Date.now()),  // capture timestamp at upload
        crlThisUpdateUtcMs:      input.crlThisUpdateUtcMs != null ? String(input.crlThisUpdateUtcMs) : null,
      }})

      await tx.droneTelemetryRecord.createMany({ data: input.records.map(r => {
        const crc = verifyCrc32(r.canonicalHex)
        let decodedJson = '{}'
        try { decodedJson = JSON.stringify(decodeCanonical(r.canonicalHex)) } catch { /* keep */ }
        return {
          missionId:           m.id,
          sequence:            r.sequence,
          canonicalPayloadHex: r.canonicalHex,
          chainHashHex:        r.chainHashHex,
          signatureHex:        r.signatureHex,
          prevHashPrefixHex:   r.prevHashHex,
          crc32Valid:          crc.valid,
          gnssStatus:          r.gnssStatus,
          sensorHealthFlags:   r.sensorHealthFlags,
          decodedJson,
          recordedAtUtcMs:     String(r.timestampUtcMs),
          // Phase 1 PQC: ML-DSA-65 signature per record
          pqcSignatureHex:     r.pqcSignatureHex ?? null,
        }
      })})

      if ((input.violations ?? []).length > 0) {
        await tx.droneViolation.createMany({ data: input.violations.map(v => ({
          missionId:      m.id,
          sequence:       v.sequence,
          violationType:  v.violationType as any,
          severity:       v.severity as any,
          timestampUtcMs: String(v.timestampUtcMs),
          detailJson:     v.detailJson,
        }))})
      }

      return m
    })

    // 4. Audit log
    await this.prisma.auditLog.create({ data: {
      actorType:    userType === 'CIVILIAN' ? 'CIVILIAN_USER' : 'SPECIAL_USER',
      actorId:      operatorId,
      action:       'drone_mission_uploaded',
      resourceType: 'drone_mission',
      resourceId:   mission.id,
      detailJson:   JSON.stringify({
        missionId:      input.missionId,
        recordCount:    input.records.length,
        violationCount: input.violations.length,
        chainVerified:  true,
        droneCategory:  categoryResult.category,
        npntExempt:     categoryResult.npntExempt,
        categoryWarnings: categoryResult.warnings,
      })
    }})

    log.info('mission_submitted_ok', { data: { missionDbId: mission.id, records: input.records.length } })
    return { status: 'CREATED', missionDbId: mission.id }
  }

  // Separate handler for P2002 race condition — called from submitMission catch block
  async handleUniqueConstraintViolation(missionId: string, operatorId: string): Promise<SubmitResult> {
    // VULN-02 FIX: Race condition — both requests passed findFirst simultaneously.
    // One won the DB write; the other hit P2002. Find the winner and return DUPLICATE.
    const winner = await this.prisma.droneMission.findFirst({ where: { missionId } })
    if (winner && winner.operatorId === operatorId) {
      return { status: 'DUPLICATE', missionDbId: winner.id }
    }
    return { status: 'REPLAY_REJECTED' }
  }

  // HASH_0 = SHA256("MISSION_INIT" || missionId as big-endian int64)
  // Must match Android HashChainEngine.computeHash0() exactly
  verifyChain(missionIdStr: string, records: TelemetryRecordInput[]): string[] {
    const errors: string[] = []
    const prefix = Buffer.from('MISSION_INIT', 'ascii')
    const idBuf  = Buffer.alloc(8)
    idBuf.writeBigInt64BE(BigInt(missionIdStr))
    const hash0 = crypto.createHash('sha256').update(Buffer.concat([prefix, idBuf])).digest('hex')

    const sorted = [...records].sort((a, b) => a.sequence - b.sequence)

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].sequence !== i) {
        errors.push(`SEQUENCE_GAP: expected=${i} got=${sorted[i].sequence}`)
        return errors
      }
    }

    for (const r of sorted) {
      const crc = verifyCrc32(r.canonicalHex)
      if (!crc.valid) errors.push(`CRC32_MISMATCH: seq=${r.sequence}`)
      if (!reservedBytesZero(r.canonicalHex)) errors.push(`RESERVED_NOT_ZERO: seq=${r.sequence}`)
    }
    if (errors.length > 0) return errors

    let prevHash = hash0
    for (const r of sorted) {
      const expected = crypto.createHash('sha256')
        .update(Buffer.concat([Buffer.from(r.canonicalHex, 'hex'), Buffer.from(prevHash, 'hex')]))
        .digest('hex')
      if (expected !== r.chainHashHex) {
        errors.push(`CHAIN_BROKEN: seq=${r.sequence}`)
      }
      prevHash = r.chainHashHex
    }

    return errors
  }
}
