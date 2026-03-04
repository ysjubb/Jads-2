# Anuj n Lalit Plan -1

## JADS Platform — Laptop Setup & Android Deployment Guide

**Date:** 4 March 2026
**Goal:** Run all portals on the laptop, develop the Android app, and deploy it today.

---

## Architecture Overview

| Component | Port | Technology |
|-----------|------|-----------|
| **PostgreSQL Database** | `localhost:5432` | Docker (postgres:16-alpine) |
| **Backend API** | `localhost:8080` | Node.js + Express + Prisma |
| **Admin Portal** | `localhost:5173` | React + Vite |
| **Audit Portal** | `localhost:5174` | React + Vite |
| **Android App** | Physical device / emulator | Kotlin + Jetpack Compose |

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
- **Dashboard** — system overview, stats
- **Flight Plans** — view filed plans, issue ADC/FIC clearance numbers, compare with OFPL
- **Users** — manage civilian operators
- **Special Users** — manage IAF/DGCA accounts
- **Drone Zones** — manage RED/YELLOW/GREEN airspace zones
- **Airspace** — version control with two-person approval workflow

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
- **Missions** — browse all drone missions with forensic verification status
- **Mission Detail** — view telemetry records, hash chain integrity, ECDSA signatures
- **Flight Plans** — view filed manned aircraft flight plans
- **Violations** — browse geofence, altitude, and proximity violations

**KEEP THIS TERMINAL RUNNING.**

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

You need **4 terminals running simultaneously**:

| Terminal | Directory | Command | Port |
|----------|-----------|---------|------|
| 1 | `do-not-share/` | `docker-compose up -d` | 5432 (runs in background) |
| 2 | `jads-backend/` | `npm run dev` | 8080 |
| 3 | `jads-admin-portal/` | `npm run dev` | 5173 |
| 4 | `jads-audit-portal/` | `npm run dev` | 5174 |

Plus **Android Studio** open for building and deploying the app.

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
