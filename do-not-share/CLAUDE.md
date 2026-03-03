# CLAUDE.md — JADS Platform v4.0

## Project Overview

**JADS (Joint Airspace Drone System)** is a forensic-grade UTM (Unmanned Traffic Management) and flight planning platform for Indian airspace. It handles drone mission telemetry with cryptographic integrity, manned flight plan filing (ICAO format), airspace management with two-person approval, and forensic audit capabilities.

## Repository Structure

```
Jads-2/
├── do-not-share/                    Source code & IP (CONFIDENTIAL)
│   ├── jads-backend/                Node.js TypeScript API server (Express + Prisma + PostgreSQL)
│   ├── jads-android/                Kotlin Android app — drone telemetry engine
│   ├── jads-admin-portal/           React (Vite) — Government admin interface
│   ├── jads-audit-portal/           React (Vite) — Forensic audit interface
│   ├── jads-user-app/               React Native — Pilot-facing mobile app (scaffold)
│   ├── agents/                      AI agent source
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
- **Auth**: JWT (jsonwebtoken), bcryptjs, OTP-based civilian login
- **Security**: Helmet, CORS, rate limiting
- **Testing**: Jest + Supertest
- **Jobs**: node-cron scheduled jobs (METAR, NOTAM, ADC/FIC polling, evidence ledger, reverification)

### Android (`jads-android/`)
- **Language**: Kotlin
- **Build**: Gradle 8.x, Java 17 (Temurin)
- **Key modules**:
  - `crypto/` — ECDSA P-256 signing (RFC 6979), SHA-256 hash chain
  - `telemetry/` — 96-byte canonical payload serializer
  - `drone/` — Mission controller, NPNT compliance, geofence checking, GNSS plausibility
  - `time/` — NTP quorum authority, monotonic clock
  - `storage/` — SQLCipher encrypted local DB
  - `network/` — Mission upload service, API client
  - `ui/` — Jetpack Compose screens (login, mission setup, active mission, history)
  - `service/` — Foreground service for mission telemetry capture

### Admin Portal (`jads-admin-portal/`)
- React + TypeScript, Vite, runs on port 5173

### Audit Portal (`jads-audit-portal/`)
- React + TypeScript, Vite, runs on port 5174

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
cp .env.example .env                    # Configure environment
npx prisma migrate deploy               # Create tables
npx ts-node prisma/seed.ts             # Seed demo data
npm run dev                              # http://localhost:8080
```

### Backend Commands
- `npm run dev` — Start dev server with hot reload
- `npm test` — Run Jest test suite
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
- `POST /flight-plans` — File manned flight plan
- `GET /audit/missions` — List missions (scoped by role)
- `GET /audit/missions/:id` — Mission detail + forensic report
- `PATCH /admin/airspace/versions/:id/approve` — Two-person airspace approval

## Invariants (Never Break These)

1. **96-byte canonical telemetry payload** — exact byte layout in `CanonicalSerializer.kt` and `canonicalSerializer.ts`
2. **Audit log is append-only** — no UPDATE/DELETE ever
3. **Airspace records never deleted** — only superseded
4. **Two-person rule** — no single admin can approve their own airspace change
5. **DUPLICATE vs REPLAY_ATTEMPT** — different handling, both logged
6. `X-JADS-Version: 4.0` on all API calls
7. **BigInt as decimal strings** in JSON
8. **All env via `env.ts`** — no direct `process.env` elsewhere

## Regulatory Compliance

- DGCA UAS Rules 2021 — drone zone classifications (GREEN/YELLOW/RED)
- ICAO Doc 4444 — flight plan format
- ICAO Doc 8585 — AFTN addressee sequences
- UAS Rules 2021 Rule 36(1) — 5km/8km airport proximity gates
- Semicircular rule: Odd hundreds (001-179) odd FL; even hundreds (180-360) even FL
- NPNT (No Permission No Takeoff) compliance

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
