# JADS Operational Risk Register

Known infrastructure-level risks that are **not covered by unit tests** and require operational mitigations. These are documented here so they are not forgotten during deployment planning.

Last reviewed: 2026-03-03

---

## OPS-RISK-01: Anchor Webhook Failure Under Load

**Component:** `ExternalAnchorService` → `WebhookAnchorBackend`

**What happens:** The webhook POST to the external trust anchor (e.g. DGCA timestamp authority) times out or returns an error while the system is under sustained load.

**Current behavior:** Each backend publish is wrapped in try/catch. `ExternalAnchorService.publishAnchor()` fires all backends via `Promise.all` and requires only one success (`anySuccess`). A failed webhook returns `{ success: false }` and is logged. The DB anchor is written regardless.

**Gap:** No retry logic, no circuit breaker, no backpressure. If the external endpoint is slow (up to `timeoutMs = 10000`), the EvidenceLedgerJob blocks for the full duration. Under sustained failure, external anchors are permanently missed — the idempotency check skips already-anchored dates on re-run.

**Mitigation (when needed):**
- Add a `publishedExternally` boolean column to `EvidenceLedger`
- Retry unpublished anchors on next job run
- Add circuit breaker with exponential backoff on the webhook backend
- Alert on `all_anchor_backends_failed` log events in monitoring

**Priority:** Address before production deployment with real external anchor endpoints.

---

## OPS-RISK-02: HSM Unavailability Mid-Request

**Component:** `KeyManagementService` → `HsmKeyProvider`

**What happens:** The HSM becomes unreachable while a request is in-flight (e.g. JWT verification, audit entry signing).

**Current behavior:** `HsmKeyProvider` is a stub. Every method throws `HSM_NOT_CONFIGURED`. Production uses `EnvKeyProvider` which reads from in-memory env vars and cannot fail this way.

**Gap:** When a real HSM integration is implemented, there is no connection pooling, health checking, or graceful degradation. A network blip to the HSM would cause all auth and signing operations to throw unhandled exceptions, returning 500s to clients.

**Mitigation (when implementing HSM):**
- Connection pool with health checks and timeout
- Retry with short backoff (HSM calls should be <50ms)
- Auth middleware should return 503 (not 500) when HSM is unreachable
- Consider read-through cache for verification-only operations (verify doesn't need HSM if public key is cached)
- Monitor HSM latency percentiles; alert on p99 > 100ms

**Priority:** Address when implementing `HsmKeyProvider` for production.

---

## OPS-RISK-03: Container Restart During Evidence Ledger Anchoring

**Component:** `EvidenceLedgerJob.runOnce()`

**What happens:** The container is killed (OOM, deploy, node drain) partway through the daily ledger job.

**Current behavior:** The job executes steps sequentially: DB write (step 6) → audit log (step 7) → file log (step 8) → external anchor publish (step 9). If the process dies after step 6 but before step 9, the DB anchor exists but the external anchor is never published. On restart, the idempotency check (`findFirst` on `anchorDate`) sees the existing entry and returns `ALREADY_ANCHORED` — skipping external publication permanently.

**Gap:** The idempotency check does not distinguish between "fully anchored" and "partially anchored." A crash between DB write and external publish creates a silent gap in external trust anchoring.

**Mitigation (when needed):**
- Add `externalAnchorStatus` enum column (`PENDING`, `PUBLISHED`, `FAILED`) to `EvidenceLedger`
- On job start, check for any `PENDING` entries from prior runs and retry external publish before processing today
- Wrap DB write + external publish in a saga pattern (or at minimum, record external publish status)
- Kubernetes: set `terminationGracePeriodSeconds` high enough for the job to complete (~30s should suffice)

**Priority:** Address before multi-node production deployment.

---

## OPS-RISK-04: Clock Skew Between Backend Nodes

**Component:** `EvidenceLedgerJob`, `ForensicVerifier`, all timestamp-dependent logic

**What happens:** Two or more backend nodes have system clocks that differ by more than a few seconds. Around midnight UTC, one node considers a mission as "yesterday" while another considers it "today."

**Current behavior:** The backend uses `new Date()` everywhere and assumes the host OS clock is correct. There is no NTP validation or clock skew detection on the server side. The Android app has `NtpQuorumAuthority` for device-side clock integrity, but nothing equivalent exists on the backend.

**Gap:** If the EvidenceLedgerJob runs on a node with a skewed clock:
- `yesterdayUtc()` may compute the wrong date
- Missions may be assigned to the wrong day's anchor
- `serverReceivedAtUtcMs` (used in ForensicVerifier I-2 drift check) may be unreliable
- The `UNIQUE` constraint on `anchorDate` prevents duplicate anchors but doesn't prevent anchoring the wrong set of missions

**Mitigation (when deploying multi-node):**
- Ensure all nodes run `chrony` or `systemd-timesyncd` with the same NTP sources
- Add a startup health check: compare `Date.now()` against a known NTP endpoint; refuse to start if drift > 1 second
- Pin the EvidenceLedgerJob to a single node (Kubernetes CronJob with `concurrencyPolicy: Forbid`) rather than running it on every replica
- Log `serverClockOffsetMs` in the evidence ledger entry for forensic traceability

**Priority:** Address before multi-node production deployment.

---

## General Notes

- These risks are **infrastructure/ops concerns**, not application logic bugs. The pure logic layer (AFTN, Merkle, geofence, forensic verification, etc.) is covered by the unit test suite.
- None of these are exploitable attack vectors on their own — they are availability and consistency risks.
- The evidence chain remains **tamper-detectable** even if these risks materialize. The gap is in **tamper-resistance** (external anchoring) and **availability** (HSM, clock).
