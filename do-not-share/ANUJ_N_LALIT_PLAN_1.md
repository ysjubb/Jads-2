# Anuj n Lalit Plan -1

## JADS Platform — Laptop Setup & Android Deployment Guide

**Date:** 4 March 2026
**Platform version:** 4.0.0
**Goal:** Run the complete JADS platform on the laptop — backend API (with 6-layer security architecture auto-configured), admin portal, audit portal, 4 agent microservices, and Android app — for both manned aircraft flight plan filing and drone forensic audit.

---

## Architecture Overview

| Component | Port | Technology | Purpose |
|-----------|------|-----------|---------|
| **PostgreSQL Database** | `localhost:5432` | Docker (postgres:16-alpine) | Primary data store + audit log with immutability triggers |
| **Backend API** | `localhost:8080` | Node.js + Express + Prisma | 5-stage OFPL pipeline, 10-point forensic engine, 7 background jobs |
| **Admin Portal** | `localhost:5173` | React + Vite | Airspace CMS, flight plans, ADC/FIC clearance, OFPL comparison |
| **Audit Portal** | `localhost:5174` | React + Vite | Forensic mission viewer, DJI import, role-scoped access |
| **NOTAM Interpreter** | `localhost:3101` | Express microservice | Parses raw NOTAMs → structured advisories |
| **Forensic Narrator** | `localhost:3102` | Express microservice | Mission data → human-readable forensic narrative |
| **AFTN Draft** | `localhost:3103` | Express microservice | Structured input → ICAO AFTN message draft |
| **Anomaly Advisor** | `localhost:3104` | Express microservice | Telemetry → anomaly detection report |
| **Android App** | Physical device / emulator | Kotlin + Jetpack Compose | ECDSA + ML-DSA-65 signing, hash chains, NTP quorum |

---

## PHASE 1: Prerequisites — Install These First

### Software Required on the Laptop

| Software | Version | Install |
|----------|---------|---------|
| **Node.js** | v20+ | https://nodejs.org (LTS) or `nvm install 20` |
| **Docker Desktop** | Latest | https://docker.com/products/docker-desktop |
| **Git** | Any | `sudo apt install git` / comes with macOS |
| **Android Studio** | Iguana 2024.1+ | https://developer.android.com/studio |
| **JDK** | 17 | Bundled with Android Studio |

### Verify After Install

```bash
node --version      # should print v20.x or higher
npm --version       # should print 10.x or higher
docker --version    # should print Docker version 2x.x
git --version
java -version       # should print 17.x
```

---

## PHASE 2: Clone the Repository

```bash
cd ~
git clone https://github.com/ysjubb/Jads-2.git
cd Jads-2
git checkout claude/add-claude-documentation-YA3Eb
```

All project files are inside the `do-not-share/` directory.

---

## PHASE 3: Start the Database (PostgreSQL via Docker)

```bash
cd ~/Jads-2/do-not-share
docker-compose up -d
```

This starts a Postgres container with:
- **User**: `jads`
- **Password**: `jads_dev_password`
- **Database**: `jads_dev`
- **Port**: `5432`

Verify:
```bash
docker ps
# Should show jads_postgres as running
```

To wipe everything and start fresh:
```bash
docker-compose down -v
docker-compose up -d
```

---

## PHASE 4: Setup & Start the Backend

### 4a. Install dependencies

```bash
cd ~/Jads-2/do-not-share/jads-backend
npm install
```

### 4b. Create the `.env` file

```bash
cp .env.example .env
```

Edit `.env` and set these values:

```env
NODE_ENV=development
PORT=8080

DATABASE_URL=postgresql://jads:jads_dev_password@localhost:5432/jads_dev

JWT_SECRET=aabbccddee11223344556677889900aabbccddee11223344556677889900aabb
ADMIN_JWT_SECRET=ff00ee11dd22cc33bb44aa5566778899ff00ee11dd22cc33bb44aa5566778899
ADAPTER_INBOUND_KEY=deadbeef12345678deadbeef12345678

USE_LIVE_ADAPTERS=false
```

These are development-only secrets. Fine for demo purposes.

To generate proper random secrets (optional):
```bash
openssl rand -hex 64    # for JWT_SECRET and ADMIN_JWT_SECRET
openssl rand -hex 32    # for ADAPTER_INBOUND_KEY
```

### 4c. Setup the database schema + seed data

```bash
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

The seed creates these demo accounts:

| Account | Username | Password | Use In |
|---------|----------|----------|--------|
| **DGCA Super Admin** | `dgca.admin` | `Admin@JADS2024` | Admin Portal + Audit Portal |
| **IAF 28 Sqn** | `iaf.28sqn` | `28SQN@Secure2024` | Android App (special user) |
| **Civilian Pilot** | phone: `9999000001` | — | Android App (civilian) |

Plus: 3 drone missions with telemetry, 2 manned flight plans, airspace versions, NOTAMs, METARs.

### 4d. Start the backend server

```bash
npm run dev
```

Expected output:
```
[server_started] { port: 8080, version: '4.0' }
```

Test it (in a new terminal):
```bash
curl http://localhost:8080/health
# Should return: {"status":"ok","version":"4.0",...}
```

**KEEP THIS TERMINAL RUNNING.** The backend must stay on.

---

## PHASE 5: Start the Admin Portal

Open a **new terminal tab**:

```bash
cd ~/Jads-2/do-not-share/jads-admin-portal
npm install
npm run dev
```

Expected output:
```
VITE v5.x.x  ready in xxx ms
  Local:   http://localhost:5173/
```

### Open in browser: http://localhost:5173

**Login with:**
- Username: `dgca.admin`
- Password: `Admin@JADS2024`

### What you can do in Admin Portal:
- **Dashboard** — system overview, active stats, entity counts
- **Flight Plans** — view filed manned aircraft plans, issue ADC/FIC clearance numbers, compare with OFPL, view generated AFTN messages (FPL, CNL, DLA)
- **OFPL Comparison Tool** — paste an external OFPL, JADS highlights differences and validates against its own 5-stage pipeline
- **ADC/FIC Clearance Issuance** — simulate AFMLU/FIR issuing clearance numbers (pilot app gets real-time SSE notification)
- **Users** — manage civilian operators (Aadhaar-verified)
- **Special Users** — manage IAF/DGCA/Army/Navy/DRDO/HAL/BSF/CRPF accounts (27 entities)
- **Drone Zones** — manage RED/YELLOW/GREEN airspace zones with 5km/8km airport proximity gates
- **Airspace** — version control with two-person approval workflow (lineage collusion detection)

**KEEP THIS TERMINAL RUNNING.**

---

## PHASE 6: Start the Audit Portal

Open another **new terminal tab**:

```bash
cd ~/Jads-2/do-not-share/jads-audit-portal
npm install
npm run dev
```

Expected output:
```
VITE v5.x.x  ready in xxx ms
  Local:   http://localhost:5174/
```

### Open in browser: http://localhost:5174

### What you can do in Audit Portal:
- **Missions** — browse all drone missions with 10-point forensic verification status (hash chain, NTP, cert, zone, GNSS, PQC...)
- **Mission Detail** — full forensic breakdown: telemetry records, hash chain integrity, ECDSA P-256 signatures, ML-DSA-65 PQC status, device attestation trust score, GNSS integrity
- **DJI Import** — imported DJI flight logs appear alongside native missions
- **Flight Plans** — view filed manned aircraft flight plans with AFTN message history and clearance status
- **Violations** — browse geofence, altitude, and airport proximity violations with severity classification
- **Role-Scoped Access** — DGCA sees everything, AAI sees only manned aircraft (drone access returns 403), Investigation Officers see only granted missions

**KEEP THIS TERMINAL RUNNING.**

---

## PHASE 6B: Start the Agent Microservices (Optional but Recommended)

These are 4 deterministic, rule-based services. **No LLM, no Ollama, no external AI.** Each is ~200 lines of Express + pattern matching.

Open **4 new terminal tabs** (or use a single tab with background processes):

```bash
# Terminal 5 — NOTAM Interpreter
cd ~/Jads-2/do-not-share/agents/notam-interpreter
npm install && npx ts-node index.ts
# → NOTAM Interpreter running on port 3101

# Terminal 6 — Forensic Narrator
cd ~/Jads-2/do-not-share/agents/forensic-narrator
npm install && npx ts-node index.ts
# → Forensic Narrator running on port 3102

# Terminal 7 — AFTN Draft
cd ~/Jads-2/do-not-share/agents/aftn-draft
npm install && npx ts-node index.ts
# → AFTN Draft running on port 3103

# Terminal 8 — Anomaly Advisor
cd ~/Jads-2/do-not-share/agents/anomaly-advisor
npm install && npx ts-node index.ts
# → Anomaly Advisor running on port 3104
```

**Or start all 4 in one command (background):**
```bash
cd ~/Jads-2/do-not-share/agents
for agent in notam-interpreter forensic-narrator aftn-draft anomaly-advisor; do
  (cd $agent && npm install && npx ts-node index.ts &)
done
```

Verify all agents:
```bash
curl http://localhost:3101/health   # NOTAM Interpreter
curl http://localhost:3102/health   # Forensic Narrator
curl http://localhost:3103/health   # AFTN Draft
curl http://localhost:3104/health   # Anomaly Advisor
```

**These agents are optional.** The backend, portals, and Android app work without them. Agents enhance the experience with human-readable NOTAM interpretation, forensic narratives, AFTN message drafting, and anomaly reports.

---

## PHASE 7: Build & Deploy the Android App

### 7a. Generate the Gradle wrapper (one-time only)

```bash
cd ~/Jads-2/do-not-share/jads-android
```

**If Gradle is installed on the laptop:**
```bash
gradle wrapper --gradle-version 8.6
```

**If Gradle is NOT installed, install it first:**
```bash
# macOS
brew install gradle

# Ubuntu/Debian
sudo apt install gradle

# Windows
choco install gradle
```

Then run `gradle wrapper --gradle-version 8.6`.

**OR** just open the folder in Android Studio — it auto-generates the wrapper when prompted.

### 7b. Fix backend URL for local development

**CRITICAL — Two files need editing before building:**

#### File 1: `app/src/main/kotlin/com/jads/service/MissionForegroundService.kt`

Find **line 107**:
```kotlin
backendUrl = "https://jads.internal/api"
```

Change to:

**For emulator:**
```kotlin
backendUrl = "http://10.0.2.2:8080/api"
```

**For physical device on same WiFi:**
```kotlin
backendUrl = "http://YOUR_LAPTOP_IP:8080/api"
```

#### File 2: `app/src/main/kotlin/com/jads/storage/AppPreferences.kt`

Find **line 75**:
```kotlin
private const val DEFAULT_BACKEND_URL = "http://10.0.2.2:3000"
```

Change to:

**For emulator:**
```kotlin
private const val DEFAULT_BACKEND_URL = "http://10.0.2.2:8080"
```

**For physical device on same WiFi:**
```kotlin
private const val DEFAULT_BACKEND_URL = "http://YOUR_LAPTOP_IP:8080"
```

#### Finding your laptop IP:
```bash
# macOS / Linux
ifconfig | grep "inet "
# or
ip addr show | grep "inet "

# Windows
ipconfig
```

Look for the `192.168.x.x` or `10.x.x.x` address.

### 7c. Open in Android Studio

1. **File > Open** > select `~/Jads-2/do-not-share/jads-android/`
2. Wait for Gradle sync (first time downloads ~150MB — needs internet)
3. Green checkmark in bottom bar = sync successful

**If sync fails:**
- "Gradle JVM not found" — File > Project Structure > SDK Location > set JDK 17
- "Could not resolve com.android.tools.build:gradle" — needs internet for download
- "Kotlin daemon failed" — `gradle.properties` already has `-Xmx4g`, check your RAM

### 7d. Build the APK

**From Android Studio menu:**
```
Build > Build Bundle(s) / APK(s) > Build APK(s)
```

**Or from terminal:**
```bash
./gradlew assembleDebug
```

Output APK: `app/build/outputs/apk/debug/app-debug.apk`

### 7e. Deploy to device

#### Option A: Android Emulator
1. Open AVD Manager in Android Studio (Tools > Device Manager)
2. Create a virtual device (Pixel 7, API 34)
3. Click the green **Run** button

#### Option B: Physical Android Device
1. On the phone: Settings > About Phone > tap "Build number" 7 times (enables Developer Options)
2. Go to Settings > Developer Options > enable **USB Debugging**
3. Connect phone to laptop via USB cable
4. Accept the "Allow USB Debugging?" prompt on the phone
5. The phone appears in Android Studio's device dropdown
6. Click **Run**

### 7f. Network setup for physical device

The phone and laptop **MUST be on the same network**.

**Option A — Same WiFi:**
- Both connect to the same WiFi router
- Use the laptop's LAN IP (e.g., `192.168.1.x`)

**Option B — Phone Hotspot:**
- Turn on mobile hotspot on the phone
- Connect the laptop to the phone's hotspot
- Use the laptop's hotspot IP (usually `192.168.43.x`)

**Option C — USB Tethering:**
- Connect phone via USB, enable USB tethering
- Laptop gets an IP from the phone's tethering interface

---

## PHASE 8: Test the Complete System

### Test 1: Admin Portal — Flight Plan Demo

1. Open Admin Portal at http://localhost:5173
2. Login with `dgca.admin` / `Admin@JADS2024`
3. Go to **Flight Plans** — you'll see 2 seeded flight plans
4. Click **AFTN Message** to view the generated ICAO FPL message
5. Click **Compare with OFPL** to test the comparison tool (paste any external OFPL)
6. Click **Issue ADC/FIC** to simulate AFMLU/FIR issuing clearance numbers

### Test 2: Android App — Drone Mission Flow

1. Open the app on phone/emulator
2. Login with an operator ID (e.g., `pilot_demo`, role: Civilian)
3. Grant location permissions when prompted
4. Set up a mission (enter mission parameters)
5. Start the mission — the foreground service starts recording GPS telemetry
6. Let it run for 30-60 seconds
7. Stop the mission — it finalizes the hash chain and uploads to the backend
8. Check the **Audit Portal** (http://localhost:5174) — the mission should appear

### Test 3: Audit Portal — Forensic Verification

1. Open Audit Portal at http://localhost:5174
2. Go to **Missions** — you'll see 3 seeded missions + any you just created
3. Click any mission for the full forensic breakdown:
   - Hash chain integrity (every record cryptographically linked)
   - ECDSA signature verification
   - NTP time sync status
   - Geofence compliance check
   - NPNT zone classification

---

## Terminal Windows Summary

You need **4–8 terminals running simultaneously**:

| Terminal | Directory | Command | Port |
|----------|-----------|---------|------|
| 1 | `do-not-share/` | `docker-compose up -d` | 5432 (runs in background) |
| 2 | `jads-backend/` | `npm run dev` | 8080 |
| 3 | `jads-admin-portal/` | `npm run dev` | 5173 |
| 4 | `jads-audit-portal/` | `npm run dev` | 5174 |
| 5 | `agents/notam-interpreter/` | `npx ts-node index.ts` | 3101 (optional) |
| 6 | `agents/forensic-narrator/` | `npx ts-node index.ts` | 3102 (optional) |
| 7 | `agents/aftn-draft/` | `npx ts-node index.ts` | 3103 (optional) |
| 8 | `agents/anomaly-advisor/` | `npx ts-node index.ts` | 3104 (optional) |

Plus **Android Studio** open for building and deploying the app.

**What starts automatically when the backend starts:**
- PostgreSQL audit triggers (L5 — database immutability) — auto-installed, idempotent
- RuntimeIntegrityService (SHA-256 baseline of critical files, re-checked every 5 min)
- All 7 background jobs (METAR poll, NOTAM poll, ADC/FIC poll, evidence ledger, reverification, annual reconfirm, airspace data)
- Evidence ledger chain (L6 — daily anchoring at 00:05 UTC)

---

## Quick Reference — All URLs

| What | URL |
|------|-----|
| Backend Health Check | http://localhost:8080/health |
| Admin Portal | http://localhost:5173 |
| Audit Portal | http://localhost:5174 |
| Backend API (from phone) | http://YOUR_LAPTOP_IP:8080 |

---

## Quick Reference — All Credentials

| Portal | Username | Password |
|--------|----------|----------|
| Admin Portal | `dgca.admin` | `Admin@JADS2024` |
| Audit Portal | `dgca.admin` | `Admin@JADS2024` |
| Android (Special) | `iaf.28sqn` | `28SQN@Secure2024` |
| Android (Civilian) | phone `9999000001` | OTP (any in dev mode) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `FATAL: Missing required environment variable` | `.env` file missing. Run `cp .env.example .env` and fill in values |
| `docker: command not found` | Install Docker Desktop |
| `ECONNREFUSED localhost:5432` | Docker isn't running. `docker-compose up -d` |
| `npx prisma migrate deploy` fails | Postgres not ready. Check `docker ps` |
| Admin portal blank page | Backend not running. Start with `npm run dev` in `jads-backend/` |
| Android app "Network Error" | Wrong IP/port in the two Kotlin files. Check laptop IP |
| Android app "Connection refused" | Phone and laptop not on same WiFi |
| Gradle sync fails | JDK 17 not set. File > Project Structure > SDK Location |
| "Kotlin daemon failed" | Not enough RAM. Close other apps. `gradle.properties` already has 4GB heap |
| AFTN/OFPL comparison not working | Make sure you paste the full OFPL message starting with `(FPL-` |
| ADC/FIC issuance button grayed out | Flight plan must be in FILED or ACKNOWLEDGED status |

---

## What's NOT Working Yet (Known Limitations)

1. **AFTN Gateway** — uses a stub (`AftnGatewayStub.ts`). Does NOT transmit to real AFMLU/FIR networks. ADC/FIC numbers must be issued manually via Admin Portal.
2. **Digital Sky API** — uses a hardcoded zone map (`HardcodedZoneMapAdapter.kt`). No live connection to DGCA Digital Sky.
3. **Aadhaar Verification** — stub mode. Accepts any OTP in development.
4. **METAR/NOTAM** — stub adapters return hardcoded data. No live feed from IMD/AAI.
5. **Background Upload URL** — `MissionForegroundService.kt` line 107 has a hardcoded URL that must be changed for local dev (see Phase 7b).

---

## Sovereign Handover Architecture — Adapter Pattern

The platform is designed for **government handover**: every external dependency (AFTN, Digital Sky, METAR, NOTAM, UIDAI, AFMLU, FIR) is abstracted behind a TypeScript interface with a development stub. Government integrators replace stubs with live implementations — zero application code changes required.

### Backend Adapter Interfaces (`jads-backend/src/adapters/interfaces/`)

| Interface | Stub | What It Abstracts |
|-----------|------|-------------------|
| `IAftnGateway.ts` | `AftnGatewayStub.ts` | AFTN flight plan filing with ATC (Doc 4444 FPL/DLA/CNL/CHG) |
| `IAfmluAdapter.ts` | `AfmluAdapterStub.ts` | AFMLU airspace zone definitions (ADC records, GeoJSON polygons) |
| `IFirAdapter.ts` | `FirAdapterStub.ts` | FIR circulars (FIC records, supersedes chain) |
| `IMetarAdapter.ts` | `MetarAdapterStub.ts` | Weather observations for 12 major Indian aerodromes |
| `INotamAdapter.ts` | `NotamAdapterStub.ts` | NOTAMs for all 4 Indian FIRs (VIDF, VABB, VECC, VOMF) |

### Injection Pattern — Constructor Defaults

Every consumer accepts an optional adapter, defaulting to the stub:

```typescript
// FlightPlanService.ts — swap AftnGatewayStub for live AFTN gateway
constructor(prisma: PrismaClient, aftnGateway: IAftnGateway = new AftnGatewayStub())

// MetarPollJob.ts — swap for live IMD/AAI METAR feed
constructor(prisma: PrismaClient, adapter?: IMetarAdapter)

// AirspaceDataPollJob.ts — swap all three simultaneously
constructor(prisma, afmluAdapter = new AfmluAdapterStub(), firAdapter = new FirAdapterStub(), metarAdapter = new MetarAdapterStub())
```

### Inbound Webhooks — Government Systems Push to JADS

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/adapter/adc/push` | POST | `X-JADS-Adapter-Key` | AFMLU pushes ADC clearance number |
| `/api/adapter/fic/push` | POST | `X-JADS-Adapter-Key` | FIR pushes FIC number |
| `/api/adapter/clearance/reject` | POST | `X-JADS-Adapter-Key` | Clearance rejection notification |

Authentication: constant-time comparison (`crypto.timingSafeEqual`) via `adapterAuthMiddleware.ts`. Separate from JWT auth.

### Polling Jobs — JADS Pulls from Government Systems

| Job | Cron | Adapter | Idempotency |
|-----|------|---------|-------------|
| `NotamPollJob` | `*/5 * * * *` (5 min) | `INotamAdapter` | Upsert by `notamNumber` |
| `MetarPollJob` | `*/30 * * * *` (30 min) | `IMetarAdapter` | Dedup by `(icaoCode, observationUtc)` |
| `AdcFicPollJob` | `0 */6 * * *` (6 hr) | `IFirAdapter` | Upsert by `ficNumber` |
| `AirspaceDataPollJob` | 60 min (ADC), 60 min +15s (FIC), 30 min (METAR) | All three | Combined upsert |

### Android Adapter (`jads-android/`)

| Interface | Stub | Location |
|-----------|------|----------|
| `IDigitalSkyAdapter` | `HardcodedZoneMapAdapter.kt` | `NpntComplianceGate.kt:111-114` |
| `IAirportProximityChecker` | `AirportProximityChecker` (loads from `aerodrome_proximity.json`) | `NpntComplianceGate.kt:278-360` |

Injected via `AppContainer.kt:62-67`. Replace inline stub with HTTP adapter pointing to `https://digitalsky.dgca.gov.in/api/gcs/flightlog/classify` when API becomes available.

### Pre-Plumbed Environment Variables for Live Adapters

All env vars are already defined in `env.ts` — set `USE_LIVE_ADAPTERS=true` and fill in:

```env
DIGITAL_SKY_BASE_URL=       # eGCA/Digital Sky API endpoint
DIGITAL_SKY_API_KEY=        # Digital Sky credentials
UIDAI_BASE_URL=             # Aadhaar verification endpoint
UIDAI_API_KEY=              # UIDAI credentials
AFMLU_BASE_URL=             # AFMLU data feed
AFMLU_API_KEY=              # AFMLU credentials
FIR_BASE_URL=               # FIR office data feed
AFTN_GATEWAY_HOST=          # AFTN gateway server
AFTN_GATEWAY_PORT=          # AFTN gateway port
METAR_BASE_URL=             # IMD/AAI METAR feed
NOTAM_BASE_URL=             # AAI NOTAM feed
```

---

## Scope Invariants — Post-Flight Only (S2/S3 Enforcement)

**The platform is NOT a real-time monitoring system. This is enforced in code and tested in CI.**

### Architectural Boundary

- **S2**: Platform must NOT be a real-time monitoring system
- **S3**: Drone data flows ONE direction ONLY: device → backend AFTER landing
- **S7**: No live telemetry streaming, no WebSocket, no SSE for drone data

### Enforcement Tests (`e2e/security/scopeEnforcement.test.ts`)

| Test ID | What It Verifies |
|---------|-----------------|
| SCOPE-01 | WebSocket upgrade to `/ws` returns 404/400 (not 101) |
| SCOPE-02 | `/ws/live-track` returns 404 |
| SCOPE-03 | `/ws/drone-position` returns 404 |
| SCOPE-04 | `/api/drone/stream/position` (SSE) returns 404 |
| SCOPE-05 | `/api/drone/missions/active/stream` (SSE) returns 404 |
| SCOPE-11 | Express router stack inspected — no WebSocket/SSE handlers registered anywhere |

If any of these fail, **the build must not ship**. These are architectural boundary tests, not functional tests.

### Frozen Files — DO NOT MODIFY

These files are frozen. Any change breaks cross-runtime hash compatibility:

| File | Runtime | Why Frozen |
|------|---------|-----------|
| `HashChainEngine.kt` | Kotlin | HASH_0/HASH_n computation must match TypeScript byte-for-byte |
| `CanonicalSerializer.kt` | Kotlin | 96-byte frozen layout is the forensic record format |
| `EndianWriter.kt` | Kotlin | Explicit bit-shift big-endian encoding — no ByteBuffer, no library calls |
| `canonicalSerializer.ts` | TypeScript | Must produce identical bytes to Kotlin serializer |

**Runtime assertion** in `HashChainEngine.kt:29-33`: prefix length check runs at startup — crashes immediately if invariant violated.

**Cross-runtime verification**: `canonical_test_vectors.json` contains frozen test vectors (TV-001 through TV-008) verified by both runtimes in CI Stage 2.

---

## Manned Aircraft Compliance — FIR, Semicircular Rule, RVSM, EET

### FIR Geometry Engine (`services/FirGeometryEngine.ts`)

- Determines which India FIRs a route crosses **in route order** (not alphabetical)
- Four India FIRs: **VIDF** (Delhi), **VABB** (Mumbai), **VECC** (Kolkata), **VOMF** (Chennai)
- FIR boundaries are **static constants** from `data/IndiaFirBoundaries.ts` — polygon ray-casting, no external geospatial library
- Computes **EET per FIR segment** using groundspeed from `RouteSemanticEngine`
- Output: `FirCrossing[]` with `firCode`, `entryPoint`, `exitPoint`, `distanceNm`, `eetMinutes`

### Altitude Compliance Engine (`services/AltitudeComplianceEngine.ts`)

**IFR Semicircular Rule** (ICAO Annex 2, Table 3-1 — India):

| Magnetic Track | Direction | Valid FLs Below RVSM | Valid FLs in RVSM Band |
|---------------|-----------|---------------------|----------------------|
| 000-179 | Eastbound | FL070, 090, 110, 130, 150, 170, 190, 210, 230, 250, 270, 290 | FL290, 310, 330, 350, 370, 390, 410 |
| 180-359 | Westbound | FL080, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280 | FL300, 320, 340, 360, 380, 400 |

**RVSM Equipment Check**: Equipment code 'W' required for FL290+. Error: `RVSM_EQUIPMENT_MISSING`.

**Transition Altitude**: Aerodrome-specific first, then national default (9,000 ft).

**Safety**: If `magneticTrackDeg` is null, emits `SEMICIRCULAR_UNABLE_NO_TRACK` warning — **never silently passes**.

### OFPL Validation (`services/OfplValidationService.ts`)

Full ICAO field validation (Item 7 through Item 19). AFTN message generation per ICAO Doc 4444 Section 4 via `AftnMessageBuilder.ts`.

### Two-Person Rule (`services/AirspaceVersioningService.ts`)

Airspace zone changes require approval from a **different admin**:
- Draft created by Admin A → status `DRAFT`
- Admin A tries to approve own draft → **REJECTED** (`CANNOT_APPROVE_OWN_CHANGES`)
- Lineage check prevents one person using two accounts
- Only Admin B approval transitions to `ACTIVE`
- Tested in `HW-ADMIN-02` and `HW-ADMIN-03` (human workflow tests)

---

## NPNT Compliance Gate — Category-Aware Enforcement

**File:** `jads-android/.../drone/NpntComplianceGate.kt`

Three independent checks run in sequence (MUST run FIRST — before NTP sync, before cert check):

1. **Drone weight category** (DGCA UAS Rules 2021): NANO (<250g), MICRO (250g-2kg), SMALL (2-25kg), MEDIUM (25-150kg), LARGE (>150kg)
2. **Zone classification** (RED/YELLOW/GREEN from Digital Sky adapter)
3. **Airport proximity** (exclusion zones per UAS Rules 2021, haversine distance)

### Category-Aware NPNT Exemptions

| Category | NPNT Required? | UIN Required? | Permission Artefact? | Pilot License? |
|----------|---------------|--------------|---------------------|---------------|
| NANO (<250g) | No (GREEN only) | No | No | No |
| MICRO (250g-2kg) | YELLOW zones only | Simplified | YELLOW zones only | No |
| SMALL+ (>2kg) | Yes | Full UIN | Yes | Yes |

### Zone Decision Logic

- **RED zone**: Hard stop, no override, blocks all categories
- **YELLOW zone**: Requires valid permission token (except NANO)
- **GREEN zone**: Proceed if AGL ≤ 400ft; token required above 400ft

Both zone AND proximity checks can independently block a mission. Airport proximity: inner radius = PROHIBITED, outer radius = COORDINATION_REQUIRED.

---

## Testing & CI Pipeline

### CI Pipeline (`ci/jads-platform-pipeline.yml`) — 18 Jobs, 7 Stages

| Stage | Jobs | What It Does |
|-------|------|-------------|
| **0 — Environment Gate** | 1 | Verify Node 20+, Java 17+, Docker, Gradle wrapper |
| **1 — Security Scanning** | 3 | gitleaks (secret scan), npm audit (dependency vulns), CodeQL (SAST) |
| **2 — Determinism Gates** | 3 | **Canonical TS↔Kotlin byte match**, ECDSA cross-runtime, hash chain properties (1K + 10K iterations) |
| **3 — Android Unit Tests** | 2 | NPNT gate + airport proximity, forensic suite (49 + 65 tests) |
| **3b — Backend Unit Tests** | 5 | Adapters, airspace CMS, auth, OFPL validation, telemetry decoder |
| **4 — Schema & Migration** | 2 | Prisma validate, migration integrity |
| **5 — E2E Integration** | 6 | manned, airspace, drone, audit, security (scope), performance |
| **6 — Frontend Builds** | 2 | Admin Portal, Audit Portal |
| **Final — Build Gate** | 1 | All 18 jobs must pass — single gate for merge |

**Key design**: Determinism gates (Stage 2) run BEFORE functional tests. If Kotlin and TypeScript serializers don't produce identical bytes, nothing else matters.

### Test Suites

**Backend (`jads-backend/src/__tests__/`):**

| Suite | Focus |
|-------|-------|
| `stage7-logic.test.ts` | Core business logic (forensics, AFTN, geofence) |
| `mega-stress-chaos.test.ts` | High-volume stress testing |
| `concurrent-stress.test.ts` | Parallel upload races |
| `stress-chaos.test.ts` | Error injection and recovery |
| `collapse-chaos.test.ts` | Bit-flip attacks, key rotation, Attack B demonstration |
| `chaos-integration.test.ts` | Multi-component chaos scenarios |
| `clearance-logic.test.ts` | ADC/FIC clearance workflows |
| `human-workflow.test.ts` | Two-person rule, admin self-grant blocking |
| `jobs/job-logic.test.ts` | Polling job idempotency and scheduling |
| `vectors/vectorVerifier.test.ts` | Frozen test vectors (VEC-01 through VEC-08) |

**Android (`jads-android/app/src/test/`):**

| Suite | Tests | Focus |
|-------|-------|-------|
| `stage8-logic-tests.kt` | 49 | Hash chain, NTP quorum, geofence logic |
| `stage9-stress-chaos.kt` | 65 | GPS loss, process kill, zone map edge cases |
| `GeofenceCheckerTest.kt` | — | Geofence boundary conditions |

**E2E (`e2e/`):**

| Suite | Test IDs | Focus |
|-------|----------|-------|
| `manned/mannedAircraftFlow.test.ts` | E2E-01 to E2E-05 | Flight plan → AFTN → clearance flow |
| `airspace/airspaceCmsFlow.test.ts` | E2E-10 to E2E-14 | Airspace versioning + two-person rule |
| `drone/droneMissionFlow.test.ts` | E2E-15 to E2E-20 | Mission upload → forensic verification |
| `audit/auditFlow.test.ts` | E2E-21 to E2E-27 | Audit trail integrity |
| `security/scopeEnforcement.test.ts` | SCOPE-01 to SCOPE-11 | Post-flight-only enforcement |
| `perf/performanceTests.test.ts` | PERF-01 to PERF-05 | Latency, concurrency, replay detection |

---

## Performance Benchmarks

### Scale Targets (Platform Spec)

- 100 concurrent drone missions
- 1Hz telemetry (1 record/second per drone)
- Upload burst: entire mission (up to 3,600 records for 1-hour flight) in one POST

### Measured Thresholds (`e2e/perf/performanceTests.test.ts`)

| Metric | CI Threshold | Production Target |
|--------|-------------|-------------------|
| Single upload (100 records) | < 2,000 ms | < 500 ms |
| 10 concurrent uploads | < 5,000 ms (all complete, 0 failures) | < 2,000 ms |
| Audit query (50 missions) | < 3,000 ms | < 1,000 ms |
| Idempotent re-upload | Detected (no duplicates) | Same |
| Replay attack | 409 `REPLAY_ATTEMPT_DETECTED` | Same |

### Chaos & Stress Suites

- `mega-stress-chaos.test.ts` — high-volume stress testing
- `concurrent-stress.test.ts` — parallel upload race conditions
- `collapse-chaos.test.ts` — bit-flip attacks, key rotation mid-mission, Attack B (hash chain + payload modification)
- `stage9-stress-chaos.kt` — Android: GPS loss, process kill, zone map edge cases (65 tests)

---

## Cryptography — Current State & PQC Migration Roadmap

### Current Cryptographic Primitives

| Component | Algorithm | Library | Location |
|-----------|-----------|---------|----------|
| Android telemetry signing | ECDSA P-256 (RFC 6979 deterministic nonces) | BouncyCastle 1.77 | `crypto/EcdsaSigner.kt` |
| Backend signature verification | ECDSA P-256 | Node.js `crypto` | `services/ForensicVerifier.ts` |
| Hash chain | SHA-256 | Both runtimes | `crypto/HashChainEngine.kt`, `services/ForensicVerifier.ts` |
| Backend key management | HMAC-SHA256 | Node.js `crypto` | `services/KeyManagementService.ts` |
| Database encryption | SQLCipher (AES-256) | Android SQLCipher | `storage/JadsDatabase.kt` |
| Device attestation | X.509 + EC P-256 | Node.js `crypto` | `services/DeviceAttestationService.ts` |

**Quantum-safe today**: SHA-256 (hash chain), HMAC-SHA256, AES-256 (SQLCipher). Grover's algorithm only halves symmetric security — 256-bit remains 128-bit post-quantum, which is sufficient.

**Quantum-vulnerable**: ECDSA P-256 (Shor's algorithm breaks elliptic curve discrete log in polynomial time).

### PQC Migration Roadmap

**Target algorithm**: **ML-DSA-65** (FIPS 204, formerly CRYSTALS-Dilithium Level 3) — direct replacement for ECDSA in digital signatures.

#### Size Impact

| Property | ECDSA P-256 (current) | ML-DSA-65 (target) |
|----------|----------------------|---------------------|
| Public key | 65 bytes | 1,952 bytes |
| Signature | ~72 bytes (DER) | 3,293 bytes |
| Security | 128-bit classical | 128-bit quantum (NIST Level 3) |

For a 1-hour mission (3,600 records): signatures grow from ~253 KB to ~11.6 MB. Acceptable for post-flight upload.

#### Phase 1 — Hybrid Signatures (NIST SP 800-227 recommended)

Sign every telemetry record with BOTH ECDSA P-256 AND ML-DSA-65. Store both signatures. Verify either. If ML-DSA has a flaw, ECDSA is still there. If quantum breaks ECDSA, ML-DSA is there.

**Schema change**: Add `pqcSignatureHex` column alongside existing `signatureHex`.

**Swap points**:
- Android: `EcdsaSigner.kt` — add parallel `MlDsaSigner.kt` using BouncyCastle PQC provider
- Backend: `ForensicVerifier.ts:518-526` — add ML-DSA verification path

#### Phase 2 — ML-DSA Primary, ECDSA Fallback

Once ML-DSA libraries are stable in Android Keystore (hardware-backed PQC keys), make ML-DSA the primary signer. ECDSA retained for verifying old missions.

#### Phase 3 — ML-DSA Only

Drop ECDSA for new missions. All legacy missions remain verifiable via stored ECDSA signatures.

#### Current Blockers

1. **Android Keystore**: No hardware-backed ML-DSA support yet. BouncyCastle 1.78+ has software ML-DSA, but no StrongBox/TEE protection.
2. **Node.js `crypto`**: No native ML-DSA. Requires `liboqs` bindings or BouncyCastle Java bridge.
3. **Schema**: `signatureHex` column needs companion `pqcSignatureHex` column.

#### Abstraction Layers Already in Place

| Interface | Purpose | Swap Capability |
|-----------|---------|----------------|
| `IKeyProvider` | Backend key management (sign/verify/getSecret) | HSM-ready — swap `EnvKeyProvider` for `HsmKeyProvider` |
| `IAttestationVerifier` | Device attestation (Play Integrity, key attestation) | Provider-swappable |

**Not yet abstracted**: Core ECDSA signing in `EcdsaSigner.kt` (hardcoded `P-256`) and verification in `ForensicVerifier.ts` (hardcoded `namedCurve`). Phase 1 adds a parallel signer rather than abstracting the existing one.

#### What to Say at iDEX

> "Our hash chain (SHA-256) and database encryption (AES-256) are already quantum-resistant. For digital signatures, we use ECDSA P-256 today — the current industry standard with RFC 6979 deterministic nonces. Our PQC migration plan follows NIST SP 800-227: Phase 1 adds hybrid dual-signatures (ECDSA + ML-DSA-65) for cryptographic agility, Phase 2 transitions to PQC-primary once Android Keystore supports hardware-backed FIPS 204 keys. The swap points are identified: `EcdsaSigner.kt` on Android and `ForensicVerifier.ts` on the backend. Estimated effort: 2-4 weeks post-library availability."

---

## Compliance Mapping — Show Me the Code

| Regulation / Requirement | Implementation | File |
|--------------------------|---------------|------|
| **DGCA UAS Rules 2021 — Weight Categories** | NANO/MICRO/SMALL/MEDIUM/LARGE enum with category-specific NPNT exemptions | `NpntComplianceGate.kt:26-53` |
| **NPNT Gate Order (F2)** | Weight category → zone classification → airport proximity (sequential, all must pass) | `NpntComplianceGate.kt:138-276` |
| **Digital Sky Zone Classification** | `IDigitalSkyAdapter.classifyLocation()` → RED/YELLOW/GREEN | `NpntComplianceGate.kt:111-114` |
| **Airport Proximity Exclusion** | Haversine distance, inner radius (PROHIBITED) + outer radius (COORDINATION) | `NpntComplianceGate.kt:278-360` |
| **ICAO Doc 4444 — Flight Plan Filing** | Full Item 7-19 validation, AFTN FPL/DLA/CNL/CHG message generation | `OfplValidationService.ts`, `AftnMessageBuilder.ts` |
| **ICAO Annex 2 — Semicircular Rule** | Eastbound odd FLs, westbound even FLs, RVSM band enforcement | `AltitudeComplianceEngine.ts:25-98` |
| **RVSM Equipment Check** | Equipment code 'W' required above FL290 | `AltitudeComplianceEngine.ts:93-98` |
| **FIR Boundary / EET Computation** | Ray-casting across VIDF/VABB/VECC/VOMF with per-FIR EET | `FirGeometryEngine.ts:33-80` |
| **Two-Person Rule (C3)** | Self-approval blocked, lineage check prevents account farming | `AirspaceVersioningService.ts:166-196` |
| **Forensic Hash Chain** | SHA-256 chained: HASH_0 = SHA256("MISSION_INIT" ∥ missionId_BE), HASH_n = SHA256(canonical ∥ HASH_(n-1)) | `HashChainEngine.kt:7-55` |
| **96-Byte Canonical Payload** | Deterministic big-endian serialization, CRC32 self-check, cross-runtime verified | `CanonicalSerializer.kt:5-116` |
| **ECDSA P-256 Tamper Detection** | RFC 6979 deterministic nonces, DER signatures, defends against Attack B | `EcdsaSigner.kt`, `ForensicVerifier.ts:218-237` |
| **NTP Quorum Time Authority** | 3 NTP servers, 2-of-3 quorum required, mission blocked if sync fails | `NtpQuorumAuthority.kt` |
| **Post-Flight Only (S2/S3)** | No WebSocket, no SSE, no live streaming — tested in SCOPE-01 through SCOPE-11 | `e2e/security/scopeEnforcement.test.ts` |

---

## Project Directory Structure

```
Jads-2/do-not-share/
├── jads-backend/                  Backend API server
│   ├── src/
│   │   ├── server.ts              Express app entry point
│   │   ├── env.ts                 Environment variable validation
│   │   ├── routes/                All API route handlers
│   │   ├── services/              Business logic (FlightPlan, Clearance, Audit, etc.)
│   │   ├── adapters/stubs/        Stub adapters for gov systems
│   │   ├── middleware/            Auth, rate limiting, version check
│   │   ├── jobs/                  Background schedulers (METAR poll, etc.)
│   │   └── __tests__/             Jest test suites
│   ├── prisma/
│   │   ├── schema.prisma          Database schema (authoritative)
│   │   ├── seed.ts                Demo data seeder
│   │   └── migrations/            SQL migration files
│   ├── .env.example               Environment template
│   └── package.json
│
├── jads-admin-portal/             Admin web interface
│   ├── src/pages/
│   │   ├── FlightPlansPage.tsx    Flight plans + OFPL comparison + ADC/FIC issuance
│   │   ├── DashboardPage.tsx      System overview
│   │   ├── DroneZonesPage.tsx     Airspace zone management
│   │   └── ...
│   └── vite.config.ts             Dev server config (proxy → backend:8080)
│
├── jads-audit-portal/             Forensic audit web interface
│   ├── src/pages/
│   │   ├── MissionDetailPage.tsx  Full forensic breakdown
│   │   ├── MissionsPage.tsx       Mission list
│   │   └── ViolationsPage.tsx     Violation browser
│   └── vite.config.ts             Dev server config (proxy → backend:8080)
│
├── jads-android/                  Android app (Kotlin)
│   ├── app/src/main/kotlin/com/jads/
│   │   ├── crypto/                ECDSA + SHA-256 hash chain
│   │   ├── drone/                 Geofence, NPNT, mission controller
│   │   ├── network/               API client (OkHttp)
│   │   ├── storage/               SQLCipher encrypted DB
│   │   ├── telemetry/             96-byte canonical serializer
│   │   ├── time/                  NTP quorum authority
│   │   ├── ui/                    Jetpack Compose screens
│   │   ├── dji/                   DJI flight log ingestion
│   │   └── service/               Foreground GPS service
│   └── README-SETUP.md            Android-specific setup
│
├── agents/                        AI microservices (optional)
├── e2e/                           End-to-end test suites
├── ci/                            CI/CD pipeline config
├── docker-compose.yml             PostgreSQL container definition
├── CLAUDE.md                      AI assistant conventions
├── KOTLIN_DEV_BRIEF.md            Android dev guide
├── IDEX_BATTLE_PLAN.md            Strategic roadmap
└── OPERATIONAL_RISK_REGISTER.md   Risk assessment
```
