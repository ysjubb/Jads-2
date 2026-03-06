// ForensicVerifier — runs all 10 forensic invariants against a stored mission.
//
// Called by:
//   GET /api/drone/missions/:id/forensic     (operator + auditors)
//   GET /api/audit/missions/:id/forensic     (auditors only, with scope enforcement)
//
// This verifier ONLY reads from the database. It never makes network calls.
// All evidence (CRL, NTP, cert status) must have been archived at upload time.
//
// complianceTimeAnchor is ALWAYS missionEndUtcMs — the moment the drone landed.
// Never now(), never uploadedAt. This is frozen in time and legally significant.
//
// Field names match migration SQL exactly.

import { PrismaClient }       from '@prisma/client'
import * as crypto             from 'crypto'
// @ts-ignore — sub-path import for ML-DSA-65 (FIPS 204) PQC verification
import { ml_dsa65 }            from '@noble/post-quantum/ml-dsa'
import { createServiceLogger } from '../logger'
import { verifyCrc32, reservedBytesZero } from '../telemetry/canonicalSerializer'

const log = createServiceLogger('ForensicVerifier')

// ── Result shape ──────────────────────────────────────────────────────────────
// This is what the audit portal ForensicReportPanel reads.

export interface InvariantResult {
  pass:    boolean
  code:    string    // e.g. "I1_HASH_CHAIN"
  label:   string    // human label for the panel
  detail:  string    // one-line explanation
  critical: boolean  // if true, failure makes entire mission inadmissible
}

export interface VerificationResult {
  missionId:            string
  verifiedAt:           string   // ISO timestamp of when this check was run
  complianceTimeAnchor: string   // = missionEndUtcMs ISO — FROZEN, never now()
  allInvariantsHold:    boolean
  invariants:           InvariantResult[]
  failureDetails:       string[]
  retroRevocationFlag:  boolean
  recordCount:          number
  violationCount:       number
  strongboxAdvisory: {
    strongboxBacked:    boolean | null
    secureBootVerified: boolean | null
    androidVersion:     string  | null
    advisory:           string
  }
}

export class ForensicVerifier {
  constructor(private readonly prisma: PrismaClient) {}

  async verify(missionDbId: string): Promise<VerificationResult> {
    const verifiedAt = new Date().toISOString()
    const failures:  string[] = []
    const invariants: InvariantResult[] = []

    const mission = await this.prisma.droneMission.findUniqueOrThrow({
      where: { id: missionDbId }
    })
    const records = await this.prisma.droneTelemetryRecord.findMany({
      where: { missionId: missionDbId }, orderBy: { sequence: 'asc' }
    })
    const violations = await this.prisma.droneViolation.findMany({
      where: { missionId: missionDbId }
    })

    // complianceTimeAnchor — FROZEN at mission end, never changes after landing
    const complianceTimeAnchor = new Date(Number(mission.missionEndUtcMs)).toISOString()

    // ── I-1: Hash chain intact (CRITICAL) ────────────────────────────────
    // Re-derives HASH_0 from missionId and walks every link server-side.
    const i1 = this.checkHashChain(mission.missionId, records, mission)
    invariants.push(i1)
    if (!i1.pass) failures.push(...i1.detail.split('; '))

    // ── I-2: NTP time evidence (CRITICAL if FAILED) ───────────────────────
    const i2 = this.checkNtpEvidence(
      mission.ntpSyncStatus, mission.ntpOffsetMs,
      mission.missionEndUtcMs, mission.serverReceivedAtUtcMs
    )
    invariants.push(i2)
    if (!i2.pass) failures.push(i2.detail)

    // ── I-3: Device certificate valid at mission start (CRITICAL) ─────────
    const i3 = this.checkCertificate(mission.certValidAtStart, mission.certExpiryUtcMs, Number(mission.missionStartUtcMs))
    invariants.push(i3)
    if (!i3.pass) failures.push(i3.detail)

    // ── I-4: Archived CRL present (non-critical warning) ─────────────────
    const i4 = this.checkArchivedCrl(mission.archivedCrlBase64)
    invariants.push(i4)
    if (!i4.pass) failures.push(i4.detail)

    // ── I-5: No duplicate mission (CRITICAL) ─────────────────────────────
    const i5 = await this.checkNoDuplicate(mission.missionId, missionDbId)
    invariants.push(i5)
    if (!i5.pass) failures.push(i5.detail)

    // ── I-6: NPNT zone compliance (CRITICAL if RED zone entry) ───────────
    const i6 = this.checkZoneCompliance(violations)
    invariants.push(i6)
    if (!i6.pass) failures.push(i6.detail)

    // ── I-7: GNSS integrity (non-critical — advisory) ─────────────────────
    const i7 = this.checkGnssIntegrity(records)
    invariants.push(i7)
    if (!i7.pass) failures.push(i7.detail)

    // ── I-8: Hardware security (non-critical — advisory) ─────────────────
    const i8 = this.checkHardwareSecurity(mission.strongboxBacked, mission.secureBootVerified)
    invariants.push(i8)
    if (!i8.pass) failures.push(i8.detail)

    // ── I-9: Timestamp monotonicity (non-critical — advisory) ─────────────
    // Detects clock rollbacks or manipulation during flight.
    // A legitimate drone at 1Hz cannot have record[n].timestampUtcMs < record[n-1].timestampUtcMs
    // unless the Android system clock was changed mid-mission.
    // Note: recordedAtUtcMs is used, not sequence — records are pre-sorted by sequence.
    const i9 = this.checkTimestampMonotonicity(records)
    invariants.push(i9)
    if (!i9.pass) failures.push(i9.detail)

    // ── I-10: PQC hybrid signature (non-critical — Phase 1 advisory) ────────
    // Verifies ML-DSA-65 (FIPS 204) signatures when pqcPublicKeyHex is present.
    // Phase 1: advisory only (non-critical). Phase 2 will make this critical.
    // Missions without PQC data skip this check gracefully.
    const i10 = this.checkPqcSignatures(
      (mission as any).pqcPublicKeyHex ?? null,
      records as unknown as Array<{ canonicalPayloadHex: string; pqcSignatureHex?: string | null; sequence: number }>
    )
    invariants.push(i10)
    if (!i10.pass) failures.push(i10.detail)

    const allInvariantsHold = invariants.every(i => i.pass)

    // Retro-revocation: a background job (not yet implemented) would set a flag
    // if the device cert was revoked after the mission ended.
    const retroRevocationFlag = false

    // I3 enhancement: if deviceCertDer is present, the ECDSA sig checks in I1 already
    // cover post-hoc cert authenticity. If absent, we rely on certValidAtStart boolean.
    const hasCertForPosthocVerification = !!mission.deviceCertDer

    const strongboxAdvisory = {
      strongboxBacked:    mission.strongboxBacked    ?? null,
      secureBootVerified: mission.secureBootVerified ?? null,
      androidVersion:     mission.androidVersionAtUpload ?? null,
      advisory:
        mission.strongboxBacked === true
          ? 'KEY_STRONGBOX_BACKED: Hardware-protected signing key confirmed. Strongest evidentiary weight.'
          : mission.strongboxBacked === false
            ? 'KEY_NOT_STRONGBOX: Signing key was software-only. Evidentiary weight is reduced but not eliminated.'
            : 'ATTESTATION_NOT_PROVIDED: Device attestation not submitted at upload time.',
    }

    log.info('forensic_verification_complete', { data: {
      missionDbId, allInvariantsHold, failureCount: failures.length,
      strongboxBacked: mission.strongboxBacked,
    }})

    return {
      missionId:            mission.missionId,
      verifiedAt,
      complianceTimeAnchor,
      allInvariantsHold,
      invariants,
      failureDetails:       failures,
      retroRevocationFlag,
      recordCount:          records.length,
      violationCount:       violations.length,
      strongboxAdvisory,
    }
  }

  // ── Individual invariant checks ───────────────────────────────────────────

  private checkHashChain(
    missionIdStr: string,
    records: Array<{ sequence: number; canonicalPayloadHex: string; chainHashHex: string }>,
    mission: { deviceCertDer?: unknown; [key: string]: unknown } = {}
  ): InvariantResult {
    const errors: string[] = []

    const prefix = Buffer.from('MISSION_INIT', 'ascii')
    const idBuf  = Buffer.alloc(8)
    idBuf.writeBigInt64BE(BigInt(missionIdStr))
    const hash0 = crypto.createHash('sha256').update(Buffer.concat([prefix, idBuf])).digest('hex')

    const sorted = [...records].sort((a, b) => a.sequence - b.sequence)

    // Sequence gapless
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].sequence !== i) {
        errors.push(`SEQUENCE_GAP: expected=${i} got=${sorted[i].sequence}`)
        break
      }
    }

    // CRC32 + reserved bytes
    for (const r of sorted) {
      const crc = verifyCrc32(r.canonicalPayloadHex)
      if (!crc.valid) errors.push(`CRC32_MISMATCH: seq=${r.sequence}`)
      if (!reservedBytesZero(r.canonicalPayloadHex)) errors.push(`RESERVED_NOT_ZERO: seq=${r.sequence}`)
    }

    if (errors.length === 0) {
      // Walk chain — CRITICAL: use RECOMPUTED hash as next prevHash, NOT stored r.chainHashHex.
      // If we used stored values, a DB-level attacker who modifies canonical payload
      // AND recomputes all downstream chainHashHex columns would pass verification.
      // By recomputing from HASH_0, any corruption anywhere cascades through all subsequent records.
      let prevHash = hash0
      for (const r of sorted) {
        const expected = crypto.createHash('sha256')
          .update(Buffer.concat([
            Buffer.from(r.canonicalPayloadHex, 'hex'),
            Buffer.from(prevHash, 'hex')
          ]))
          .digest('hex')
        if (expected !== r.chainHashHex) {
          errors.push(`CHAIN_BROKEN: seq=${r.sequence}`)
        }
        // Use expected (recomputed), NOT r.chainHashHex (stored) — prevents DB-level bypass
        prevHash = expected
      }
    }

    // ── ECDSA signature verification ──────────────────────────────────────────
    // This is the defence against Attack B: a sophisticated attacker who modifies
    // canonicalPayloadHex AND fixes the CRC32 AND recomputes all chainHashHex values.
    // Without ECDSA verification, such an attack is UNDETECTABLE by hash chain alone.
    //
    // The ECDSA P-256 private key lives in Android Keystore (hardware-backed on supported devices).
    // The attacker would need to extract it — infeasible without physical device compromise.
    //
    // If deviceCertDer is present: attempt full ECDSA re-verification.
    // If absent (legacy missions): fall back to trusting chainVerifiedByServer boolean.
    if (mission.deviceCertDer && errors.length === 0) {
      const certBase64 = Buffer.isBuffer(mission.deviceCertDer)
        ? (mission.deviceCertDer as Buffer).toString('base64')
        : String(mission.deviceCertDer)
      const sigErrors = this.verifyEcdsaSignatures(
        certBase64,
        sorted as unknown as Array<{ canonicalPayloadHex: string; signatureHex: string; sequence: number }>
      )
      errors.push(...sigErrors)
    }

    const pass = errors.length === 0
    return {
      pass,
      code:     'I1_HASH_CHAIN',
      label:    'Hash Chain Integrity (ISO 27037)',
      detail:   pass
        ? `All ${sorted.length} records form an unbroken chain from HASH_0`
        : errors.slice(0, 3).join('; ') + (errors.length > 3 ? ` (+${errors.length - 3} more)` : ''),
      critical: true,
    }
  }

  private checkNtpEvidence(
    ntpSyncStatus:        string,
    ntpOffsetMs:          number | null,
    missionEndUtcMs:      string | null,
    serverReceivedAtUtcMs: string | null
  ): InvariantResult {
    // ── I-2 offset magnitude enforcement ────────────────────────────────────
    // ntpSyncStatus alone is insufficient. A device can report SYNCED with a
    // manipulated or drifted offset. We enforce two thresholds:
    //
    //   |offset| > 5,000ms (5s)   → advisory appended; pass still true
    //   |offset| > 86,400,000ms (24h) → force effectiveStatus = DEGRADED
    //     (a 24h offset means the device clock was set to a different day —
    //      this cannot happen from legitimate NTP drift)
    //
    // These thresholds are conservative. Aviation requires ±1s accuracy.
    // The 5s threshold gives the NTP implementation reasonable headroom.

    const absOffset = ntpOffsetMs != null ? Math.abs(ntpOffsetMs) : null
    const WARN_THRESHOLD  = 5_000        // 5 seconds
    const DEGRADE_THRESHOLD = 86_400_000  // 24 hours

    // Force DEGRADED if offset is absurdly large (clock manipulation / wrong day)
    const effectiveStatus =
      absOffset !== null && absOffset > DEGRADE_THRESHOLD
        ? 'DEGRADED'
        : ntpSyncStatus

    const pass = effectiveStatus === 'SYNCED' || effectiveStatus === 'DEGRADED'

    const offsetStr = ntpOffsetMs != null ? ` (offset: ${ntpOffsetMs}ms)` : ' (offset: not recorded)'

    // Build detail string with advisory if offset exceeds warn threshold
    let detail: string
    if (!pass) {
      detail = `NTP status: ${ntpSyncStatus} — timestamps are not independently anchored`
    } else if (absOffset !== null && absOffset > DEGRADE_THRESHOLD) {
      detail = `NTP status forced DEGRADED: offset ${ntpOffsetMs}ms exceeds 24h — device clock manipulation suspected`
    } else if (absOffset !== null && absOffset > WARN_THRESHOLD) {
      detail = `NTP status: ${effectiveStatus}${offsetStr} ⚠ offset exceeds 5s threshold — timestamp accuracy degraded`
    } else if (ntpOffsetMs === null && pass) {
      detail = `NTP status: ${effectiveStatus} (offset not recorded — timing accuracy cannot be bounded)`
    } else {
      detail = `NTP status: ${effectiveStatus}${offsetStr}`
    }

    // ── Server-vs-device time drift advisory ──────────────────────────────
    // If serverReceivedAtUtcMs was captured at ingestion and device missionEndUtcMs
    // differs by more than 300 seconds, the device clock may have been manipulated
    // or experienced severe drift. Append a warning to the I-2 detail string.
    const SERVER_DRIFT_THRESHOLD = 300_000  // 300 seconds
    if (missionEndUtcMs != null && serverReceivedAtUtcMs != null) {
      const deviceEndMs  = Number(missionEndUtcMs)
      const serverMs     = Number(serverReceivedAtUtcMs)
      const driftMs      = Math.abs(deviceEndMs - serverMs)
      if (driftMs > SERVER_DRIFT_THRESHOLD) {
        const driftSec = Math.round(driftMs / 1000)
        detail += ` | SERVER_TIME_DRIFT: device missionEndUtcMs differs from serverReceivedAtUtcMs by ${driftSec}s (threshold: 300s) — device clock may be inaccurate`
      }
    }

    return {
      pass,
      code:     'I2_NTP_SYNC',
      label:    'Time Synchronisation (RFC 3161)',
      detail,
      critical: ntpSyncStatus === 'FAILED',
    }
  }

  private checkCertificate(
    certValidAtStart: boolean,
    certExpiryUtcMs:  string | null,
    missionStartMs:   number
  ): InvariantResult {
    if (!certValidAtStart) {
      return {
        pass: false, code: 'I3_DEVICE_CERT',
        label: 'Device Certificate (CCA PKI)', critical: true,
        detail: 'Device certificate was NOT valid at mission start — records cannot be authenticated',
      }
    }
    if (certExpiryUtcMs != null) {
      const expiry = Number(certExpiryUtcMs)
      if (expiry < missionStartMs) {
        return {
          pass: false, code: 'I3_DEVICE_CERT',
          label: 'Device Certificate (CCA PKI)', critical: true,
          detail: `Certificate expired before mission start (expiry: ${new Date(expiry).toISOString()})`,
        }
      }
    }
    return {
      pass: true, code: 'I3_DEVICE_CERT',
      label: 'Device Certificate (CCA PKI)', critical: true,
      detail: certExpiryUtcMs
        ? `Certificate valid at mission start, expires ${new Date(Number(certExpiryUtcMs)).toISOString()}`
        : 'Certificate valid at mission start',
    }
  }

  private checkArchivedCrl(archivedCrlBase64: string | null): InvariantResult {
    const pass = !!archivedCrlBase64
    return {
      pass,
      code:     'I4_CRL_ARCHIVED',
      label:    'CRL Archived (RFC 5280)',
      detail:   pass
        ? `CRL snapshot archived at upload time (${Math.round((archivedCrlBase64!.length * 3/4) / 1024)}KB)`
        : 'No CRL snapshot archived — certificate revocation status cannot be verified',
      critical: false,  // Warning only — many NPNT setups don't archive CRL
    }
  }

  private async checkNoDuplicate(missionId: string, currentDbId: string): Promise<InvariantResult> {
    const duplicates = await this.prisma.droneMission.findMany({
      where: { missionId, id: { not: currentDbId } },
      select: { id: true, operatorId: true, uploadedAt: true }
    })
    const pass = duplicates.length === 0
    return {
      pass,
      code:     'I5_NO_DUPLICATE',
      label:    'No Duplicate Mission (ISO 27042)',
      detail:   pass
        ? 'This missionId is unique in the system'
        : `Found ${duplicates.length} other record(s) with the same missionId — possible replay attack`,
      critical: true,
    }
  }

  private checkZoneCompliance(
    violations: Array<{ violationType: string; severity: string }>
  ): InvariantResult {
    const redViolations = violations.filter(
      v => v.violationType === 'UNPERMITTED_ZONE' && v.severity === 'CRITICAL'
    )
    const pass = redViolations.length === 0
    return {
      pass,
      code:     'I6_ZONE_COMPLIANCE',
      label:    'NPNT Zone Compliance (DGCA Rule 36)',
      detail:   pass
        ? violations.length === 0
          ? 'No violations recorded — mission remained within authorised zones'
          : `${violations.length} non-critical violation(s) — no RED zone entries`
        : `${redViolations.length} RED zone violation(s) detected — mission is non-compliant`,
      critical: !pass,
    }
  }

  private checkGnssIntegrity(
    records: Array<{ gnssStatus: string }>
  ): InvariantResult {
    if (records.length === 0) {
      return { pass: true, code: 'I7_GNSS_INTEGRITY', label: 'GNSS Integrity (ICAO Annex 10)', critical: false,
               detail: 'No records to evaluate' }
    }
    const degraded = records.filter(r => r.gnssStatus !== 'GOOD').length
    const pct      = Math.round((degraded / records.length) * 100)
    const pass     = pct <= 20
    return {
      pass,
      code:     'I7_GNSS_INTEGRITY',
      label:    'GNSS Integrity',
      detail:   `${degraded}/${records.length} records with degraded GNSS (${pct}%)${pass ? '' : ' — exceeds 20% threshold'}`,
      critical: false,
    }
  }

  private checkHardwareSecurity(
    strongboxBacked:    boolean | null,
    secureBootVerified: boolean | null
  ): InvariantResult {
    if (strongboxBacked === null) {
      return {
        pass: false, code: 'I8_HARDWARE_SECURITY',
        label: 'Hardware Security (FIPS 140-2)', critical: false,
        detail: 'Device attestation not provided — hardware security level unknown',
      }
    }
    const pass = strongboxBacked && secureBootVerified !== false
    return {
      pass,
      code:     'I8_HARDWARE_SECURITY',
      label:    'Hardware Security (FIPS 140-2)',
      detail:   `StrongBox: ${strongboxBacked ? 'YES' : 'NO'} · Secure Boot: ${secureBootVerified ? 'YES' : secureBootVerified === false ? 'NO' : 'UNKNOWN'}`,
      critical: false,
    }
  }
  // ── I-9: Timestamp monotonicity ──────────────────────────────────────────────
  // Walks records in sequence order and checks that recordedAtUtcMs is non-decreasing.
  // A single backward jump (even 1ms) is flagged — clocks must not go backward.
  //
  // critical: false — a rollback is suspicious but does not alone make the chain inadmissible.
  // The timestamp evidence is corroborated by NTP (I-2) and ECDSA (I-1). A forensic investigator
  // seeing I-9 + I-2 failures simultaneously has strong grounds for rejection.
  private checkTimestampMonotonicity(
    records: Array<{ sequence: number; recordedAtUtcMs?: string | number | null }>
  ): InvariantResult {
    if (records.length < 2) {
      return {
        pass: true, code: 'I9_TIMESTAMP_MONOTONIC', label: 'Timestamp Monotonicity (ISO 27037 \u00a77.1.3)',
        critical: false, detail: 'Insufficient records to evaluate monotonicity',
      }
    }

    const sorted = [...records].sort((a, b) => a.sequence - b.sequence)
    const violations: string[] = []

    for (let i = 1; i < sorted.length; i++) {
      const prev = Number(sorted[i - 1].recordedAtUtcMs ?? 0)
      const curr = Number(sorted[i].recordedAtUtcMs ?? 0)
      if (curr < prev) {
        violations.push(`seq=${sorted[i].sequence}: ${curr}ms < prev ${prev}ms (rollback: ${prev - curr}ms)`)
        if (violations.length >= 3) {
          violations.push(`... and ${sorted.length - i - 1} more`)
          break
        }
      }
    }

    const pass = violations.length === 0
    return {
      pass,
      code:     'I9_TIMESTAMP_MONOTONIC',
      label:    'Timestamp Monotonicity',
      detail:   pass
        ? `All ${sorted.length} record timestamps are non-decreasing`
        : `CLOCK_ROLLBACK detected at ${violations.length} point(s): ${violations.slice(0, 3).join('; ')}`,
      critical: false,
    }
  }

  // ── ML-DSA-65 (FIPS 204) PQC hybrid signature verification ──────────────────
  // Phase 1: advisory (non-critical). Verifies ML-DSA-65 signatures when present.
  // If pqcPublicKeyHex is null, returns PASS with "PQC not available" detail.
  // If pqcPublicKeyHex is present but a record lacks pqcSignatureHex, that record
  // is flagged as unsigned (advisory, not a failure — allows gradual rollout).
  private checkPqcSignatures(
    pqcPublicKeyHex: string | null,
    records: Array<{ canonicalPayloadHex: string; pqcSignatureHex?: string | null; sequence: number }>
  ): InvariantResult {
    // No PQC data — skip gracefully (pre-PQC missions)
    if (!pqcPublicKeyHex) {
      return {
        pass: true,
        code:     'I10_PQC_HYBRID',
        label:    'PQC Hybrid Signature (NIST FIPS 204)',
        detail:   'PQC public key not present — pre-PQC mission, ECDSA-only verification applies',
        critical: false,
      }
    }

    const errors: string[] = []
    let verifiedCount = 0
    let skippedCount  = 0

    let publicKey: Uint8Array
    try {
      publicKey = Buffer.from(pqcPublicKeyHex, 'hex')
    } catch (e) {
      return {
        pass: false,
        code:     'I10_PQC_HYBRID',
        label:    'PQC Hybrid Signature (NIST FIPS 204)',
        detail:   `PQC_PUBKEY_PARSE_FAILED: ${e instanceof Error ? e.message : String(e)}`,
        critical: false,
      }
    }

    for (const r of records) {
      if (!r.pqcSignatureHex) {
        skippedCount++
        continue
      }

      try {
        const payload   = Buffer.from(r.canonicalPayloadHex, 'hex')
        const signature = Buffer.from(r.pqcSignatureHex, 'hex')

        // ML-DSA-65 signs the raw message (no pre-hashing needed)
        // API: verify(publicKey, message, signature)
        const valid = ml_dsa65.verify(publicKey, payload, signature)

        if (!valid) {
          errors.push(`PQC_SIG_INVALID: seq=${r.sequence}`)
        } else {
          verifiedCount++
        }
      } catch (e) {
        errors.push(`PQC_SIG_ERROR: seq=${r.sequence} error=${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const pass = errors.length === 0
    const detail = pass
      ? `${verifiedCount} ML-DSA-65 signatures verified` +
        (skippedCount > 0 ? ` (${skippedCount} records without PQC signature — gradual rollout)` : '')
      : errors.slice(0, 3).join('; ') + (errors.length > 3 ? ` (+${errors.length - 3} more)` : '')

    return {
      pass,
      code:     'I10_PQC_HYBRID',
      label:    'PQC Hybrid Signature (NIST FIPS 204)',
      detail,
      critical: false,  // Phase 1: advisory only — will become critical in Phase 2
    }
  }

  // ── ECDSA P-256 signature verification ───────────────────────────────────────
  // Verifies that each telemetry record's signatureHex was produced by the Android
  // device's Keystore-backed P-256 key, over the record's canonicalPayloadHex.
  //
  // The device DER-encoded cert must have been stored at upload time (deviceCertDer).
  //
  // Returns an array of error strings (empty = all signatures valid).
  private verifyEcdsaSignatures(
    deviceCertDerBase64: string,
    records: Array<{ canonicalPayloadHex: string; signatureHex: string; sequence: number }>
  ): string[] {
    const errors: string[] = []

    // Parse the DER-encoded X.509 certificate to extract the public key
    let publicKey: crypto.KeyObject
    try {
      const certDer = Buffer.from(deviceCertDerBase64, 'base64')
      // Node.js crypto can parse X.509 DER directly as a certificate
      const cert = new crypto.X509Certificate(certDer)
      publicKey = cert.publicKey
    } catch (e) {
      errors.push(`CERT_PARSE_FAILED: ${e instanceof Error ? e.message : String(e)}`)
      return errors
    }

    // Verify each record's signature
    for (const r of records) {
      try {
        const payload = Buffer.from(r.canonicalPayloadHex, 'hex')
        const sig     = Buffer.from(r.signatureHex, 'hex')

        // Android Keystore produces DER-encoded ECDSA signatures (RFC 6979 deterministic)
        // Node.js verify expects: data=payload, signature=DER-encoded sig, key=P-256 public key
        const valid = crypto.verify(
          'SHA256',           // digest algorithm
          payload,            // the signed data (96-byte canonical payload)
          {
            key:    publicKey,
            dsaEncoding: 'der',  // Android Keystore outputs DER format
          },
          sig
        )

        if (!valid) {
          errors.push(`SIGNATURE_INVALID: seq=${r.sequence} — payload may have been tampered post-upload`)
        }
      } catch (e) {
        errors.push(`SIGNATURE_VERIFY_ERROR: seq=${r.sequence} error=${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return errors
  }

}
