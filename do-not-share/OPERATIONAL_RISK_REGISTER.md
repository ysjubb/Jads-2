# JADS Operational Risk Register

Known infrastructure-level risks that are **not covered by unit tests** and require operational mitigations. These are documented here so they are not forgotten during deployment planning.

**Platform scope:** Manned aircraft flight plan filing (ICAO OFPL, ADC/FIC/METAR/NOTAM, AFTN messaging) + drone forensic audit (cryptographic hash chains, 10-point verification, PQC signatures) + 4 agent microservices.

Last reviewed: 2026-03-04

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

## OPS-RISK-05: AFTN Gateway Failure During Flight Plan Filing

**Component:** `FlightPlanService` → `IAftnGateway.fileFpl()`

**What happens:** The AFTN gateway (real or stub) becomes unreachable while a pilot is filing a manned aircraft flight plan. The 5-stage validation pipeline passes (P4A–P4D), but P4E (AFTN transmission) fails.

**Current behavior:** The stub gateway always succeeds. When a live AFTN gateway is connected, network failures will cause P4E to throw. The flight plan status remains VALIDATED (not FILED). The pilot receives an error.

**Gap:** No retry mechanism for AFTN transmission. No "FILING_PENDING" intermediate status. A pilot whose plan validated but failed to transmit must manually re-file (re-running all 5 stages unnecessarily).

**Mitigation (when connecting live AFTN gateway):**
- Add `FILING_PENDING` status between VALIDATED and FILED
- Store the generated AFTN message in DB so retry does not re-run P4A–P4D
- Add retry with exponential backoff (3 attempts, 2s/4s/8s)
- Alert on `aftn_gateway_unreachable` log events
- Consider circuit breaker if AFTN endpoint is consistently slow (>5s)

**Priority:** Address when implementing live `IAftnGateway`.

---

## OPS-RISK-06: Stale ADC/FIC Data Due to Polling Lag

**Component:** `AdcFicPollJob`, `AirspaceDataPollJob`

**What happens:** ADC zone records and FIC advisories are polled at intervals (60 min for ADC, 60 min for FIC). Between polls, a military exercise area could be activated or deactivated, and JADS would not reflect this.

**Current behavior:** The polling jobs fetch data on schedule. Between polls, the cached data is used. Pilots filing during the gap see stale data.

**Gap:** For manned aircraft filing, stale ADC data could mean a pilot files a flight plan without knowing about a newly activated restricted zone. For drone operations (post-flight), this is less critical since data is verified after the fact.

**Mitigation (when connecting live ADC/FIC feeds):**
- Reduce polling interval to 15 minutes for ADC records
- Implement inbound webhooks (`/api/adapter/adc/push`) so AFMLUs push changes immediately
- Display "data freshness" indicator on admin portal (minutes since last poll)
- Add `lastPolledAt` timestamp visible in flight plan validation response

**Priority:** Address before production deployment with live AFMLU connections.

---

## OPS-RISK-07: Agent Microservice Unavailability

**Component:** 4 agent microservices (ports 3101–3104)

**What happens:** One or more agent microservices are down (crashed, not deployed, port conflict).

**Current behavior:** The backend makes HTTP calls to agents. If the agent is unreachable, the request fails with a connection error. There is no fallback, circuit breaker, or cached response.

**Gap:** Agent failures are not catastrophic — core operations (flight plan filing, mission upload, forensic verification) work without agents. However:
- NOTAM Interpreter unavailability means raw NOTAM text is not parsed into structured advisories
- Forensic Narrator unavailability means no human-readable forensic narrative for courtroom presentation
- AFTN Draft unavailability means no assisted AFTN message drafting
- Anomaly Advisor unavailability means no automated telemetry anomaly detection

**Mitigation (for production):**
- Run agents as separate containers/processes with `restart: unless-stopped`
- Add health check monitoring for ports 3101–3104
- Backend should handle agent connection errors gracefully (return partial result, not 500)
- Consider adding `/health` endpoint aggregation on backend that checks all agents

**Priority:** LOW — agents are non-critical enhancement services. Core platform is fully functional without them.

---

## OPS-RISK-08: SSE Connection Limits for Clearance Notifications

**Component:** `ClearanceService` → SSE (Server-Sent Events) registry

**What happens:** After filing a manned aircraft flight plan, pilots open SSE connections to receive real-time ADC/FIC clearance notifications. Under high concurrent filing volume, SSE connections accumulate.

**Current behavior:** SSE connections are stored in an in-process `Map` in `ClearanceService`. Each connection is a long-lived HTTP response. There is no connection limit, no idle timeout, and no heartbeat to detect stale connections.

**Gap:** With 100+ concurrent SSE connections:
- Memory pressure from open HTTP responses
- File descriptor exhaustion on the server
- No way to distribute SSE across multiple backend replicas (in-process Map is not shared)

**Mitigation (for production):**
- Add connection limit (e.g., max 500 concurrent SSE connections)
- Add idle timeout (e.g., close connections after 30 minutes of no events)
- Add heartbeat every 30 seconds (SSE `:ping`) to detect dead connections
- For multi-node: replace in-process Map with Redis pub/sub for SSE event distribution

**Priority:** Address before production deployment with high-volume manned aircraft filing.

---

## General Notes

- These risks are **infrastructure/ops concerns**, not application logic bugs. The pure logic layer (AFTN, Merkle, geofence, forensic verification, OFPL validation, altitude compliance, FIR sequencing, etc.) is covered by the 517-test suite.
- None of these are exploitable attack vectors on their own — they are availability and consistency risks.
- The evidence chain remains **tamper-detectable** even if these risks materialize. The gap is in **tamper-resistance** (external anchoring) and **availability** (HSM, clock, AFTN gateway).
- Manned aircraft risks (OPS-RISK-05, 06, 08) are pre-flight/filing risks — they affect service availability, not evidence integrity.
- Agent risks (OPS-RISK-07) are lowest priority — agents are enhancement services, not core operations.
