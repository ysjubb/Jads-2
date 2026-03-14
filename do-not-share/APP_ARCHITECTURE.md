# JADS Platform v4.0 — Application Architecture

**Last updated:** 2026-03-14
**Classification:** RESTRICTED — For authorised developers and security reviewers.

---

## System Overview

```
                         Internet (pilots, admins, auditors)
                                    │
                                    ▼
                         ┌──────────────────┐
                         │  nginx (TLS 1.3) │  Port 443
                         └────────┬─────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    ┌─────────▼──────┐  ┌────────▼───────┐  ┌────────▼───────┐
    │  Admin Portal   │  │  Audit Portal  │  │  JADS Backend  │
    │  React + Vite   │  │  React + Vite  │  │  Express + TS  │
    │  Port 5173      │  │  Port 5174     │  │  Port 8080     │
    └────────────────┘  └────────────────┘  └───────┬────────┘
                                                     │
                    ┌────────────────────────────────┤
                    │                                │
          ┌─────────▼──────────┐          ┌──────────▼──────────┐
          │  PostgreSQL 16     │          │  4 Agent Services   │
          │  + Prisma ORM      │          │  :3101 :3102        │
          │  Port 5432         │          │  :3103 :3104        │
          └────────────────────┘          └─────────────────────┘

    Android App (Kotlin)
    ├── ECDSA P-256 signing (Android Keystore / StrongBox)
    ├── ML-DSA-65 post-quantum hybrid signatures
    ├── 96-byte canonical telemetry serializer
    ├── SHA-256 hash chain
    ├── SQLCipher encrypted local storage
    ├── NTP quorum time authority
    └── Mission upload to backend via HTTPS
```

---

## Backend Architecture

### Service Layer (45 services)

**Flight Operations:**

| Service | Responsibility |
|---------|---------------|
| `FlightPlanService` | OFPL filing lifecycle, status transitions (DRAFT → FILED → CLEARED) |
| `FlightPlanValidationService` | 5-stage OFPL validation (syntax → route → altitude → FIR → AFTN) |
| `ClearanceService` | ADC/FIC clearance issuance, SSE real-time notifications |
| `AftnMessageBuilder` | ICAO Doc 4444 message construction (FPL, CNL, DLA, CHG) |
| `AftnAddresseeService` | Auto-routes AFTN messages to correct ATC for all 4 Indian FIRs |
| `RouteAdvisoryService` | Advisory-only route recommendations (airway, FL, reporting points) |
| `RoutePlanningService` | ATS waypoint resolution, great circle calculations |
| `AltitudeComplianceEngine` | Semicircular rule, RVSM validation, transition altitude enforcement |
| `FirGeometryEngine` | FIR boundary polygon ray-casting, EET per FIR segment |

**Drone Forensic Pipeline:**

| Service | Responsibility |
|---------|---------------|
| `MissionService` | Mission upload, NPNT validation, lifecycle management |
| `ForensicVerifier` | 10-point forensic verification (I-1 through I-10) |
| `HashChainService` | SHA-256 chain construction and verification (L2 defense) |
| `MerkleTreeService` | Daily Merkle root, inclusion proofs, genesis anchor (L3 defense) |
| `EvidenceLedgerService` | Daily evidence anchor chain (L6 defense) |
| `DeviceAttestationService` | Play Integrity API, key attestation, trust scoring (L4 defense) |
| `NpntVerificationService` | NPNT PA validation, XMLDSig signature verification |

**Security & Audit:**

| Service | Responsibility |
|---------|---------------|
| `AuditIntegrityService` | PostgreSQL trigger management, row-level SHA-256 hashing (L5 defense) |
| `AuditService` | Append-only audit logging, role-scoped access |
| `ExternalAnchorService` | HMAC-signed file + HTTPS webhook to external systems (L1 defense) |
| `KeyManagementService` | IKeyProvider abstraction (EnvKeyProvider / HsmKeyProvider) |
| `AirspaceVersioningService` | Two-person approval, admin lineage collusion detection |

**Airspace Management:**

| Service | Responsibility |
|---------|---------------|
| `ZoneClassificationService` | GREEN/YELLOW/RED zone classification per DGCA UAS Rules |
| `DeconflictionEngine` | Airspace conflict detection and resolution |
| `AirportProximityGate` | 5km/8km haversine proximity against 26 Indian airports |

### Route Handlers

| File | Endpoints | Auth |
|------|-----------|------|
| `authRoutes.ts` | Civilian OTP, special user login, JWT issuance | Public (rate-limited) |
| `flightPlanRoutes.ts` | File/cancel/delay flight plans, SSE events | User JWT |
| `droneRoutes.ts` | Mission upload, forensic reports | User JWT |
| `adminRoutes.ts` | Airspace approvals, clearance issuance | Admin JWT |
| `auditRoutes.ts` | Forensic mission queries (role-scoped) | User JWT |
| `systemRoutes.ts` | Health, metrics, adapter status | Mixed (health=public, metrics=admin) |
| `adapterWebhookRoutes.ts` | Inbound AFMLU/FIR webhooks | Adapter key |

### Middleware

| Middleware | Purpose |
|-----------|---------|
| `authMiddleware.ts` | JWT verification, role extraction, `X-JADS-Version: 4.0` header check |
| `adminAuthMiddleware.ts` | Admin JWT verification (separate secret from user JWT) |
| `adapterAuthMiddleware.ts` | `X-JADS-Adapter-Key` verification for webhook authentication |
| `rateLimiter.ts` | Sliding-window rate limiting per IP (factory pattern, Redis-replaceable) |

### Background Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `EvidenceLedgerJob` | Daily 00:05 UTC | Generate daily Merkle anchor, publish to external backends |
| `NotamPollJob` | Every 5 min | Poll NOTAM feed, store active NOTAMs |
| `MetarPollJob` | Every 30 min | Poll METAR observations for 12 aerodromes |
| `AdcFicPollJob` | Every 6 hours | Sync ADC/FIC clearance data from AFMLU/FIR |
| `AirspaceDataPollJob` | Every 60 min | Sync airspace geometry from external sources |
| `ReverificationJob` | Periodic | Re-check identity documents against CRLs |
| `AnnualReconfirmJob` | Daily | Flag special users needing annual reconfirmation |

### Server Startup Sequence

1. Express setup (Helmet, CORS, body parsing)
2. Route registration (all route groups under `/api/`)
3. Prisma client connection
4. Runtime integrity baseline (SHA-256 of critical service files)
5. Runtime integrity monitoring (5-minute re-check loop)
6. Job scheduler startup (all 9 scheduled jobs)
7. Listen on PORT (default 8080)
8. Graceful shutdown handlers (SIGTERM/SIGINT)

---

## Adapter Pattern

All 7 government system integrations follow a strict interface → stub → live pattern. When `USE_LIVE_ADAPTERS=false`, stubs return mock data. When `true`, live endpoints are called.

```
Interface (IDigitalSkyAdapter)  →  Stub (DigitalSkyAdapterStub)
                                →  Live (DigitalSkyAdapterLive)  ← Government provides
```

| # | Adapter | Connects To |
|---|---------|-------------|
| 1 | Digital Sky | DGCA — drone registration, NPNT PA, flight permissions |
| 2 | UIDAI | Aadhaar — civilian pilot identity verification (OTP eKYC) |
| 3 | AFMLU | IAF — Air Defence Clearance coordination (all 10 AFMLUs) |
| 4 | FIR | AAI — Flight Information Centre clearance (all 4 FIRs) |
| 5 | AFTN Gateway | ATC — Flight plan transmission (ICAO Doc 4444) |
| 6 | METAR | Weather — Aerodrome observations (12 major airports) |
| 7 | NOTAM | Airspace — Notices to Airmen for active restrictions |

Zero core logic changes needed when stubs are replaced with live implementations.

---

## Six-Layer Defense-in-Depth

| Layer | Defense | Threat Mitigated |
|-------|---------|------------------|
| **L1** | External trust anchoring (HMAC file + webhook) | Historical tampering |
| **L2** | SHA-256 hash chain on 96-byte telemetry records | Record insertion/deletion/modification |
| **L3** | Daily Merkle tree + inclusion proofs + genesis anchor | Long-term rewrite attacks |
| **L4** | Play Integrity + key attestation + trust scoring | Compromised Android device |
| **L5** | PostgreSQL triggers block UPDATE/DELETE (via Prisma migration) | Database-level evidence tampering |
| **L6** | Daily evidence ledger chain (`anchorHash = SHA-256(...)`) | Ledger tampering |

Each layer operates independently — compromising one does not defeat the others.

---

## Android Architecture

```
com.jads/
├── crypto/          ECDSA P-256 signing (KeyStoreSigningProvider), ML-DSA-65 hybrid
├── telemetry/       96-byte canonical payload serializer, ForensicFrameStore (SQLCipher)
├── drone/           Mission controller, NPNT compliance gate, geofence checking
├── time/            NtpQuorumAuthority (3+ NTP servers, majority quorum)
├── storage/         SQLCipher encrypted local database
├── network/         Mission upload service, API client
├── ui/              Jetpack Compose (login, mission setup, active mission, history)
└── service/         Foreground service for 1Hz telemetry capture
```

**Key design decision (ADR-1):** Two separate mobile apps exist — the Kotlin-native `jads-android` for drone telemetry (requires Android Keystore/StrongBox, foreground service, SQLCipher) and the React Native `jads-user-app` for pilot workflows (flight plan filing, clearance monitoring). See ADR-1 in CLAUDE.md for full rationale.

---

## Agent Microservices

| Agent | Port | Input | Output |
|-------|------|-------|--------|
| NOTAM Interpreter | 3101 | Raw NOTAM text | Structured advisory (severity, area, time, impact) |
| Forensic Narrator | 3102 | 10-point forensic data | Human-readable narrative + risk score (0–100) |
| AFTN Draft | 3103 | Structured flight data | ICAO-compliant AFTN message + suggestions |
| Anomaly Advisor | 3104 | Telemetry sequence | Detected anomalies (altitude/velocity spikes, time reversals, GPS spoofing) |

All agents are deterministic and rule-based. No LLM dependency. Each runs as an independent Docker container with `GET /health` for monitoring. Core platform operations work without agents.

---

## Data Flow — Drone Mission

```
1. Android App captures 1Hz telemetry
2. Each record → 96-byte canonical payload → CRC32
3. ECDSA P-256 sign (Android Keystore) + optional ML-DSA-65
4. SHA-256 chain link (HASH_n = SHA-256(canonical || HASH_{n-1}))
5. Store in SQLCipher (encrypted at rest)
6. Mission complete → upload to backend
7. Backend re-serializes, re-verifies chain, re-verifies signatures
8. 10-point forensic verification (I-1 through I-10)
9. Evidence ledger entry + external anchor publish
10. Audit log entry (append-only, trigger-protected)
```

## Data Flow — Manned Aircraft Flight Plan

```
1. Pilot files flight plan via API/portal
2. P4A: OFPL syntax validation (Items 7–19, Item 18 parsing)
3. P4B: Route semantic validation (leg parsing, TAS, magnetic track)
4. P4C: Altitude compliance (semicircular rule, RVSM, transition altitude)
5. P4D: FIR sequencing (auto-compute crossings through VIDF/VABB/VECC/VOMF)
6. P4E: AFTN filing (build FPL message, auto-generate addressees, transmit)
7. Status → FILED
8. SSE connection opened for real-time clearance notifications
9. AFMLU issues ADC → SSE push to pilot
10. FIR issues FIC → SSE push to pilot
11. Both ADC + FIC = FULLY_CLEARED
```

---

## CI/CD Pipeline

7 stages, 26 jobs:

| Stage | Jobs | Purpose |
|-------|------|---------|
| 1 | env-check, security-scan, sbom-generation | Environment validation, gitleaks, npm audit, CodeQL, CycloneDX SBOM |
| 2 | determinism-gate | Kotlin ↔ TypeScript byte-identical output verification |
| 3 | android-apk, backend-build, portal-builds | Compilation and artifact generation |
| 3b | pqc-degradation | ML-DSA-65 silent fallback detection |
| 4 | unit-tests (18 suites) | 545 automated tests |
| 5 | route-advisory-tests | Route advisory system tests (23 tests) |
| 6 | integration-gate | Cross-service integration verification |
| 7 | build-gate | Final artifact validation (requires all 26 jobs) |

---

## Invariants (Never Break)

1. **96-byte canonical telemetry payload** — identical bytes from Kotlin and TypeScript
2. **Audit log is append-only** — DB triggers block UPDATE/DELETE
3. **Airspace records never deleted** — only superseded
4. **Two-person rule** — no single admin can create AND approve airspace changes
5. **Post-flight forensic scope** — hard-locked via `assertPostFlightScope()`
6. **BigInt as decimal strings** in all JSON serialization
7. **All env via `env.ts`** — no direct `process.env` access
8. **`X-JADS-Version: 4.0`** required on all API calls
