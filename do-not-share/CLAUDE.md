# CLAUDE.md — JADS Platform v4.0

**Version:** 4.0.0
**Last updated:** 2026-03-05
**Document revision:** 5

---

## Project Overview

**JADS (Joint Airspace Drone System)** is India's sovereign airspace management and forensic audit platform. It serves two functions under one system:

1. **Manned aircraft** — Full ICAO-compliant flight plan filing with ADC (Air Defence Clearance from IAF), FIC (Flight Information Centre clearance from AAI), NOTAM, and METAR integration. Replaces conventional OFPL workflows.
2. **Drones** — Forensic-grade mission telemetry with cryptographic integrity chains, post-quantum signatures, and legally admissible evidence generation.

The platform handles 27 government entities (DGCA, IAF, Army, Navy, DRDO, HAL, BSF, CRPF, and more), enforces two-person approval for all airspace changes, and produces evidence admissible under the Indian Evidence Act (Section 65B).

## Security Architecture — 6 Layers

JADS implements defence-in-depth across six layers. Each layer operates independently — compromising one does not defeat the others.

| Layer | Defence | Implementation |
|-------|---------|----------------|
| **L1 — Device-Level Signing** | Every telemetry record is signed on the physical device | ECDSA P-256 (RFC 6979) + optional ML-DSA-65 (FIPS 204) post-quantum. Keys stored in Android Keystore (StrongBox where available). Forging evidence requires physical access to the device hardware. |
| **L2 — Hash Chain Integrity** | Telemetry records form an unbreakable chain | Each 96-byte record includes SHA-256 hash of the previous record. Any insertion, deletion, or modification breaks the chain. Server verifies chain integrity on upload. |
| **L3 — Merkle Tree Anchoring** | Daily cryptographic snapshot of all missions | `MerkleTreeService` builds a Merkle tree over all mission IDs each day. Merkle root is published to external systems (DGCA timestamp authority, HMAC-signed webhooks). Enables inclusion proofs — prove a specific mission existed without revealing other missions. Even if the JADS server is fully compromised, published anchors cannot be retroactively altered. |
| **L4 — Device Attestation & Trust Scoring** | Server-side device integrity verification | `DeviceAttestationService` verifies Play Integrity tokens and key attestation certificates. Assigns trust levels: FULL (hardware-backed), PARTIAL (software-only keys), UNATTESTED (no attestation — accepted but flagged with reduced forensic weight), FAILED (active spoofing detected). |
| **L5 — Database-Level Immutability** | PostgreSQL triggers enforce append-only audit log | `AuditIntegrityService` installs triggers: `trg_audit_log_no_update` and `trg_audit_log_no_delete` raise exceptions on any UPDATE/DELETE attempt against the AuditLog table. Even a DBA with direct SQL access is blocked. Row-level SHA-256 hashes detect bypass attempts (trigger disable + direct modification). |
| **L6 — Evidence Ledger Chain** | Append-only daily chain-of-custody anchors | `EvidenceLedgerJob` runs at 00:00 UTC: `anchorHash = SHA-256(date + mission_count + sorted_mission_ids + prevAnchorHash)`. Genesis anchor uses `prevAnchorHash = '0' × 64`. Gap in dates = server downtime (logged). Hash mismatch = tampered ledger. Mission absent from a day's CSV = post-anchor deletion. |

**10-point forensic verification** runs on every uploaded mission: hash chain integrity, time synchronization (NTP quorum), device certificate validity, duplicate/replay detection, geofence compliance, GNSS plausibility, device attestation, strongbox backing, secure boot verification, and post-quantum signature validation.

## Test Coverage

| Suite | Tests | Focus |
|-------|-------|-------|
| mega-stress-chaos | 108 | 500K+ operations, random failure injection, concurrent mutation |
| stage7-logic | 67 | 10-point forensic verification engine |
| stress-chaos | 57 | Hash chain corruption, time manipulation, certificate expiry |
| telemetryDecoder | 34 | 96-byte canonical payload round-trip |
| chaos-integration | 32 | Multi-service failure cascades |
| collapse-chaos | 32 | System recovery under catastrophic conditions |
| concurrent-stress | 30 | Parallel mission uploads, race conditions |
| requirement-traceability | 28 | DGCA UAS Rules 2021 requirement-by-requirement coverage |
| human-workflow | 26 | Two-person approval, scope enforcement, access control |
| clearance-logic | 17 | ADC/FIC issuance, flight plan status transitions |
| job-logic | 14 | Cron jobs: METAR, NOTAM, ADC/FIC polling, evidence ledger |
| specialUserAuth | 13 | Government/military authentication flows |
| pqc-hybrid-fallback | 12 | ML-DSA-65 + ECDSA dual-signature fallback paths |
| pqc-degradation-logging | 12 | Quantum signature degradation detection and logging |
| vectorVerifier | 11 | Cryptographic test vectors (NIST P-256, SHA-256) |
| scope-enforcement | 10 | Role-based data isolation (27 entities) |
| swarm-scale | 8 | 100-drone swarm: 100K records in <15 seconds |
| AuditService | 6 | Append-only audit log integrity |
| **Total** | **522** | **18 suites, all passing** |

## Repository Structure

```
Jads-2/
├── do-not-share/                    Source code & IP (CONFIDENTIAL)
│   ├── jads-backend/                Node.js TypeScript API server (Express + Prisma + PostgreSQL)
│   ├── jads-android/                Kotlin Android app — drone telemetry engine
│   ├── jads-admin-portal/           React (Vite) — Government admin interface
│   ├── jads-audit-portal/           React (Vite) — Forensic audit interface
│   ├── jads-user-app/               React Native — Pilot-facing mobile app (core mission flow in active development)
│   ├── agents/                      4 deterministic microservices (NOTAM, Forensic, AFTN, Anomaly)
│   ├── e2e/                         End-to-end test suites
│   ├── ci/                          GitHub Actions pipeline
│   ├── docker-compose.yml           Local Postgres 16
│   ├── package-for-distribution.sh  Builds share-this from source
│   ├── CLAUDE.md                    This file — AI assistant guide
│   └── KOTLIN_DEV_BRIEF.md          Android module development guide
├── share-this/                      Deployable artifacts (populated by packaging script)
├── README.md                        GitHub-facing README
└── .gitignore
```

## Tech Stack

### Backend (`jads-backend/`)
- **Runtime**: Node.js 20+, TypeScript 5.4
- **Framework**: Express 4
- **ORM**: Prisma 5 with PostgreSQL 16
- **Crypto**: Node.js native `crypto` (ECDSA P-256, SHA-256), `@noble/post-quantum` (ML-DSA-65 / FIPS 204)
- **Auth**: JWT (jsonwebtoken), bcryptjs, OTP-based civilian login
- **Security**: Helmet, CORS, rate limiting, PostgreSQL audit triggers, row-level hashing
- **Testing**: Jest + Supertest (522 tests across 18 suites)
- **Jobs**: node-cron scheduled jobs (METAR, NOTAM, ADC/FIC polling, evidence ledger, reverification)

### Android (`jads-android/`)
- **Language**: Kotlin
- **Build**: Gradle 8.x, Java 17 (Temurin)
- **Key modules**:
  - `crypto/` — ECDSA P-256 signing (RFC 6979), ML-DSA-65 hybrid dual-signatures, SHA-256 hash chain
  - `telemetry/` — 96-byte canonical payload serializer
  - `drone/` — Mission controller, NPNT compliance, geofence checking, GNSS plausibility
  - `time/` — NTP quorum authority, monotonic clock
  - `storage/` — SQLCipher encrypted local DB
  - `network/` — Mission upload service, API client
  - `ui/` — Jetpack Compose screens (login, mission setup, active mission, history)
  - `service/` — Foreground service for mission telemetry capture

### Admin Portal (`jads-admin-portal/`)
- React + TypeScript, Vite, runs on port 5173
- Airspace management, ADC/FIC clearance issuance, OFPL comparison tool, AFTN panel

### Audit Portal (`jads-audit-portal/`)
- React + TypeScript, Vite, runs on port 5174
- Forensic mission viewer, DJI import visibility, role-scoped data access

## Agent Microservices

Four deterministic, rule-based microservices. **No LLM or Ollama dependency** — all analysis is pattern-matching and computation.

| Agent | Port | Purpose |
|-------|------|---------|
| **NOTAM Interpreter** | 3101 | Parses raw NOTAM text → structured interpretation (severity, affected area, time window, operational impact). Keyword-based classification: CLOSED/TFR → CRITICAL, UAS/MILITARY → HIGH, OBST/RWY → MEDIUM. |
| **Forensic Narrator** | 3102 | Takes mission forensic verification data → human-readable narrative + risk score (0–100). Verdict: COMPLIANT (<15), WARNING (15–39), CRITICAL_FAILURE (≥40). |
| **AFTN Draft** | 3103 | Drafts AFTN messages (FPL, CNL, DLA, CHG) from structured input. Auto-defaults for equipment, wake turbulence, flight type. Returns draft + contextual suggestions. |
| **Anomaly Advisor** | 3104 | Analyzes telemetry sequences for anomalies: altitude spikes, velocity spikes, time gaps/reversals, position teleports, GNSS degradation, AGL limit exceedance. |

**Starting agents:**
```bash
cd agents/notam-interpreter && npm install && npx ts-node index.ts   # port 3101
cd agents/forensic-narrator && npm install && npx ts-node index.ts   # port 3102
cd agents/aftn-draft && npm install && npx ts-node index.ts          # port 3103
cd agents/anomaly-advisor && npm install && npx ts-node index.ts     # port 3104
```

Each agent exposes `GET /health` for status checks. If an agent is not running, requests to its service will return HTTP connection errors — the backend does not depend on agents for core operations.

## Development Setup

### Prerequisites
- Docker Desktop (for PostgreSQL)
- Node.js 20+, npm 10+
- Android Studio + Java 17 (for Android builds)

### Backend Quickstart
```bash
docker-compose up -d                    # Start Postgres
cd jads-backend
npm install
cp .env.example .env                    # Configure environment (see table below)
npx prisma migrate deploy               # Create tables
npx ts-node prisma/seed.ts             # Seed demo data
npm run dev                              # http://localhost:8080
```

### Environment Variables

All environment variables are managed through `src/env.ts`. **Never use `process.env` directly** — import from `env.ts`.

#### Required (server exits on startup if missing)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://jads:password@localhost:5432/jads_dev` |
| `JWT_SECRET` | 64-byte hex — signs user app JWTs (8h sessions) | `openssl rand -hex 64` |
| `ADMIN_JWT_SECRET` | 64-byte hex — signs admin portal JWTs (2h sessions). **Must differ from JWT_SECRET.** | `openssl rand -hex 64` |
| `ADAPTER_INBOUND_KEY` | 32-byte hex — authenticates AFMLU/FIR webhook pushes (X-JADS-Adapter-Key header) | `openssl rand -hex 32` |

#### Optional (have safe defaults for development)

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development`, `production`, or `test` |
| `PORT` | `8080` | Server listen port |
| `USE_LIVE_ADAPTERS` | `false` | Set `true` only when live government endpoints are configured. When `false`, all 7 adapters use stubs. |
| `DIGITAL_SKY_BASE_URL` | _(empty)_ | DGCA Digital Sky API base URL |
| `DIGITAL_SKY_API_KEY` | _(empty)_ | Digital Sky API key |
| `UIDAI_BASE_URL` | _(empty)_ | UIDAI Aadhaar verification API |
| `UIDAI_API_KEY` | _(empty)_ | UIDAI API key |
| `AFMLU_BASE_URL` | _(empty)_ | AFMLU base URL (for ADC — Air Defence Clearance coordination) |
| `AFMLU_API_KEY` | _(empty)_ | AFMLU API key |
| `FIR_BASE_URL` | _(empty)_ | FIR office API base URL |
| `AFTN_GATEWAY_HOST` | _(empty)_ | AFTN gateway hostname for flight plan filing |
| `AFTN_GATEWAY_PORT` | `0` | AFTN gateway TCP port |
| `METAR_BASE_URL` | _(empty)_ | METAR observation polling endpoint |
| `NOTAM_BASE_URL` | _(empty)_ | NOTAM feed polling endpoint |

**Note:** In test mode (`NODE_ENV=test`), missing required variables return placeholder strings instead of exiting — so `npm test` works without a `.env` file.

### Backend Commands
- `npm run dev` — Start dev server with hot reload
- `npm test` — Run Jest test suite (522 tests, 18 suites)
- `npm run typecheck` — TypeScript type checking
- `npm run build` — Production build

### Android Build
```bash
cd jads-android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Database

PostgreSQL 16 via Prisma. Schema at `jads-backend/prisma/schema.prisma`.

**Key models**: CivilianUser, SpecialUser, AdminUser, DroneMission, DroneTelemetryRecord, DroneViolation, MannedFlightPlan, AirspaceVersion, AuditLog, EvidenceLedger, AdcRecord, FicRecord, NotamRecord, MetarRecord, AerodromeRecord

## API

Base URL: `http://localhost:8080/api`
All requests require header: `X-JADS-Version: 4.0`

Key endpoints:
- `POST /auth/civilian/request-otp` — Civilian OTP login
- `POST /auth/civilian/verify-otp` — Verify OTP, get JWT
- `POST /auth/special/login` — Government/military login
- `POST /drone/missions/upload` — Upload drone mission telemetry
- `POST /flight-plans` — File manned flight plan (5-stage OFPL validation + AFTN filing)
- `POST /flight-plans/:id/cancel` — Cancel filed plan (auto-generates AFTN CNL message)
- `POST /flight-plans/:id/delay` — Delay filed plan (auto-generates AFTN DLA message)
- `GET /flight-plans/:id/events` — SSE stream for real-time ADC/FIC clearance notifications
- `GET /audit/missions` — List missions (scoped by role)
- `GET /audit/missions/:id` — Mission detail + 10-point forensic report
- `PATCH /admin/airspace/versions/:id/approve` — Two-person airspace approval

## Invariants (Never Break These)

1. **96-byte canonical telemetry payload** — exact byte layout in `CanonicalSerializer.kt` and `canonicalSerializer.ts`
2. **Audit log is append-only** — no UPDATE/DELETE ever (enforced by PostgreSQL triggers, not just application code)
3. **Airspace records never deleted** — only superseded
4. **Two-person rule** — no single admin can approve their own airspace change
5. **DUPLICATE vs REPLAY_ATTEMPT** — different handling, both logged
6. `X-JADS-Version: 4.0` on all API calls
7. **BigInt as decimal strings** in JSON
8. **All env via `env.ts`** — no direct `process.env` elsewhere

## Regulatory Compliance

### DGCA UAS Rules 2021
- Drone zone classifications: GREEN (open), YELLOW (controlled — requires DGCA permission), RED (restricted — no-fly)
- Rule 36(1) airport proximity gates: 5km inner zone, 8km outer zone — haversine distance computation against all 26 Indian international airports
- NPNT (No Permission No Takeoff) compliance gate with permission artefact verification
- Weight categories: Nano (<250g), Micro (250g–2kg), Small (2–25kg), Medium (25–150kg), Large (>150kg) — each with distinct operational rules
- Manufacturer registration and auto-share API for fleet telemetry

### ICAO Doc 4444 (PANS-ATM)
- Full OFPL field syntax validation (Items 7–19) including callsign, flight rules, aircraft type, wake turbulence, equipment, surveillance
- Item 18 semantic parsing: DOF, REG, PBN, OPR, STS, DEP, DEST, RMK, SAR equipment codes (Item 19: R/, S/, J/, D/)
- AFTN message construction: FPL (file), CNL (cancel per §11.4.2), DLA (delay)
- Auto-generated AFTN addressees per departure/enroute/destination ATC routing
- Semicircular rule enforcement: magnetic track 001°–179° → odd FL (FL310, FL330, FL350); 180°–360° → even FL (FL320, FL340, FL360)
- RVSM compliance: FL290–FL410 requires equipment code 'W' in Item 10
- Altitude compliance up to FL450, transition altitude/level enforcement per aerodrome

### ICAO Doc 8585
- AFTN addressee routing sequences for all 4 Indian FIRs (VIDF Delhi, VABB Mumbai, VECC Kolkata, VOMF Chennai)
- Real ATC address book: 24+ Indian aerodromes with correct AFTN addresses

### NIST FIPS 204
- ML-DSA-65 post-quantum cryptographic signatures (hybrid dual-signature with ECDSA P-256)
- Graceful degradation: if PQC signing fails, ECDSA-only signature is accepted with `pqcDegraded: true` flag logged

### Indian Evidence Act
- Section 65B electronic evidence admissibility — cryptographic chain-of-custody designed for courtroom presentation
- Evidence ledger with daily Merkle root anchoring to external systems

### Aerodrome Database
- 26 Indian airports with haversine distance computation for proximity gate enforcement
- Per-aerodrome: ICAO code, lat/lon, elevation, magnetic variation, FIR code, transition altitude/level, military/civilian classification, operational status

## Conventions for AI Assistants

### General Rules
- **Read before writing** — Always read a file before proposing changes
- **Minimal changes** — Only modify what is necessary
- **No speculation** — Do not add features, dependencies, or files that were not requested
- **Preserve existing style** — Match coding style and conventions already in the codebase
- **Security first** — Never introduce credentials, secrets, or vulnerabilities
- **Respect invariants** — The 8 invariants listed above must never be violated

### Key Architectural Patterns
- Backend services are in `src/services/`, routes in `src/routes/`, middleware in `src/middleware/`
- Adapter pattern for external systems: interfaces in `src/adapters/interfaces/`, stubs in `src/adapters/stubs/`
- Android follows package-by-feature: `com.jads.{crypto,drone,telemetry,time,storage,network,ui,service}`
- All timestamps as UTC milliseconds (stored as strings for BigInt safety)

### Testing
- Backend tests: `jads-backend/src/__tests__/` — run with `npm test`
- Android tests: `jads-android/app/src/test/kotlin/com/jads/`
- E2E tests: `e2e/` directory
- When tests exist, run them after making changes
- Do not remove or weaken existing tests without explicit permission

### Git Operations
- Always work on the designated feature branch
- Never force-push or perform destructive git operations without explicit permission
- Review changes with `git diff` before committing
- Use imperative mood in commit messages, keep subject under 72 characters

## Known Issues and Pending Work

1. **CI pipeline path inconsistency (FIXED)** — All pipeline job paths referenced bare `jads-backend/` instead of `do-not-share/jads-backend/`. Corrected in commit `bca0e6d`.
2. **Missing Android APK build job (FIXED)** — Stage 3 had no APK build. Added `android-apk` job (assembleDebug + artifact upload) in commit `bca0e6d`.
3. **Forensic suite naming inconsistency (FIXED)** — CI job was named "8 invariants" instead of "10-point verification". Corrected in commit `bca0e6d`.
4. **PQC degradation test gap (FIXED)** — No CI job ran the `pqc-degradation-logging` suite. Added `pqc-degradation` job to Stage 3b in commit `bca0e6d`.
5. **Layman rewrite of ANUJ_N_LALIT_PLAN_1.md and DEPLOYMENT_GUIDE.md** — Pending. Both docs need extreme step-by-step detail for non-technical users (every mouse click, every tab, every action).
6. **Adversarial audit** — Full adversarial security audit of the platform is pending. Not yet started.
