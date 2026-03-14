# JADS Platform v4.0

**Joint Airspace Drone System** — Forensic-grade UTM & Flight Planning Platform for Indian Airspace

---

## Repository Structure

```
Jads-2/
├── do-not-share/              Proprietary source code & IP (CONFIDENTIAL)
│   ├── jads-backend/          Node.js TypeScript API server (Express + Prisma + PostgreSQL)
│   ├── jads-admin-portal/     React (Vite) — Government admin interface
│   ├── jads-audit-portal/     React (Vite) — Forensic audit interface
│   ├── jads-user-app/         React Native — Pilot-facing mobile app
│   ├── agents/                AI agent source (AFTN, anomaly, forensic, NOTAM)
│   ├── e2e/                   End-to-end test suites
│   ├── ci/                    GitHub Actions pipeline
│   ├── docs/                  Internal development docs
│   └── demo-run.sh            Demo launcher
│
├── jads-android/              Android app — Kotlin (ACTIVE DEVELOPMENT)
├── jads-ios/                  iOS app — Swift (ACTIVE DEVELOPMENT)
├── jads-user-portal/          User web portal — React/Vite (ACTIVE DEVELOPMENT)
│
├── share-this/                Buyer deployment package (NO SOURCE CODE)
│   ├── README.md              Deployment instructions
│   └── api-spec.yaml          OpenAPI 3.0.3 specification
│
├── docs/                      Project documentation
│   ├── CLAIMS_VERIFICATION.md
│   ├── KNOWN_LIMITATIONS.md
│   ├── POST_IDEX_ROADMAP.md
│   └── phase-2-planning/
│
├── README.md                  This file
└── .gitignore
```

> **`do-not-share/`** — All proprietary source code, architecture docs, and development tools. Never distribute without NDA.
>
> **`jads-android/`**, **`jads-ios/`**, **`jads-user-portal/`** — Active client development. Backend API changes must support all three.
>
> **`share-this/`** — Buyer deployment package. No source code — only deployment plans, API specs, and compiled artifacts.
>
> **`docs/`** — Project-level documentation.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend API | Node.js 20+, TypeScript 5.4, Express 4, Prisma 5, PostgreSQL 16 |
| Admin Portal | React + TypeScript, Vite, port 5173 |
| Audit Portal | React + TypeScript, Vite, port 5174 |
| User Portal | React + TypeScript, Vite, port 5175 |
| Android App | Kotlin, Jetpack Compose, Gradle 8.x, Java 17 |
| iOS App | Swift, SwiftUI |
| Auth | JWT + bcrypt (government/military), OTP (civilian pilots) |
| Crypto | ECDSA P-256 (RFC 6979), SHA-256 hash chains, HMAC-SHA256 |

---

## Security Architecture

### Threat Model

| Threat | Defense |
|--------|---------|
| **Malicious Admin** | Two-person rule + admin lineage tracking |
| **Compromised Database** | Row-level SHA-256 hashing, PostgreSQL triggers block UPDATE/DELETE |
| **Compromised Server** | HSM-ready key management, runtime integrity checking |
| **Compromised Device** | Play Integrity API, hardware key attestation, trust scoring (0-100) |
| **Compromised Time** | NTP quorum authority (Android), monotonic clock validation |

### Security Defenses (6 Layers)

1. **External Trust Anchoring** — Evidence ledger entries published to external backends
2. **Backend Compromise Protection** — `IKeyProvider` interface (EnvKeyProvider / HsmKeyProvider)
3. **Long-term Rewrite Protection** — Merkle trees with genesis anchor + inclusion proofs
4. **Compromised Device Protection** — Play Integrity + hardware key attestation + trust score
5. **Colluding Admin Pair Prevention** — Extended two-person rule with lineage checks
6. **Audit Log Immutability** — PostgreSQL triggers block UPDATE/DELETE, auto-computed rowHash

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

# 3. Start User Portal (new terminal)
cd jads-user-portal
npm install && npm run dev           # http://localhost:5175

# 4. Start Admin Portal (new terminal)
cd do-not-share/jads-admin-portal
npm install && npm run dev           # http://localhost:5173

# 5. Start Audit Portal (new terminal)
cd do-not-share/jads-audit-portal
npm install && npm run dev           # http://localhost:5174
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

Full API specification: [`share-this/api-spec.yaml`](share-this/api-spec.yaml) (OpenAPI 3.0.3)

---

## Invariants (Never Break These)

1. **96-byte canonical telemetry payload** — exact byte layout in `CanonicalSerializer.kt` and `canonicalSerializer.ts`
2. **Audit log is append-only** — no UPDATE/DELETE ever (enforced by DB triggers)
3. **Airspace records never deleted** — only superseded
4. **Two-person rule** — no single admin (or colluding pair) can approve their own airspace change
5. `X-JADS-Version: 4.0` on all API calls
6. BigInt as decimal strings in JSON
7. All env via `env.ts` — no direct `process.env` elsewhere

---

## Platform Scope — Post-Flight Forensic Only

> **JADS is a POST-FLIGHT FORENSIC system. It must NEVER be used for live monitoring, real-time C2, or in-flight decision-making.**

---

## iDEX Deadline — 31 March 2026

See [`docs/POST_IDEX_ROADMAP.md`](docs/POST_IDEX_ROADMAP.md) for full tracking.
