# JADS Platform v4.0 — Security Architecture Whitepaper

**Classification:** RESTRICTED — For authorised auditors, regulators, and security reviewers.
**Version:** 1.0
**Date:** 2026-03-04
**Prepared for:** DGCA, iDEX/MoD, Security Auditors

---

## Abstract

JADS (Joint Airspace Drone System) is a forensic-grade Unmanned Traffic Management (UTM) platform designed for sovereign Indian airspace. This whitepaper details the cryptographic architecture, defense-in-depth strategy, and regulatory compliance controls that make JADS suitable for producing legally admissible evidence from drone flight operations.

The platform processes exclusively **post-flight data** — no live monitoring, no real-time control. This deliberate scope restriction eliminates an entire class of safety risks and ensures that forensic evidence is never contaminated by operational feedback loops.

---

## 1. Architectural Principles

### 1.1 Post-Flight Forensic Scope (Hard Lock)

JADS enforces a strict scope boundary at code level:

```
PLATFORM_SCOPE = {
  mode: 'POST_FLIGHT_FORENSIC',
  hardLocks: {
    REJECT_LIVE_TELEMETRY:    true,
    REJECT_STREAMING_API:     true,
    REJECT_REALTIME_COMMANDS: true,
    REQUIRE_MISSION_END:      true,
  }
}
```

The runtime guard `assertPostFlightScope()` rejects any mission with status other than COMPLETED or COMPLETED_WITH_VIOLATIONS. This is enforced by **10 CI-level tests** (SE-01 through SE-10) that also scan Express route tables for forbidden keywords (live, stream, ws, realtime).

**Why this matters:** A forensic system that also does live monitoring creates legal ambiguity about when evidence was collected and whether it was influenced by real-time decisions. Regulators can rely on JADS evidence precisely because the platform cannot influence the flight it is evaluating.

### 1.2 Defense in Depth — 6 Layers

| Layer | Threat Mitigated | Implementation |
|-------|-----------------|----------------|
| 1. External Trust Anchoring | Historical tampering | HMAC-signed file + HTTPS webhook to DGCA |
| 2. HSM-Ready Key Management | Server compromise | IKeyProvider → HsmKeyProvider (PKCS#11) |
| 3. Merkle Tree Evidence Chain | Record deletion/insertion | Daily Merkle roots, inclusion proofs, genesis anchor |
| 4. Device Attestation | Compromised Android device | Play Integrity API + Key Attestation cert chain |
| 5. Admin Collusion Prevention | Insider threat (admin pair) | Two-person rule + provisioning lineage tracking |
| 6. Audit Log Immutability | Evidence tampering | PostgreSQL triggers block UPDATE/DELETE on audit tables (**requires activation** — see Section 6.1) |

### 1.3 Adapter Pattern for Sovereign Integration

All 7 government system integrations use a strict adapter pattern:

```
Interface (IDigitalSkyAdapter)  →  Stub (DigitalSkyAdapterStub)
                                →  Live (DigitalSkyAdapterLive)  ← Government provides
```

**Adapters:**
1. **Digital Sky** (DGCA) — Permission Artefact, UIN, pilot license, flight log submission
2. **UIDAI** — Aadhaar OTP eKYC for civilian drone operators
3. **AFMLU** — Air Force ADC (Airspace Design Cell) records
4. **FIR** — Flight Information Circulars from 4 Indian FIRs
5. **AFTN** — Aeronautical Fixed Telecommunication Network (ICAO Doc 4444)
6. **METAR** — Aerodrome weather reports (12 major Indian airports)
7. **NOTAM** — Notices to Airmen for active airspace restrictions

Zero core logic changes are needed when replacing stubs with live implementations. The adapter interface contracts are frozen.

---

## 2. Cryptographic Architecture

### 2.1 Telemetry Integrity Chain

Every drone mission produces a cryptographic chain:

```
Device Side (Android)                    Server Side (Backend)
─────────────────────                    ─────────────────────
96-byte canonical payload                Re-serialize + CRC32 verify
        │                                       │
    CRC32(bytes 0-91)                     Hash chain walk from HASH_0
        │                                       │
    ECDSA P-256 sign                      ECDSA re-verify (device cert)
        │                                       │
    ML-DSA-65 sign (hybrid)               ML-DSA-65 re-verify (PQC key)
        │                                       │
    SHA-256 chain link                    Evidence ledger + external anchor
        │
    SQLCipher encrypted local store
```

### 2.2 96-Byte Canonical Payload (Frozen Layout)

| Offset | Length | Field | Type |
|--------|--------|-------|------|
| 0-3 | 4 | sequence | uint32 BE |
| 4-11 | 8 | timestampUtcMs | uint64 BE |
| 12-15 | 4 | latitudeMicrodeg | int32 BE |
| 16-19 | 4 | longitudeMicrodeg | int32 BE |
| 20-23 | 4 | altitudeCm | uint32 BE |
| 24-27 | 4 | velocityNorthMms | int32 BE |
| 28-31 | 4 | velocityEastMms | int32 BE |
| 32-35 | 4 | velocityDownMms | int32 BE |
| 36-37 | 2 | hdop (×100) | uint16 BE |
| 38 | 1 | satelliteCount | uint8 |
| 39 | 1 | fixType | uint8 |
| 40 | 1 | npntClassification | uint8 |
| 41-48 | 8 | missionId | uint64 BE |
| 49-64 | 16 | operatorIdHash | bytes |
| 65-91 | 27 | reserved (must be 0x00) | bytes |
| 92-95 | 4 | CRC32 | uint32 BE |

**Cross-Runtime Invariant:** TypeScript (`canonicalSerializer.ts`) and Kotlin (`CanonicalSerializer.kt`) MUST produce byte-identical outputs for the same inputs. This is verified by cross-platform tests.

### 2.3 Hash Chain Construction

```
HASH_0 = SHA-256("MISSION_INIT" || missionId_BigEndian_8bytes)

For each record n:
  HASH_n = SHA-256(canonicalPayload_96bytes || HASH_{n-1})
```

**Critical Implementation Detail:** During server-side verification, the ForensicVerifier uses the **recomputed** hash as the next `prevHash`, NOT the stored `chainHashHex`. This prevents a DB-level attacker from modifying a record's payload, recomputing all downstream chain hashes, and passing verification.

### 2.4 ECDSA P-256 Signatures

- **Algorithm:** ECDSA with SHA-256 over P-256 (secp256r1)
- **Key generation:** Android Keystore (hardware-backed when StrongBox is available)
- **Signature format:** DER-encoded (RFC 6979 deterministic)
- **Verification:** Node.js `crypto.verify('SHA256', payload, { key: publicKey, dsaEncoding: 'der' }, sig)`
- **Device cert:** X.509 DER stored at mission upload time for post-hoc re-verification

### 2.5 ML-DSA-65 Post-Quantum Hybrid Signatures

- **Algorithm:** ML-DSA-65 (FIPS 204, formerly CRYSTALS-Dilithium)
- **Library:** `@noble/post-quantum` (audited, JavaScript-only, no native dependencies)
- **Key size:** Public key ~1,952 bytes, Signature ~3,309 bytes
- **Phase 1 (current):** Advisory — I-10 invariant is non-critical. Allows gradual fleet rollout.
- **Phase 2 (planned):** I-10 becomes critical — PQC required for all new missions.

**Degradation Detection:** When a PQC-capable mission (pqcPublicKeyHex present) has records without PQC signatures, the system explicitly logs the exact count: "X ML-DSA-65 signatures verified (Y records without PQC signature — gradual rollout)". Silent degradation is architecturally impossible — 12 dedicated tests (PQC-DL-01 through PQC-DL-12) enforce this.

### 2.6 Key Management

```
IKeyProvider (interface)
    │
    ├── EnvKeyProvider (development/staging)
    │   └── In-memory secrets from environment variables
    │   └── HMAC-SHA256 signing
    │   └── Timing-safe comparison for verification
    │
    └── HsmKeyProvider (production)
        └── AWS CloudHSM / Azure Dedicated HSM / PKCS#11
        └── Keys never leave hardware boundary
        └── Server compromise cannot extract signing keys
```

---

## 3. Forensic Verification — 10 Invariants

The ForensicVerifier runs 10 independent checks on every mission:

### Critical Invariants (failure = mission inadmissible)

| Code | Name | What It Checks |
|------|------|----------------|
| I-1 | Hash Chain Integrity | HASH_0 derivation, chain link continuity, ECDSA P-256 signature re-verification, CRC32 validity, sequence gapless, reserved bytes zero |
| I-2 | NTP Time Sync | ntpSyncStatus, offset magnitude (>5s warn, >24h degrade), server-vs-device drift (>300s warn) |
| I-3 | Device Certificate | Certificate valid at mission start, not expired before takeoff |
| I-5 | No Duplicate | missionId unique in database (replay/duplicate attack detection) |
| I-6 | NPNT Zone Compliance | No RED zone violations (CRITICAL severity = inadmissible) |

### Advisory Invariants (failure = warning, not rejection)

| Code | Name | What It Checks |
|------|------|----------------|
| I-4 | CRL Archived | Certificate Revocation List snapshot archived at upload |
| I-7 | GNSS Integrity | ≤20% of records with degraded GNSS status |
| I-8 | Hardware Security | StrongBox backing + Secure Boot status |
| I-9 | Timestamp Monotonicity | No clock rollbacks (recordedAtUtcMs never decreases) |
| I-10 | PQC Hybrid Signature | ML-DSA-65 verification (Phase 1: advisory; Phase 2: critical) |

### Invariant Independence

Each invariant runs independently — failure of I-1 does not prevent I-10 from executing. This ensures maximum forensic information is captured even when a mission has failures.

---

## 4. Evidence Integrity Chain

### 4.1 Daily Evidence Ledger

Every day at 00:05 UTC, the EvidenceLedgerJob:
1. Collects all missions uploaded the previous day
2. Sorts missionIds lexicographically (deterministic order)
3. Computes `missionIdsCsvHash = SHA-256(sorted missionId CSV)`
4. Builds a Merkle tree over all mission IDs
5. Computes `anchorHash = SHA-256(date || count || csvHash || prevAnchorHash)`
6. Stores the ledger entry (idempotent on anchorDate)
7. Publishes to all configured external anchor backends
8. Logs to append-only audit log

### 4.2 Merkle Tree Inclusion Proofs

For any auditor questioning whether a specific mission was included in a day's evidence anchor, the system can generate a compact Merkle inclusion proof:

```json
{
  "missionId": "2709280000001",
  "root": "a3b4c5...",
  "proof": [
    { "hash": "d4e5f6...", "position": "right" },
    { "hash": "789abc...", "position": "left" }
  ],
  "leafHash": "123456..."
}
```

The auditor can independently verify the proof without downloading all mission IDs.

### 4.3 Genesis Anchor

The system's root of trust is established at initialization:

```json
{
  "type": "GENESIS",
  "platformVersion": "JADS-4.0",
  "initializedAt": "2026-01-15T00:00:00.000Z",
  "initializedBy": "admin_001",
  "nonce": "a3b4c5d6... (256-bit random)",
  "genesisHash": "sha256(GENESIS|JADS-4.0|timestamp|admin|nonce)"
}
```

The full chain from genesis to present can be walked and verified by `verifyFullChain()`.

---

## 5. Authentication & Authorization

### 5.1 User Types

| Type | Auth Method | Session | Use Case |
|------|-------------|---------|----------|
| Civilian Pilot | Mobile OTP + Aadhaar eKYC | 8 hours | Mission upload, self-audit |
| Special User (Government) | Username + Password (unit account) | 12 hours | All operations |
| Admin | Username + Password | 2 hours | Platform management |
| Auditor | Via Special User login | 12 hours | Read-only forensic access |

### 5.2 Role-Based Access Control

| Role | Drone Missions | Flight Plans | Audit Log | Airspace Mgmt |
|------|---------------|--------------|-----------|---------------|
| DGCA_AUDITOR | All (read) | All (read) | No | No |
| AAI_AUDITOR | **DENIED** (manned only) | All (read) | No | No |
| IAF_AUDITOR | All (read) | All (read) | No | No |
| INVESTIGATION_OFFICER | **Scoped grants only** | Scoped grants | No | No |
| PLATFORM_SUPER_ADMIN | All | All | All (read) | Approve (not create+approve) |

**Key Enforcement:** `AuditService.assertDroneMissionAccess()` throws `AuditScopeError` for AAI_AUDITOR accessing drone data. Returns 403, never an empty list — an empty list would silently mask a permission error.

### 5.3 Investigation Access Grants

- Scoped to specific missionId or flightPlanId
- Time-limited (expiresAt field)
- **Two-person rule:** grantor ≠ grantee (SELF_GRANT_DENIED)
- **Anti-cover-up:** original grantor cannot revoke own grant (SELF_REVOCATION_DENIED)
- All grant/revoke actions logged immutably

---

## 6. Audit Log Immutability

### 6.1 Database-Level Enforcement

Three PostgreSQL triggers protect the audit log. **DEPLOYMENT NOTE:** These triggers are NOT auto-deployed by Prisma migrations. They must be explicitly activated by calling `AuditIntegrityService.installTriggers()` during initial deployment setup. The Deployment Guide (Section 3.1) includes this as a required step.

```sql
-- Trigger 1: Auto-compute row hash on INSERT
CREATE TRIGGER audit_log_compute_row_hash
  BEFORE INSERT ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_compute_row_hash();

-- Trigger 2: Block ALL updates
CREATE TRIGGER audit_log_prevent_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_update();
  -- RAISES EXCEPTION: 'Audit log entries cannot be modified'

-- Trigger 3: Block ALL deletes
CREATE TRIGGER audit_log_prevent_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_delete();
  -- RAISES EXCEPTION: 'Audit log entries cannot be deleted'
```

**Once activated**, even a PLATFORM_SUPER_ADMIN cannot modify audit entries. The only way to circumvent this is to drop the triggers — which itself would be an auditable PostgreSQL administrative event.

**WARNING:** If `installTriggers()` is not called after deployment, audit log entries are mutable at the database level. This MUST be verified as part of the deployment checklist.

### 6.2 Row-Level Integrity

Each audit log entry's `rowHash` is computed as:
```
SHA-256(actorType || actorId || action || resourceType || resourceId || detailJson || timestamp)
```

The `AuditIntegrityService` can batch-verify all rows, detecting any rows that were modified outside the trigger system (e.g., by a DBA with superuser access who drops triggers, modifies data, then re-creates triggers).

---

## 7. Device Attestation & Trust Scoring

### 7.1 Trust Score Formula

```
Base Score:                     20  (submitted a mission)
+ Play Integrity (device):    +30  (Google confirms device integrity)
+ Play Integrity (app):       +10  (Google confirms app is genuine)
+ Hardware-backed key:         +25  (key attestation cert chain valid)
+ Self-reported StrongBox:     +10  (if no hardware proof)
+ Secure Boot verified:        +15  (boot chain integrity)
─────────────────────────────────
Maximum:                       100
```

### 7.2 Trust Levels

| Level | Score | Meaning |
|-------|-------|---------|
| FULL | 80-100 | Play Integrity + hardware key + secure boot |
| PARTIAL | 40-79 | Some attestation signals present |
| UNATTESTED | 20-39 | No cryptographic attestation |
| FAILED | 0 | Attestation explicitly failed (tampered device) |

---

## 8. Platform Invariants (Never Break)

1. **96-byte canonical payload layout** — identical bytes from Kotlin and TypeScript
2. **Audit log is append-only** — DB triggers enforce (requires `installTriggers()` activation at deployment); no application-level bypass possible once active
3. **Airspace records never deleted** — only superseded (version history preserved)
4. **Two-person rule** — no single admin can create AND approve an airspace change
5. **Post-flight forensic scope** — hard-locked via PLATFORM_SCOPE constants + CI tests
6. **BigInt as decimal strings** in all JSON serialization (JavaScript cannot represent >2^53 in JSON)
7. **All environment variables via env.ts** — no direct `process.env` access in service code
8. **X-JADS-Version: 4.0 header** required on all API calls (version-gated API evolution)

---

## 9. Test Coverage Summary

| Test Suite | Tests | Focus |
|------------|-------|-------|
| scope-enforcement | 10 | Platform scope locks, route scanning |
| pqc-hybrid-fallback | 12 | ML-DSA-65 verification, corruption detection |
| pqc-degradation-logging | 12 | Silent fallback detection, explicit logging |
| swarm-scale | 8 | 100 drones × 1000 records, throughput SLAs |
| mega-stress-chaos | varies | Concurrent hash chain operations |
| chaos-integration | varies | Error injection, fault tolerance |
| collapse-chaos | varies | Edge cases, boundary conditions |
| forensic verification | via requirement-traceability | All 10 invariants traced to code |
| clearance-logic | varies | ADC/FIC workflow, SSE events |
| human-workflow | varies | Two-person rule, lineage collusion |
| audit service | varies | Role scoping, investigation grants |
| stage7-logic | varies | Geodesics, AFTN, geofence, altitude |

**Total: 500+ tests, 18 suites, 0 failures.**

---

## 10. Compliance Mapping

| Regulation | JADS Control |
|------------|-------------|
| DGCA UAS Rules 2021 | NPNT compliance (I-6), weight categories, airport proximity gates |
| DGCA UAS Rules 2021 Rule 36(1) | 5km/8km airport proximity zones enforced |
| ICAO Doc 4444 | Flight plan format, AFTN message builder, Item 18 parsing |
| ICAO Doc 8585 | AFTN addressee sequences |
| NIST FIPS 204 | ML-DSA-65 post-quantum signatures (I-10) |
| NIST SP 800-57 | Key management lifecycle (IKeyProvider abstraction) |
| IT Act 2000 (India) | Audit trail immutability, electronic evidence preservation |
| Indian Evidence Act | Forensic report as Section 65B certificate (all 10 invariants) |

---

## 11. Conclusion

JADS Platform v4.0 provides **forensic-grade evidence integrity** through:

- **Cryptographic chaining** (SHA-256 + ECDSA + ML-DSA-65 hybrid)
- **External trust anchoring** (HMAC-signed files + HTTPS webhooks)
- **Database-level immutability** (PostgreSQL triggers on audit log)
- **Device attestation** (Play Integrity + key attestation + trust scoring)
- **Admin collusion prevention** (two-person rule + lineage tracking)
- **Comprehensive testing** (500+ tests including PQC degradation, swarm scale, chaos)

The platform is architected for sovereign Indian deployment with all 7 government system adapters stubbed and interface-frozen, ready for live integration without core logic changes.
