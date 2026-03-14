# JADS Platform v4.0 — Known Limitations

**Last updated:** 2026-03-14
**Purpose:** Honest accounting of what the platform does NOT yet do, or does incompletely. For internal use and iDEX preparation.

---

## §1 — Digital Sky Live Integration

**Status:** Stub only

JADS implements all 7 government adapter interfaces (Digital Sky, UIDAI, AFMLU, FIR, AFTN, METAR, NOTAM) as stubs. No live government API endpoint is connected. The adapter pattern ensures zero core logic changes when stubs are replaced with live implementations, but until government provides credentials and endpoints, all external data is simulated.

**Impact:** Demo-only. All government system responses are hardcoded.

**Resolution path:** Government provides API credentials → implement live adapter → set `USE_LIVE_ADAPTERS=true`.

---

## §2 — XMLDSig Signature Verification (Partially Resolved)

**Status:** Partially resolved (P2)

JADS now verifies XMLDSig signatures on NPNT Permission Artefacts via `NpntVerificationService` using `XmlDsigSigner`. The implementation handles:
- RSA-SHA256 signature verification
- Exclusive C14N canonicalization
- Self-signed certificate validation (for demo/testing)

**Remaining gap:** Full DGCA PKI chain verification (root CA → intermediate → leaf) requires DSP (Digital Sky Platform) certification — a 6–12 month government process. Until then, PA signatures are verified against self-signed certificates only.

**Impact:** PA structure, time bounds, geofence polygon, and weight-category rules are fully enforced. Only the PKI trust chain to DGCA root CA is pending.

---

## §3 — Certificate Revocation List (CRL)

**Status:** Archived but not actively checked

The CRL snapshot is archived at mission upload time (I-4 invariant), but no background job actively re-checks device certificates against updated CRLs after initial upload. The `ReverificationJob` exists in the codebase but does not yet perform CRL delta checks.

**Impact:** A device certificate revoked after mission upload would not be retroactively flagged.

**Resolution path:** Implement CRL delta checking in `ReverificationJob`.

---

## §4 — AFTN Gateway

**Status:** Stub only

The AFTN gateway (`IAftnGateway`) generates correctly formatted ICAO Doc 4444 messages (FPL, CNL, DLA) but does not transmit them to the real AFTN network. Transmission requires an AFTN gateway license and infrastructure provided by the government.

**Impact:** Flight plans are validated and AFTN messages are generated, but not transmitted to ATC.

---

## §5 — HSM Key Management

**Status:** Stub only

`HsmKeyProvider` throws `HSM_NOT_CONFIGURED`. Production uses `EnvKeyProvider` (keys in memory). Keys are not hardware-protected.

**Impact:** A server compromise could expose signing keys. Acceptable for demo; must be resolved for production.

---

## §6 — Play Integrity / Device Attestation

**Status:** Not configured in development

Without `PLAY_INTEGRITY_PROJECT_ID` and `PLAY_INTEGRITY_API_KEY`, all devices are marked `UNATTESTED`. The attestation pipeline code exists and is tested, but requires Google Cloud project setup.

**Impact:** No device integrity verification in demo mode. Trust scores default to base (20).

---

## §7 — External Anchor Webhook Retry

**Status:** No retry logic

`WebhookAnchorBackend` has no retry, circuit breaker, or backpressure. If the webhook endpoint fails during `EvidenceLedgerJob`, that day's external anchor is permanently missed (idempotency check skips already-anchored dates).

**Impact:** Gap in external trust anchoring if webhook fails. Documented in OPS-RISK-01.

---

## §8 — StrongBox Attestation Nonce (Resolved)

**Status:** Resolved (P5)

Previously, the `KeyStoreSigningProvider` was not passing the attestation nonce correctly when generating key attestation certificates on StrongBox-equipped devices. This caused the attestation challenge to fail silently, resulting in reduced trust scores.

**Fix (P5):** The nonce is now correctly passed as the `setAttestationChallenge()` parameter during `KeyGenParameterSpec` construction. StrongBox-equipped devices now receive full hardware-backed attestation credit in trust scoring.

---

## §9 — TSA Timestamping is Asynchronous

**Status:** By design (P9)

RFC 3161 TSA (Timestamp Authority) stamping was made asynchronous in P9. The `EvidenceLedgerService` now requests TSA timestamps in a fire-and-forget pattern — the ledger entry is written to the database immediately, and the TSA response (`rfc3161TimestampToken`) is populated later when the TSA server responds.

**Implication:** There is a window between ledger entry creation and TSA stamp arrival where `rfc3161TimestampToken` is `null`. The `GET /api/system/metrics` endpoint tracks this via the `pendingTsaStamps` counter.

**This is a deliberate design choice:** TSA servers are external and may have variable latency. Making the operation synchronous would block the entire evidence ledger pipeline on an external dependency. The async pattern is the correct architecture for production reliability.

---

## §10 — Permission Artefact Polygon Geofence (Deferred)

**Status:** Deferred

The NPNT Permission Artefact contains a `<Coordinates>` polygon defining the approved flight area. JADS currently enforces:
- Airport proximity gates (5km/8km haversine radius against 26 airports)
- Zone classification (GREEN/YELLOW/RED) via radius-based checks

**Not yet implemented:** Full polygon containment check (point-in-polygon test against the PA's `<Coordinates>` polygon). The PA is parsed and the coordinates are extracted, but the containment test against recorded telemetry points is not yet wired into the forensic verification pipeline.

**Impact:** Flights are checked against known restricted zones and airports, but not against the specific polygon in the Permission Artefact.

**Resolution path:** Add ray-casting polygon containment to `NpntVerificationService`, using the PA coordinates as the geofence boundary.
