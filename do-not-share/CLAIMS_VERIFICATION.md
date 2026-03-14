# JADS Platform v4.0 — Claims Verification Register

**Last updated:** 2026-03-14
**Purpose:** Track which platform claims have been verified by code, tests, or review — and which remain unverified. For internal accountability and iDEX preparation.

---

## Verified Claims

These claims have been verified through implementation, automated tests, or code review.

### VC-01: XMLDSig Signature Verification on Permission Artefacts

**Claim:** JADS verifies XMLDSig (RSA-SHA256) signatures on NPNT Permission Artefacts.

**Verification (P2):** `XmlDsigSigner` implements exclusive C14N canonicalization and RSA-SHA256 signature verification. `NpntVerificationService` calls this during PA validation. Verified against self-signed test certificates.

**Caveat:** DGCA PKI root CA chain verification requires DSP certification (6–12 months). Currently verifies against self-signed certs only. See KNOWN_LIMITATIONS.md §2.

---

### VC-02: StrongBox Attestation Nonce

**Claim:** Android devices with StrongBox hardware security provide hardware-backed key attestation with challenge nonce.

**Verification (P5):** `KeyStoreSigningProvider` now correctly passes the attestation nonce via `setAttestationChallenge()` in `KeyGenParameterSpec.Builder`. StrongBox-equipped devices receive full attestation credit in trust scoring. See KNOWN_LIMITATIONS.md §8 (resolved).

---

### VC-03: NTP Quorum Time Authority

**Claim:** The Android app validates device clock accuracy using multiple independent NTP servers before accepting telemetry timestamps.

**Verification (P-prior):** `NtpQuorumAuthority` queries 3+ NTP servers and requires quorum agreement (majority within threshold). If quorum fails, the mission is flagged with degraded time confidence. `ntpSyncStatus` is recorded per-mission and checked by forensic invariant I-2.

---

### VC-04: Database Immutability Triggers (Migration-Deployed)

**Claim:** PostgreSQL triggers block all UPDATE and DELETE operations on the AuditLog table, enforcing append-only immutability.

**Verification (P3):** Triggers are now deployed via Prisma migration (`20260314000000_add_audit_log_immutability_triggers`) rather than auto-installed at server startup. This is a stronger guarantee — triggers are part of the database schema, not runtime initialization. The migration is idempotent and runs during `npx prisma migrate deploy`.

**Previous state:** Triggers were installed by `AuditIntegrityService.installTriggers()` called from `server.ts` on every startup. This has been superseded by migration-based deployment.

---

### VC-05: ForensicFrameStore Encrypted Local Storage

**Claim:** Mission telemetry is stored in an encrypted local database on the Android device using SQLCipher.

**Verification (P-prior):** `ForensicFrameStore` uses SQLCipher with a device-specific passphrase. Data at rest on the device is encrypted. Verified through unit tests that confirm encryption and decryption round-trips.

---

## Unverified Claims (Pending Verification)

These claims are stated in documentation but have not yet been independently verified.

### UV-01: HSM Key Isolation

**Claim:** Production deployment uses HSM (Hardware Security Module) where cryptographic keys never leave the hardware boundary.

**Status:** `HsmKeyProvider` is a stub that throws `HSM_NOT_CONFIGURED`. No HSM hardware has been tested. The `IKeyProvider` interface is ready, but the claim cannot be verified until HSM integration is implemented.

---

### UV-02: Play Integrity Device Attestation (Production)

**Claim:** Google Play Integrity API verifies device integrity, detecting rooted or tampered devices.

**Status:** The `DeviceAttestationService` code exists and handles Play Integrity responses. However, no production Google Cloud project is configured, so all devices currently receive `UNATTESTED` status. The claim is architecturally supported but not operationally verified.

---

### UV-03: External Anchor Publishing to DGCA

**Claim:** Evidence ledger anchors are published to DGCA timestamp authority via HTTPS webhook.

**Status:** The `WebhookAnchorBackend` code exists. The HMAC file anchor works locally. No live DGCA webhook endpoint has been tested. The claim is code-ready but not operationally verified.

---

### UV-04: 100-Drone Swarm at Scale

**Claim:** JADS handles 100 drones × 1,000 records each (100K records) within 15 seconds.

**Status:** Verified by the `swarm-scale` test suite (8 tests) in simulation. Not verified with real Android devices or real network conditions.

---

### UV-05: TSA Timestamp Authority Integration

**Claim:** Evidence ledger entries receive RFC 3161 timestamps from an external TSA server.

**Status:** The async TSA stamping pipeline exists (P9). The `rfc3161TimestampToken` field is populated when the TSA responds. However, no live TSA server has been connected. The field remains `null` in all current deployments. The `pendingTsaStamps` metric (P18) tracks this gap.

**Nuance:** TSA stamping is asynchronous by design — the ledger entry is created immediately, and the timestamp arrives later. This is correct architecture but means there is always a window where `rfc3161TimestampToken` is null. See KNOWN_LIMITATIONS.md §9.
