# JADS Platform v4.0 — Threat Model Document

**Classification:** RESTRICTED — For authorised reviewers, regulators, and auditors only.
**Version:** 1.0
**Date:** 2026-03-04
**Owner:** JADS Platform Security Architecture Team
**Regulatory Context:** DGCA UAS Rules 2021, iDEX/MoD Sovereign UTM Requirements

---

## 1. System Description

JADS (Joint Airspace Drone System) is India's **sovereign airspace management and forensic audit platform** serving two domains:

1. **Manned aircraft** — ICAO-compliant flight plan filing with ADC (Air Defence Clearance from IAF/AFMLU), FIC (Flight Information Centre clearance from AAI), NOTAM, and METAR integration. 5-stage validation pipeline (OFPL syntax → route semantics → altitude compliance → FIR sequencing → AFTN filing). Real-time clearance notifications via SSE. AFTN message automation (FPL, CNL, DLA) with auto-generated addressees for all 4 Indian FIRs and 24+ aerodromes.

2. **Drones** — Post-flight forensic audit. Ingests completed drone missions, verifies cryptographic integrity chains (6-layer defence-in-depth), and produces legally admissible forensic reports. 10-point forensic verification with ECDSA P-256 + ML-DSA-65 hybrid signatures.

**Hard Scope Boundary (Drones Only):** For drone operations, JADS is NOT a live monitoring system, NOT a real-time command-and-control system, and NOT an in-flight decision-making system. It processes only completed missions (status = COMPLETED or COMPLETED_WITH_VIOLATIONS). This scope is enforced at code level via `assertPostFlightScope()` with CI-enforced tests (SE-01 through SE-10).

**For manned aircraft**, the platform provides pre-flight validation and filing — a fundamentally different security posture. SSE streams for clearance notifications are authorized for flight plans (not drones).

**System Components:**
- Backend API server (Node.js/TypeScript, Express, Prisma, PostgreSQL) — 517 tests, 18 suites
- Android app (Kotlin, Jetpack Compose) — on-drone telemetry capture with ECDSA + ML-DSA-65 signing
- Admin Portal (React) — airspace management, user provisioning, ADC/FIC clearance issuance, OFPL comparison
- Audit Portal (React) — forensic report viewing, investigation access, DJI import visibility
- 4 deterministic agent microservices — NOTAM Interpreter, Forensic Narrator, AFTN Draft, Anomaly Advisor
- 7 external adapter interfaces (Digital Sky, UIDAI, AFMLU, FIR, AFTN, METAR, NOTAM) — all stubbed, interface-frozen

---

## 2. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRUST BOUNDARY 1: Device                      │
│  Android App → ECDSA P-256 signing → ML-DSA-65 hybrid signing   │
│  NTP Quorum Authority → Monotonic Clock → SQLCipher storage      │
│  StrongBox Keystore (hardware-backed where available)            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS (TLS 1.3)
                           │ Mission Upload (POST /api/drone/missions)
┌──────────────────────────▼──────────────────────────────────────┐
│                    TRUST BOUNDARY 2: Backend                     │
│  Express API → JWT Auth → ForensicVerifier (10 invariants)       │
│  AuditService (append-only) → EvidenceLedger → MerkleTree        │
│  KeyManagementService (EnvKeyProvider / HsmKeyProvider)           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HMAC-signed file / HTTPS webhook
                           │ External Anchor Publishing
┌──────────────────────────▼──────────────────────────────────────┐
│                    TRUST BOUNDARY 3: External Systems             │
│  DGCA Digital Sky │ UIDAI │ AFMLU │ FIR │ AFTN │ METAR │ NOTAM  │
│  External Anchor Backends (government timestamp authority)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Threat Catalogue

### T-1: Full Backend Server Compromise

**Description:** Attacker gains root access to the JADS backend server.

**What they CAN do:**
- Read all environment variables (JWT secrets, DB credentials)
- Modify running code (e.g., make ForensicVerifier always return `allInvariantsHold=true`)
- Issue new JWTs, impersonate any user
- Read/modify database records directly

**What they CANNOT do:**
- Extract signing keys from HSM (production: hardware-backed keys)
- Forge historical ECDSA signatures (private key on Android device, never sent to server)
- Rewrite evidence already published to external anchor backends
- Modify audit log entries (PostgreSQL triggers block UPDATE/DELETE — installed automatically at server startup)
- Forge valid ML-DSA-65 PQC signatures (private key on device)

**Defenses:**
| Layer | Control | Source |
|-------|---------|--------|
| Key isolation | `IKeyProvider` → `HsmKeyProvider` (PKCS#11 / CloudHSM) | `KeyManagementService.ts` |
| Runtime integrity | SHA-256 baseline of critical files at startup, re-checked every 5 minutes — logs `runtime_integrity_violation` on tampering | `RuntimeIntegrityService` wired in `server.ts` |
| Audit immutability | PostgreSQL BEFORE UPDATE/DELETE triggers — installed automatically on every server startup via `installTriggers()` (idempotent) | `AuditIntegrityService.ts` called from `server.ts` |
| External anchoring | HMAC-signed file + webhook to separate systems | `ExternalAnchorService.ts` |
| Signature verification | ECDSA P-256 re-verified server-side from device cert | `ForensicVerifier.checkHashChain()` |

**Residual Risk:** If HSM is not deployed (EnvKeyProvider mode), attacker can sign new JWTs. Mitigated by audit trail — all token issuance is logged and anomalies are detectable post-hoc.

**Assumption:** HSM is deployed in production. If not, this threat is partially unmitigated for real-time JWT forgery.

---

### T-2: External Trust Anchoring Absence

**Description:** Evidence ledger entries exist only in the JADS database. An attacker with DB access could rewrite history without detection.

**What they CAN do (without external anchoring):**
- Modify `EvidenceLedger` table entries
- Recompute chain hashes to appear consistent
- Delete or alter mission records

**What they CANNOT do (with external anchoring):**
- Modify anchors already published to DGCA timestamp authority via webhook
- Modify HMAC-signed entries in the append-only anchor log file (requires separate HMAC key)
- Forge HMAC signatures without the isolated anchor key

**Defenses:**
| Layer | Control | Source |
|-------|---------|--------|
| HMAC-signed file | Append-only log, key isolated from server secrets | `HmacFileAnchorBackend` |
| Webhook to DGCA | HTTPS POST with shared secret, external receipt | `WebhookAnchorBackend` |
| Merkle tree proofs | Inclusion proof for any mission in a day's anchor | `MerkleTreeService.ts` |
| Genesis anchor | Random 256-bit nonce, published at system init | `createGenesisAnchor()` |
| Full chain verification | Walk from genesis to present, detect rewrites | `verifyFullChain()` |

**Assumption:** At least TWO independent anchor backends are configured. A single backend is a single point of failure.

**Out of Scope:** Blockchain-based anchoring. The HMAC + webhook model provides equivalent tamper evidence without blockchain operational overhead.

---

### T-3: Long-Term Historical Tampering

**Description:** Attacker modifies mission records weeks or months after they were ingested, aiming to change forensic verdicts retroactively.

**Defenses:**
- SHA-256 hash chain from HASH_0 (derived from missionId) — any modification cascades
- ECDSA signatures from device — cannot be recomputed without device private key
- ML-DSA-65 PQC signatures — quantum-resistant, device-side signing
- Daily evidence ledger anchoring — Merkle roots published externally
- Audit log append-only — PostgreSQL triggers block modification (installed automatically at server startup)

**Assumption:** Device private keys (ECDSA P-256) are hardware-backed (StrongBox/TEE). If software-only, a rooted device could extract the key.

---

### T-4: Compromised Android Device

**Description:** Drone operator uses a rooted device with modified JADS app to submit fabricated telemetry.

**What they CAN do:**
- Generate telemetry with arbitrary GPS coordinates
- Self-report `strongboxBacked: true` when false
- Submit missions with manipulated timestamps

**What they CANNOT do:**
- Forge a valid key attestation certificate chain (signed by Google hardware root CA)
- Pass Play Integrity verification on a rooted device
- Avoid NTP drift detection (server compares device vs server timestamps)
- Bypass CRC32 and hash chain validation (server re-verifies from scratch)

**Defenses:**
| Layer | Control | Source |
|-------|---------|--------|
| Device attestation | Play Integrity API + Key Attestation cert chain | `DeviceAttestationService.ts` |
| Trust scoring | Numeric score 0-100 based on attestation results | `computeTrustScore()` |
| NTP drift detection | Server-vs-device time comparison (threshold: 300s) | ForensicVerifier I-2 |
| Strongbox advisory | I-8 flags hardware security status in forensic report | ForensicVerifier I-8 |

**Assumption:** Google Play Integrity API is configured and operational. If not configured, all missions are classified as UNATTESTED (still accepted, reduced forensic weight).

**Residual Risk:** A sophisticated attacker with physical hardware access and custom firmware could potentially bypass hardware attestation. This is out of scope — it requires state-actor resources.

---

### T-5: Colluding Administrators

**Description:** Two admin users collude to approve a fraudulent airspace change (e.g., reclassify a RED zone as GREEN to allow unauthorized drone operations).

**Defenses:**
| Layer | Control | Source |
|-------|---------|--------|
| Two-person rule | Zone creator ≠ zone approver (hard check) | `AirspaceVersioningService.ts` |
| Lineage collusion prevention | If admin A provisioned admin B (or vice versa), B cannot approve A's zones | `checkLineageCollusion()` |
| Audit trail | All provisioning and approval actions logged immutably | `AuditLog` table |
| Self-grant prevention | Investigation access: grantor ≠ grantee | `AuditService.grantAccess()` |
| Self-revocation prevention | Original grantor cannot revoke own grant | `AuditService.revokeAccess()` |

**Assumption:** Admin provisioning is done by a super-admin, and the platform has at least 3 independent admin accounts. Two admins from different organizational units provide meaningful separation.

---

### T-6: Replay / Duplicate Mission Attack

**Description:** Attacker re-submits a previously uploaded mission to create duplicate records, potentially for fraudulent compliance claims.

**Defenses:**
- I-5 invariant: `checkNoDuplicate()` — queries DB for same missionId, flags duplicates
- Mission ingestion deduplication at upload time
- Audit log records all upload attempts including rejected duplicates

**Assumption:** missionId is generated from device entropy (BigInt) and is probabilistically unique.

---

### T-7: Quantum Computing Threat to ECDSA

**Description:** Future quantum computers could break ECDSA P-256 signatures, allowing historical telemetry forgery.

**Defenses:**
- ML-DSA-65 (FIPS 204) hybrid signatures alongside ECDSA — quantum-resistant
- Phase 1: advisory (I-10 non-critical) — allows gradual fleet rollout
- Phase 2 (planned): I-10 becomes critical — PQC required for all new missions
- Degradation detection: if PQC signatures are stripped, the system explicitly logs the count of unsigned records (never silent)

**Assumption:** ML-DSA-65 is correctly implemented by the `@noble/post-quantum` library and NIST FIPS 204 is sound. JADS does not implement its own PQC primitives.

**Out of Scope:** Harvest-now-decrypt-later attacks on encrypted data. JADS telemetry is signed (integrity), not encrypted (confidentiality). Position data in telemetry is not secret — it's evidence.

---

### T-8: Clock Manipulation

**Description:** Device clock is set to wrong time to make a mission appear to have occurred at a different time, or to bypass time-based compliance checks.

**Defenses:**
- NTP Quorum Authority on Android (minimum 2 NTP servers, spread tolerance)
- Monotonic clock — timestamps never go backward during a mission (I-9)
- NTP offset magnitude enforcement — |offset| > 24h forces DEGRADED status (I-2)
- Server-vs-device drift check — |missionEndUtcMs - serverReceivedAtUtcMs| > 300s triggers warning
- All time evidence frozen at missionEndUtcMs — never `new Date()` during forensic analysis

---

### T-9: Insider Threat — Platform Super Admin

**Description:** A PLATFORM_SUPER_ADMIN abuses their privileges to access data, modify records, or cover tracks.

**Defenses:**
- Audit log immutability — even super admin cannot UPDATE/DELETE audit entries
- Two-person rule — super admin cannot self-approve airspace changes
- Investigation access requires peer grant — cannot grant access to self
- All super admin actions logged with actorType=SPECIAL_USER or ADMIN_USER
- Evidence ledger externally anchored — super admin cannot rewrite published anchors

**Residual Risk:** A super admin could potentially read all mission data (by design — they need access for platform management). This is mitigated by organizational controls (background checks, audit reviews).

---

### T-10: Supply Chain — Dependency Compromise

**Description:** A compromised npm/Gradle dependency introduces malicious code.

**Defenses:**
- `package-lock.json` pins exact dependency versions
- Critical crypto operations use well-audited libraries (`crypto` built-in, `@noble/post-quantum`)
- ECDSA verification uses Node.js native `crypto.verify()` — not a third-party library
- RuntimeIntegrityService computes SHA-256 baseline at startup and re-checks every 5 minutes (wired in `server.ts`)

**Out of Scope:** Pre-build supply chain attacks (compromised CI/CD pipeline). Addressed by operational security controls, not application-level defenses.

---

### T-11: Fraudulent Flight Plan Filing (Manned Aircraft)

**Description:** An unauthorized user files a flight plan using a stolen or fabricated callsign, or a civilian files for a military aerodrome without authorization.

**Defenses:**
| Layer | Control | Source |
|-------|---------|--------|
| Callsign authorization | Civilian users can only file for callsigns in their authorized list | `OfplValidationService.ts` — `CALLSIGN_NOT_AUTHORISED` error |
| Military aerodrome warning | Civilian user filing from/to a military aerodrome triggers explicit warning | `OfplValidationService.ts` — `MILITARY_AERODROME_CIVILIAN_USER` |
| RVSM equipment enforcement | FL290–FL410 requires equipment 'W' — prevents filing without proper avionics | `AltitudeComplianceEngine.ts` |
| Audit trail | All filing attempts (success and failure) are logged with userId, userType, callsign | `FlightPlanService.writeAuditLog()` |
| Role-based filing | CIVILIAN vs SPECIAL user type determines validation strictness and available callsigns | `requireAuth` middleware |

**Assumption:** Callsign lists are provisioned by entity admins and kept current.

---

### T-12: AFTN Message Injection / Tampering

**Description:** Attacker injects or modifies AFTN messages to file, cancel, or delay flight plans on behalf of another user.

**Defenses:**
| Layer | Control | Source |
|-------|---------|--------|
| Ownership enforcement | Cancel/delay only allowed by the original filing user (`plan.filedBy !== userId`) | `FlightPlanService.cancelPlan()`, `delayPlan()` |
| Status validation | Only certain statuses allow cancel/delay — prevents double-cancel or cancel-after-activation | `cancellableStatuses`, `delayableStatuses` arrays |
| AFTN gateway authentication | All AFTN transmissions go through authenticated gateway stub (live: government-controlled endpoint) | `IAftnGateway.fileFpl()` |
| Inbound webhook authentication | ADC/FIC push webhooks require `X-JADS-Adapter-Key` with constant-time comparison | `adapterAuthMiddleware.ts` — `crypto.timingSafeEqual` |

**Assumption:** AFTN gateway and webhook keys are securely managed and rotated on personnel changes.

---

## 4. Assumptions Summary

| ID | Assumption | Impact if Violated |
|----|------------|-------------------|
| A-1 | HSM deployed in production | JWT forgery possible with server compromise |
| A-2 | ≥2 external anchor backends configured | Historical tampering undetectable |
| A-3 | Device keys are hardware-backed (StrongBox/TEE) | Device-level forgery possible on rooted devices |
| A-4 | Play Integrity API configured | All missions classified UNATTESTED |
| A-5 | ≥3 independent admin accounts | Two-person rule meaningless with only 2 admins |
| A-6 | PostgreSQL server hardened (TLS, no public access) | DB-level attacks bypass application controls |
| A-7 | NTP sources are trustworthy | Clock-based evidence unreliable |
| A-8 | HMAC anchor key isolated from server secrets | Anchor forgery possible |
| A-9 | `@noble/post-quantum` ML-DSA-65 is correct | PQC signatures provide false assurance |
| A-10 | Android Keystore (StrongBox) is not compromised | ECDSA private key extraction possible |

---

## 5. Out of Scope

| Item | Reason |
|------|--------|
| Live telemetry monitoring | JADS is post-flight forensic only (hard scope lock) |
| Real-time command & control | No drone relay capability exists |
| Encrypted telemetry (confidentiality) | Telemetry is evidence (integrity), not secrets |
| Blockchain anchoring | HMAC + webhook provides equivalent tamper evidence |
| State-actor hardware attacks | Requires physical device access + custom firmware |
| DDoS / availability attacks | Addressed by infrastructure (WAF, rate limiting, CDN) |
| Social engineering of operators | Organizational security control, not application-level |
| UIDAI/Aadhaar system compromise | UIDAI is a sovereign system; JADS trusts its responses |
| Network-level MITM | Mitigated by TLS 1.3; certificate pinning on Android app |
| Physical data center compromise | Addressed by facility security, not application controls |

---

## 6. Threat-to-Defense Traceability Matrix

| Threat | I-1 | I-2 | I-3 | I-4 | I-5 | I-6 | I-7 | I-8 | I-9 | I-10 | Audit | Merkle | Anchor | HSM | Attest |
|--------|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|-------|--------|--------|-----|--------|
| T-1 Server Compromise | | | | | | | | | | | X | X | X | X | |
| T-2 No External Anchor | | | | | | | | | | | | X | X | | |
| T-3 Historical Tampering | X | | | | | | | | | X | X | X | X | | |
| T-4 Compromised Device | X | X | X | | | | X | X | X | X | | | | | X |
| T-5 Colluding Admins | | | | | | | | | | | X | | | | |
| T-6 Replay Attack | | | | | X | | | | | | X | | | | |
| T-7 Quantum Threat | | | | | | | | | | X | | | | | |
| T-8 Clock Manipulation | | X | | | | | | | X | | | | | | |
| T-9 Insider Threat | | | | | | | | | | | X | | X | | |
| T-10 Supply Chain | | | | | | | | | | | | | | | |
| T-11 Fraudulent Filing | | | | | | | | | | | X | | | | |
| T-12 AFTN Injection | | | | | | | | | | | X | | | | |

---

## 7. Review Schedule

This threat model MUST be reviewed:
- Before every major release
- After any security incident
- After adding new external integrations (e.g., new adapter)
- Annually at minimum
- Before DGCA certification submission

**Next Review Due:** Before iDEX submission or 2026-06-04, whichever comes first.
