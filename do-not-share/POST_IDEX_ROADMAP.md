# JADS Platform — Post-iDEX Roadmap

**Last updated:** 2026-03-14
**Purpose:** What to build after the iDEX evaluation, organized by phase.

---

## Phase 2 — Production Hardening (Post-iDEX, 3–6 months)

These items are required before any production deployment with real government systems.

### P2-01: HSM Integration
- Implement `HsmKeyProvider` for AWS CloudHSM / Azure Dedicated HSM / PKCS#11
- Keys never leave hardware boundary
- Connection pooling, health checks, graceful degradation
- Replace `EnvKeyProvider` in production `.env`

### P2-02: Live Government Adapter Implementations
- Digital Sky / eGCA — NPNT PA validation against DGCA PKI root CA (requires DSP certification)
- UIDAI — Aadhaar eKYC via production API
- AFMLU — Live ADC clearance coordination with all 10 AFMLUs
- FIR — Live FIC clearance from all 4 FIR offices
- AFTN Gateway — Live flight plan transmission (requires AFTN gateway license)
- METAR / NOTAM — Live observation feeds

### P2-03: External Anchor Webhook Retry
- Add `publishedExternally` / `externalAnchorStatus` column to `EvidenceLedger`
- Retry unpublished anchors on next job run
- Circuit breaker with exponential backoff on webhook backend
- Alert on `all_anchor_backends_failed`

### P2-04: TSA Server Integration
- Connect to a live RFC 3161 TSA server
- Retry logic for failed TSA requests
- Background job to stamp entries where `rfc3161TimestampToken` is null
- Configure multiple TSA servers for redundancy

### P2-05: Play Integrity Production Configuration
- Google Cloud project setup with production API keys
- Device attestation active for all Android clients
- Trust score thresholds enforced (reject FAILED devices)

### P2-06: Rate Limiter — Redis Backend
- Replace in-process Map with Redis for multi-node deployments
- Consistent rate limiting across all backend replicas

### P2-07: SSE Event Distribution
- Replace in-process SSE Map with Redis pub/sub
- Clearance notifications work across multiple backend nodes

### P2-08: CRL Delta Checking
- Implement CRL delta checks in `ReverificationJob`
- Re-check device certificates against updated CRLs after mission upload
- Alert on newly revoked certificates

### P2-09: PA Polygon Geofence
- Full point-in-polygon containment check against Permission Artefact `<Coordinates>`
- Wire into forensic verification pipeline
- Test with real DGCA PA polygon data

---

## Phase 3 — Scale & Fleet Management (6–12 months)

### P3-01: Multi-Drone Fleet Dashboard
- Real-time fleet view for operators with 10+ drones
- Mission scheduling and assignment
- Fleet-wide forensic compliance dashboard

### P3-02: PQC Phase 2 — I-10 Promotion
- Promote ML-DSA-65 (I-10) from advisory to critical
- All new missions must carry PQC signatures
- Migration path for devices that don't support PQC yet

### P3-03: Kubernetes Deployment
- Helm charts for all services
- CronJob for EvidenceLedgerJob with `concurrencyPolicy: Forbid`
- Horizontal pod autoscaling for backend
- Redis for rate limiting + SSE distribution

### P3-04: E2E Integration Tests
- Full pipeline: Android app → backend → forensic report → audit portal
- Real device farm testing (Firebase Test Lab or BrowserStack)
- Network failure simulation

### P3-05: External Penetration Test
- CERT-In or designated auditor
- Full OWASP assessment
- API fuzzing, auth bypass testing, injection testing

### P3-06: Observability Stack
- Prometheus metrics collection from `/api/system/metrics`
- Grafana dashboards for operational monitoring
- Alertmanager for critical event notification
- Structured logging (JSON) with correlation IDs

---

## Explicitly NOT on the Roadmap

These items are out of scope and will not be built:

1. **Live monitoring / real-time C2** — JADS is post-flight forensic only. This is a hard architectural constraint, not a missing feature.
2. **Autonomous drone control** — JADS does not command drones. It audits their flights after landing.
3. **Counter-drone capability** — JADS does not detect or intercept rogue drones. It provides forensic evidence for investigation.
4. **Consumer-facing app store release** — The Android app is distributed through government-controlled channels, not Google Play.
5. **LLM/AI-based decision making** — All 4 agent microservices are deterministic and rule-based. No external AI dependency.
6. **International deployment** — JADS is designed for Indian airspace. International support would require fundamental changes to regulatory compliance logic.
