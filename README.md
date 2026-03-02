# JADS Platform v4.0
**Joint Aviation Data System** — Forensic-grade UTM & Flight Planning Platform

---

## Project Structure

```
jads/
├── jads-backend/          Node.js TypeScript API server
├── jads-admin-portal/     React web — Government admin interface
├── jads-audit-portal/     React web — Forensic audit interface
├── jads-android/          Kotlin — Android drone telemetry engine
├── jads-user-app/         React Native — Pilot-facing mobile app
├── e2e/                   End-to-end test suites
├── ci/                    GitHub Actions pipeline
└── docker-compose.yml     Local Postgres 16
```

---

## Quickstart — Local Demo Setup

### Prerequisites
- Docker Desktop installed and running
- Node.js 20+ (`node --version`)
- npm 10+

### Step 1 — Start the database (one command)
```bash
# From the jads/ root directory
docker-compose up -d

# Verify it's healthy
docker-compose ps
# Should show: jads_postgres   Up (healthy)
```

### Step 2 — Start the backend
```bash
cd jads-backend
npm install
cp .env.example .env        # Already done — .env is pre-configured for docker-compose

# Run database migration (creates all 18 tables)
npx prisma migrate deploy

# Seed with demo data
npx ts-node prisma/seed.ts

# Start the server
npm run dev
# Server running at http://localhost:8080
# Health check: http://localhost:8080/api/system/health
```

### Step 3 — Start the Admin Portal
```bash
# In a new terminal
cd jads-admin-portal
npm install
npm run dev
# Admin portal at http://localhost:5173
# Login: dgca.admin / Admin@JADS2024
```

### Step 4 — Start the Audit Portal
```bash
# In a new terminal
cd jads-audit-portal
npm install
npm run dev
# Audit portal at http://localhost:5174
# Login: (uses same admin credentials or special user)
```

---

## Demo Credentials

| Role | Username | Password |
|------|----------|----------|
| DGCA Super Admin | `dgca.admin` | `Admin@JADS2024` |
| IAF 28 Sqn | `iaf.28sqn` | `28SQN@Secure2024` |
| Civilian Pilot OTP | phone `9999000001` | (OTP logs to console in dev) |

---

## API Overview

Base URL: `http://localhost:8080/api`
All requests require header: `X-JADS-Version: 4.0`

| Endpoint | Description |
|----------|-------------|
| POST `/auth/civilian/request-otp` | Civilian login — request OTP |
| POST `/auth/civilian/verify-otp` | Civilian login — verify OTP → JWT |
| POST `/auth/special/login` | Unit account login → JWT |
| POST `/flight-plans` | File manned flight plan |
| POST `/flight-plans/route-plan` | Validate route, semicircular rule |
| POST `/drone/missions/upload` | Upload drone mission telemetry |
| GET `/audit/missions` | List missions (scoped by role) |
| GET `/audit/missions/:id` | Mission detail + forensic report |
| GET `/audit/violations` | List violations |
| GET `/admin/airspace/versions` | List airspace versions |
| PATCH `/admin/airspace/versions/:id/approve` | Two-person approval |

---

## Invariants (Never Break These)

1. **96-byte canonical telemetry payload** — exact byte layout defined in `CanonicalSerializer.kt` and `canonicalSerializer.ts`
2. **Audit log is append-only** — no UPDATE/DELETE ever
3. **Airspace records never deleted** — only superseded
4. **Two-person rule** — no single admin can approve their own airspace change
5. **DUPLICATE vs REPLAY_ATTEMPT** — different handling, both logged
6. `X-JADS-Version: 4.0` on all API calls
7. BigInt as decimal strings in JSON
8. All env via `env.ts` — no direct `process.env` elsewhere

---

## Android Build

```bash
cd jads-android
# Requires: Android Studio, Java 17 (Temurin), Gradle 8.x
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Key Kotlin modules:
- `CanonicalSerializer.kt` — 96-byte telemetry payload builder
- `EcdsaSigner.kt` — RFC 6979 deterministic ECDSA P-256
- `HashChainEngine.kt` — SHA-256 hash chain
- `NpntComplianceGate.kt` — NPNT + airport proximity gate
- `MissionController.kt` — Mission lifecycle orchestration

---

## Contacts & Compliance

- DGCA UAS Rules 2021 — drone zone classifications
- ICAO Doc 4444 — flight plan format
- ICAO Doc 8585 — AFTN addressee sequences
- UAS Rules 2021 Rule 36(1) — 5km/8km airport proximity
- Semicircular rule: Odd hundreds (001°–179°) → odd FL; Even hundreds (180°–360°) → even FL

