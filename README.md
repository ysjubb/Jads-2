# JADS Platform v4.0

**Joint Airspace Drone System** — Forensic-grade UTM & Flight Planning Platform for Indian Airspace

---

## Repository Structure

This repository is organized into two top-level folders for **IP protection**:

```
Jads-2/
├── do-not-share/              Source code & IP (CONFIDENTIAL)
│   ├── jads-backend/          Node.js TypeScript API server (Express + Prisma + PostgreSQL)
│   ├── jads-admin-portal/     React (Vite) — Government admin interface
│   ├── jads-audit-portal/     React (Vite) — Forensic audit interface
│   ├── jads-android/          Kotlin — Android drone telemetry engine
│   ├── jads-user-app/         React Native — Pilot-facing mobile app
│   ├── agents/                AI agent source (AFTN, anomaly, forensic, NOTAM)
│   ├── e2e/                   End-to-end test suites
│   ├── ci/                    GitHub Actions pipeline
│   ├── docker-compose.yml     Local PostgreSQL 16
│   ├── package-for-distribution.sh  Builds share-this from source
│   ├── CLAUDE.md              AI assistant guide
│   └── KOTLIN_DEV_BRIEF.md   Android development guide
│
├── share-this/                Deployable artifacts (SAFE TO SHARE)
│   └── README.md              Deployment instructions
│
├── README.md                  This file
└── .gitignore
```

> **`do-not-share/`** contains all source code, architecture docs, and development tools.
> Never distribute this folder without a proper NDA and license agreement.
>
> **`share-this/`** is populated by running `do-not-share/package-for-distribution.sh`.
> It contains only compiled JavaScript, static HTML/JS bundles, and deployment scripts.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend API | Node.js 20+, TypeScript 5.4, Express 4, Prisma 5, PostgreSQL 16 |
| Admin Portal | React + TypeScript, Vite, port 5173 |
| Audit Portal | React + TypeScript, Vite, port 5174 |
| Android App | Kotlin, Jetpack Compose, Gradle 8.x, Java 17 |
| Auth | JWT + bcrypt (government/military), OTP (civilian pilots) |
| Crypto | ECDSA P-256 (RFC 6979), SHA-256 hash chains, HMAC-SHA256 |

---

## Security Architecture

### Threat Model

The platform defends against five attack vectors:

| Threat | Defense |
|--------|---------|
| **Malicious Admin** | Two-person rule + admin lineage tracking (prevents colluding admin pairs) |
| **Compromised Database** | Row-level SHA-256 hashing on audit logs, PostgreSQL triggers block UPDATE/DELETE |
| **Compromised Server** | HSM-ready key management, runtime integrity checking of critical service files |
| **Compromised Device** | Play Integrity API verification, hardware key attestation, trust scoring (0-100) |
| **Compromised Time** | NTP quorum authority (Android), monotonic clock validation |

### Security Defenses (6 Layers)

1. **External Trust Anchoring** (`ExternalAnchorService.ts`)
   - Evidence ledger entries published to external backends (HMAC-signed file + HTTPS webhook)
   - Independent verification against external anchors
   - Prevents silent rewriting of internal forensic history

2. **Backend Compromise Protection** (`KeyManagementService.ts`)
   - `IKeyProvider` interface abstracting key operations (sign, verify, getSecret)
   - `EnvKeyProvider` for development, `HsmKeyProvider` for PKCS#11 / cloud HSM in production
   - `RuntimeIntegrityService` — SHA-256 baseline of critical files, periodic re-verification

3. **Long-term Rewrite Protection** (`MerkleTreeService.ts`)
   - Merkle trees over mission IDs with inclusion proofs
   - Genesis anchor with 256-bit random nonce as root of trust
   - Full chain verification from genesis to present (hash chain + date continuity)

4. **Compromised Device Protection** (`DeviceAttestationService.ts`)
   - Google Play Integrity API verification
   - Hardware key attestation certificate chain validation
   - Composite trust score: base(20) + Play Integrity(30) + hardware key(25) + secure boot(15) + app integrity(10)

5. **Colluding Admin Pair Prevention** (`AirspaceVersioningService.ts`)
   - Extended two-person rule: checks if zone creator provisioned the approver or vice versa
   - `ADMIN_LINEAGE_VIOLATION` thrown and audit-logged for any collusion attempt

6. **Audit Log Immutability** (`AuditIntegrityService.ts`)
   - PostgreSQL BEFORE UPDATE/DELETE triggers raise exceptions (blocks all modifications)
   - BEFORE INSERT trigger auto-computes `rowHash` (SHA-256 of row contents)
   - Batch verification API to detect any tampered rows

### Cryptographic Integrity Chain

```
Device (Android)                    Server (Backend)
─────────────────                   ────────────────
ECDSA P-256 sign ──►  Upload  ──►  Verify signature
SHA-256 hash chain     Mission      Re-serialize & hash
96-byte canonical      Telemetry    Evidence ledger entry
NTP quorum time                     External anchor publish
SQLCipher local DB                  Merkle tree inclusion
                                    Audit log (append-only + triggers)
```

---

## Quickstart — Local Development

### Prerequisites
- Docker Desktop (for PostgreSQL)
- Node.js 20+, npm 10+
- Android Studio + Java 17 (for Android builds)

### Start Development Environment
```bash
# 1. Start the database
cd do-not-share
docker-compose up -d

# 2. Start the backend
cd jads-backend
npm install
cp .env.example .env
npx prisma migrate deploy
npx ts-node prisma/seed.ts
npm run dev                          # http://localhost:8080

# 3. Start Admin Portal (new terminal)
cd do-not-share/jads-admin-portal
npm install && npm run dev           # http://localhost:5173

# 4. Start Audit Portal (new terminal)
cd do-not-share/jads-audit-portal
npm install && npm run dev           # http://localhost:5174
```

### Build for Distribution
```bash
cd do-not-share
./package-for-distribution.sh
# Output: jads-distribution/share-this/ (give to clients)
```

---

## Demo Credentials

| Role | Username | Password |
|------|----------|----------|
| DGCA Super Admin | `dgca.admin` | `Admin@JADS2024` |
| IAF 28 Sqn | `iaf.28sqn` | `28SQN@Secure2024` |
| Civilian Pilot OTP | phone `9999000001` | OTP shown in console |

---

## API Overview

Base URL: `http://localhost:8080/api`
Required header: `X-JADS-Version: 4.0`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/civilian/request-otp` | Civilian login — request OTP |
| POST | `/auth/civilian/verify-otp` | Verify OTP, get JWT |
| POST | `/auth/special/login` | Government/military login |
| POST | `/flight-plans` | File manned flight plan (ICAO format) |
| POST | `/drone/missions/upload` | Upload drone mission telemetry |
| GET | `/audit/missions` | List missions (role-scoped) |
| GET | `/audit/missions/:id` | Mission detail + forensic report |
| GET | `/audit/ledger/:date/external-verify` | Verify ledger against external anchors |
| PATCH | `/admin/airspace/versions/:id/approve` | Two-person airspace approval |
| GET | `/system/health` | Health check |

---

## Invariants (Never Break These)

1. **96-byte canonical telemetry payload** — exact byte layout in `CanonicalSerializer.kt` and `canonicalSerializer.ts`
2. **Audit log is append-only** — no UPDATE/DELETE ever (enforced by DB triggers)
3. **Airspace records never deleted** — only superseded
4. **Two-person rule** — no single admin (or colluding pair) can approve their own airspace change
5. **DUPLICATE vs REPLAY_ATTEMPT** — different handling, both logged
6. `X-JADS-Version: 4.0` on all API calls
7. BigInt as decimal strings in JSON
8. All env via `env.ts` — no direct `process.env` elsewhere

---

## Platform Scope — Post-Flight Forensic Only

> **JADS is a POST-FLIGHT FORENSIC system. It must NEVER be used for live monitoring, real-time C2, or in-flight decision-making.**

The 7-stage forensic pipeline (S1-S7) operates exclusively on **completed missions**:

| Stage | Name | Function |
|-------|------|----------|
| S1 | Ingestion | Mission upload after drone has landed |
| S2 | Serialization | Canonical 96-byte payload + CRC32 verification |
| S3 | Hash Chain | I-1 integrity check (HASH_0 derivation + chain walk) |
| S4 | Signature | ECDSA P-256 + ML-DSA-65 (PQC hybrid) verification |
| S5 | Time Validation | NTP sync (I-2) + timestamp monotonicity (I-9) |
| S6 | Geofence | NPNT zone compliance (I-6) + airport proximity |
| S7 | Report | Forensic verdict + evidence ledger + external anchor |

**Hard locks** (enforced in code via `assertPostFlightScope()`):
- `REJECT_LIVE_TELEMETRY` — Ingestion rejects missions where `status !== COMPLETED`
- `REJECT_STREAMING_API` — No WebSocket/SSE streaming endpoints exist
- `REJECT_REALTIME_COMMANDS` — No command-to-drone relay capability
- `REQUIRE_MISSION_END` — `missionEndUtcMs` required before forensic runs

---

## Sovereign Integration — Digital Sky Adapter

For iDEX/MoD sovereign deployment, JADS includes an adapter interface for DGCA's **Digital Sky** platform:

```
src/adapters/interfaces/IDigitalSkyAdapter.ts   — Contract (5 methods)
src/adapters/stubs/DigitalSkyAdapterStub.ts     — Demo stub (no network calls)
```

| Method | Purpose |
|--------|---------|
| `validatePermissionArtefact()` | Verify drone's flight permission (PA) |
| `getDroneRegistration()` | Confirm UIN registration status |
| `verifyPilotLicense()` | Validate Remote Pilot License (RPL) |
| `submitFlightLog()` | Post forensic data to Digital Sky after verification |
| `validateNpntToken()` | Verify NPNT compliance token |

Government replaces the stub with their live Digital Sky integration — **zero changes to core forensic logic**.

---

## Regulatory Compliance

- **DGCA UAS Rules 2021** — Drone zone classifications (GREEN/YELLOW/RED)
- **ICAO Doc 4444** — Flight plan format
- **ICAO Doc 8585** — AFTN addressee sequences
- **UAS Rules 2021 Rule 36(1)** — 5km/8km airport proximity gates
- **Semicircular rule** — Odd hundreds (001-179) odd FL; even hundreds (180-360) even FL
- **NPNT** (No Permission No Takeoff) compliance

---

## iDEX Deadline Tracker — 31 March 2026

### Completed

- [x] Core forensic pipeline (S1-S7) with 10 invariant checks (I-1 through I-10)
- [x] ECDSA P-256 signature verification (Android Keystore → server re-verify)
- [x] PQC hybrid signatures — ML-DSA-65 (FIPS 204) Phase 1 advisory
- [x] 96-byte canonical serializer with CRC32 (Kotlin + TypeScript, cross-verified)
- [x] Hash chain integrity (HASH_0 derivation, chain walk, Attack B defense)
- [x] Two-person rule + admin lineage collusion prevention
- [x] Evidence ledger with external anchor publishing
- [x] Merkle tree service with genesis anchor + inclusion proofs
- [x] Device attestation (Play Integrity + hardware key + trust score)
- [x] NTP quorum authority (Android) + server-side drift detection
- [x] AFTN message builder (ICAO 4444) + Item18 parser + PBN auto-injection
- [x] Geofence engine (point-in-polygon + airport proximity gates)
- [x] Drone weight categorization (NANO-LARGE) per DGCA UAS Rules 2021
- [x] Audit log immutability (PostgreSQL triggers block UPDATE/DELETE)
- [x] Investigation access grants (scoped, time-limited, two-person)
- [x] Digital Sky adapter interface (IDigitalSkyAdapter + stub)
- [x] Post-flight-only scope enforcement (assertPostFlightScope hard locks)
- [x] Shared test helpers (chainBuilders.ts — no builder drift risk)
- [x] Swarm scale test (100 drones x 1000 records = 100k records)
- [x] PQC hybrid fallback tests (12 degradation detection scenarios)
- [x] 480+ backend tests passing (14 suites, 0 failures)

### Remaining

- [ ] Digital Sky live adapter implementation (government provides API credentials)
- [ ] PQC Phase 2: promote I-10 from advisory to critical
- [ ] HSM key provider (PKCS#11) — production key management
- [ ] Retro-revocation background job (CRL re-check after mission end)
- [ ] Runtime integrity service activation (file hash baseline)
- [ ] E2E integration tests (backend + Android + admin portal)
- [ ] Production PostgreSQL hardening (TLS, connection pooling, backup)
- [ ] Load testing with real Android devices (lab environment)
- [ ] Security audit / penetration test (external)
- [ ] DGCA certification submission documentation
