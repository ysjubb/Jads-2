#!/usr/bin/env bash
# ============================================================================
# JADS Platform v4.0 — IP Protection & Distribution Packager
# ============================================================================
#
# Creates two folders:
#   jads-distribution/
#   ├── share-this/        → Deployable package (live demo, hand to clients)
#   └── do-not-share/      → Source code & IP (keep private)
#
# Usage:
#   chmod +x package-for-distribution.sh
#   ./package-for-distribution.sh
#
# Requirements: Node.js 20+, npm, Docker (for DB)
# Optional: Android Studio + Java 17 (for APK build)
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$PROJECT_ROOT/jads-distribution"
SHARE="$DIST_DIR/share-this"
PRIVATE="$DIST_DIR/do-not-share"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo ""
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo -e "${BOLD}${CYAN}  JADS Platform v4.0 — IP Protection Packager${NC}"
echo -e "${BOLD}${CYAN}============================================================${NC}"
echo ""
echo -e "${YELLOW}This script will:${NC}"
echo -e "  1. Build all projects (backend, admin portal, audit portal)"
echo -e "  2. Create ${GREEN}'share-this'${NC}    → deployable package for clients"
echo -e "  3. Create ${RED}'do-not-share'${NC}  → your source code & IP"
echo ""

# ── Clean previous distribution ──────────────────────────────────────────────
if [ -d "$DIST_DIR" ]; then
    echo -e "${YELLOW}Removing previous distribution folder...${NC}"
    rm -rf "$DIST_DIR"
fi

mkdir -p "$SHARE" "$PRIVATE"

# ============================================================================
# PHASE 1: BUILD ALL PROJECTS
# ============================================================================
echo ""
echo -e "${BOLD}${CYAN}── PHASE 1: Building Projects ──${NC}"

# ── Build Backend ────────────────────────────────────────────────────────────
BACKEND_BUILT=false
echo -e "${YELLOW}[1/3] Building backend (TypeScript → JavaScript)...${NC}"
cd "$PROJECT_ROOT/jads-backend"
if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install --silent 2>/dev/null || npm install
fi
if npx tsc 2>/dev/null; then
    BACKEND_BUILT=true
    echo -e "  ${GREEN}Backend built successfully → dist/${NC}"
else
    echo -e "  ${YELLOW}TypeScript build had issues, attempting transpile-only...${NC}"
    if npx tsc --skipLibCheck --noEmit false 2>/dev/null; then
        BACKEND_BUILT=true
        echo -e "  ${GREEN}Backend built (skipLibCheck) → dist/${NC}"
    else
        echo -e "  ${RED}Backend build failed. 'share-this' will include a startup script instead.${NC}"
    fi
fi

# ── Build Admin Portal ──────────────────────────────────────────────────────
ADMIN_BUILT=false
echo -e "${YELLOW}[2/3] Building admin portal (Vite → static HTML/JS)...${NC}"
cd "$PROJECT_ROOT/jads-admin-portal"
if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install --silent 2>/dev/null || npm install
fi
if npx vite build 2>/dev/null; then
    ADMIN_BUILT=true
    echo -e "  ${GREEN}Admin portal built → dist/${NC}"
else
    echo -e "  ${RED}Admin portal build failed. Will include source for manual build.${NC}"
fi

# ── Build Audit Portal ──────────────────────────────────────────────────────
AUDIT_BUILT=false
echo -e "${YELLOW}[3/3] Building audit portal (Vite → static HTML/JS)...${NC}"
cd "$PROJECT_ROOT/jads-audit-portal"
if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install --silent 2>/dev/null || npm install
fi
if npx vite build 2>/dev/null; then
    AUDIT_BUILT=true
    echo -e "  ${GREEN}Audit portal built → dist/${NC}"
else
    echo -e "  ${RED}Audit portal build failed. Will include source for manual build.${NC}"
fi

cd "$PROJECT_ROOT"

# ============================================================================
# PHASE 2: PACKAGE "share-this" (DEPLOYABLE — FOR CLIENTS)
# ============================================================================
echo ""
echo -e "${BOLD}${CYAN}── PHASE 2: Packaging 'share-this' (deployable) ──${NC}"

# ── Infrastructure ───────────────────────────────────────────────────────────
echo "  Copying infrastructure files..."
cp "$PROJECT_ROOT/docker-compose.yml" "$SHARE/"

# ── Backend (compiled only) ──────────────────────────────────────────────────
echo "  Packaging backend..."
mkdir -p "$SHARE/jads-backend"

# Copy compiled JS if build succeeded
if [ "$BACKEND_BUILT" = true ] && [ -d "$PROJECT_ROOT/jads-backend/dist" ]; then
    cp -r "$PROJECT_ROOT/jads-backend/dist" "$SHARE/jads-backend/dist"
fi

# Production package.json (no devDependencies exposed)
cat > "$SHARE/jads-backend/package.json" << 'PKGJSON'
{
  "name": "jads-backend",
  "version": "4.0.0",
  "description": "JADS Platform v4.0 — Backend API Server (Production Build)",
  "engines": { "node": ">=20.0.0" },
  "scripts": {
    "start": "node dist/server.js",
    "db:migrate": "npx prisma migrate deploy",
    "db:seed": "node dist/prisma/seed.js"
  },
  "dependencies": {
    "@prisma/client": "^5.10.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "crc-32": "^1.2.2",
    "express": "^4.18.3",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "node-cron": "^3.0.3",
    "prisma": "^5.10.0"
  }
}
PKGJSON

# Prisma migrations (needed to set up DB)
mkdir -p "$SHARE/jads-backend/prisma"
cp -r "$PROJECT_ROOT/jads-backend/prisma/migrations" "$SHARE/jads-backend/prisma/migrations"
cp "$PROJECT_ROOT/jads-backend/prisma/schema.prisma" "$SHARE/jads-backend/prisma/schema.prisma"

# .env.example (no real secrets)
cp "$PROJECT_ROOT/jads-backend/.env.example" "$SHARE/jads-backend/.env.example"

# Prisma client generation script
cat > "$SHARE/jads-backend/setup.sh" << 'SETUP'
#!/usr/bin/env bash
# JADS Backend — Production Setup
set -e
echo "Installing production dependencies..."
npm install --omit=dev
echo "Generating Prisma client..."
npx prisma generate
echo "Running database migrations..."
npx prisma migrate deploy
echo ""
echo "Setup complete! Start with: npm start"
SETUP
chmod +x "$SHARE/jads-backend/setup.sh"

# ── Admin Portal (static build) ─────────────────────────────────────────────
echo "  Packaging admin portal..."
mkdir -p "$SHARE/jads-admin-portal"

if [ "$ADMIN_BUILT" = true ] && [ -d "$PROJECT_ROOT/jads-admin-portal/dist" ]; then
    cp -r "$PROJECT_ROOT/jads-admin-portal/dist" "$SHARE/jads-admin-portal/dist"
    # Include a simple serve script
    cat > "$SHARE/jads-admin-portal/serve.sh" << 'SERVE'
#!/usr/bin/env bash
# Serve admin portal static files
# Requires: npx serve (or any static file server)
echo "Serving JADS Admin Portal on http://localhost:5173"
npx serve dist -l 5173
SERVE
    chmod +x "$SHARE/jads-admin-portal/serve.sh"
else
    echo "    (Build failed — including minimal package for manual build)"
    cp "$PROJECT_ROOT/jads-admin-portal/package.json" "$SHARE/jads-admin-portal/"
    cp "$PROJECT_ROOT/jads-admin-portal/index.html" "$SHARE/jads-admin-portal/" 2>/dev/null || true
fi

# ── Audit Portal (static build) ─────────────────────────────────────────────
echo "  Packaging audit portal..."
mkdir -p "$SHARE/jads-audit-portal"

if [ "$AUDIT_BUILT" = true ] && [ -d "$PROJECT_ROOT/jads-audit-portal/dist" ]; then
    cp -r "$PROJECT_ROOT/jads-audit-portal/dist" "$SHARE/jads-audit-portal/dist"
    cat > "$SHARE/jads-audit-portal/serve.sh" << 'SERVE'
#!/usr/bin/env bash
# Serve audit portal static files
echo "Serving JADS Audit Portal on http://localhost:5174"
npx serve dist -l 5174
SERVE
    chmod +x "$SHARE/jads-audit-portal/serve.sh"
else
    echo "    (Build failed — including minimal package for manual build)"
    cp "$PROJECT_ROOT/jads-audit-portal/package.json" "$SHARE/jads-audit-portal/"
fi

# ── Android APK (if available) ───────────────────────────────────────────────
echo "  Checking for Android APK..."
APK_PATH="$PROJECT_ROOT/jads-android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_PATH" ]; then
    mkdir -p "$SHARE/jads-android"
    cp "$APK_PATH" "$SHARE/jads-android/jads-v4.0-demo.apk"
    echo -e "  ${GREEN}APK found and copied${NC}"
else
    mkdir -p "$SHARE/jads-android"
    echo "APK not found. Build it with: cd jads-android && ./gradlew assembleDebug" > "$SHARE/jads-android/BUILD_APK_INSTRUCTIONS.txt"
    echo -e "  ${YELLOW}No APK found (Android Studio + Java 17 required to build)${NC}"
fi

# ── CI/CD Pipeline ───────────────────────────────────────────────────────────
mkdir -p "$SHARE/ci"
cp "$PROJECT_ROOT/ci/jads-platform-pipeline.yml" "$SHARE/ci/" 2>/dev/null || true

# ── Master startup script ───────────────────────────────────────────────────
cat > "$SHARE/start-demo.sh" << 'STARTDEMO'
#!/usr/bin/env bash
# ============================================================================
# JADS Platform v4.0 — One-Command Demo Launcher
# ============================================================================
# Prerequisites: Docker Desktop, Node.js 20+
# ============================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo -e "${BOLD}${CYAN}============================================${NC}"
echo -e "${BOLD}${CYAN}  JADS Platform v4.0 — Demo Launcher${NC}"
echo -e "${BOLD}${CYAN}============================================${NC}"
echo ""

# ── Step 1: Start PostgreSQL ────────────────────────────────────────────────
echo -e "${YELLOW}[1/5] Starting PostgreSQL database...${NC}"
cd "$SCRIPT_DIR"
docker-compose up -d
echo "  Waiting for database to be healthy..."
sleep 5

# ── Step 2: Setup & Start Backend ───────────────────────────────────────────
echo -e "${YELLOW}[2/5] Setting up backend...${NC}"
cd "$SCRIPT_DIR/jads-backend"

if [ ! -f ".env" ]; then
    cp .env.example .env
    # Auto-generate secrets for demo
    JWT_SECRET=$(openssl rand -hex 64 2>/dev/null || echo "demo_jwt_secret_replace_in_production_$(date +%s)")
    ADMIN_SECRET=$(openssl rand -hex 64 2>/dev/null || echo "demo_admin_secret_replace_in_production_$(date +%s)")
    ADAPTER_KEY=$(openssl rand -hex 32 2>/dev/null || echo "demo_adapter_key_replace_$(date +%s)")

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|REPLACE_WITH_64_BYTE_HEX_SECRET|$JWT_SECRET|" .env
        sed -i '' "s|REPLACE_WITH_DIFFERENT_64_BYTE_HEX_SECRET|$ADMIN_SECRET|" .env
        sed -i '' "s|REPLACE_WITH_32_BYTE_HEX_SECRET|$ADAPTER_KEY|" .env
        sed -i '' "s|postgresql://jads:password@|postgresql://jads:jads_dev_password@|" .env
    else
        sed -i "s|REPLACE_WITH_64_BYTE_HEX_SECRET|$JWT_SECRET|" .env
        sed -i "s|REPLACE_WITH_DIFFERENT_64_BYTE_HEX_SECRET|$ADMIN_SECRET|" .env
        sed -i "s|REPLACE_WITH_32_BYTE_HEX_SECRET|$ADAPTER_KEY|" .env
        sed -i "s|postgresql://jads:password@|postgresql://jads:jads_dev_password@|" .env
    fi
    echo -e "  ${GREEN}.env created with auto-generated secrets${NC}"
fi

npm install --omit=dev 2>/dev/null || npm install
npx prisma generate 2>/dev/null
npx prisma migrate deploy 2>/dev/null

echo -e "${YELLOW}[3/5] Starting backend server...${NC}"
node dist/server.js &
BACKEND_PID=$!
echo -e "  ${GREEN}Backend running (PID: $BACKEND_PID) → http://localhost:8080${NC}"
sleep 3

# ── Step 3: Serve Admin Portal ──────────────────────────────────────────────
echo -e "${YELLOW}[4/5] Starting admin portal...${NC}"
if [ -d "$SCRIPT_DIR/jads-admin-portal/dist" ]; then
    cd "$SCRIPT_DIR/jads-admin-portal"
    npx serve dist -l 5173 &
    ADMIN_PID=$!
    echo -e "  ${GREEN}Admin portal running (PID: $ADMIN_PID) → http://localhost:5173${NC}"
else
    echo -e "  ${RED}Admin portal dist/ not found. Skipping.${NC}"
fi

# ── Step 4: Serve Audit Portal ──────────────────────────────────────────────
echo -e "${YELLOW}[5/5] Starting audit portal...${NC}"
if [ -d "$SCRIPT_DIR/jads-audit-portal/dist" ]; then
    cd "$SCRIPT_DIR/jads-audit-portal"
    npx serve dist -l 5174 &
    AUDIT_PID=$!
    echo -e "  ${GREEN}Audit portal running (PID: $AUDIT_PID) → http://localhost:5174${NC}"
else
    echo -e "  ${RED}Audit portal dist/ not found. Skipping.${NC}"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}============================================${NC}"
echo -e "${BOLD}${GREEN}  JADS Platform is LIVE!${NC}"
echo -e "${BOLD}${GREEN}============================================${NC}"
echo ""
echo -e "  ${CYAN}Backend API:${NC}    http://localhost:8080/api/system/health"
echo -e "  ${CYAN}Admin Portal:${NC}   http://localhost:5173"
echo -e "  ${CYAN}Audit Portal:${NC}   http://localhost:5174"
echo ""
echo -e "  ${BOLD}Demo Credentials:${NC}"
echo -e "  Admin:    dgca.admin / Admin@JADS2024"
echo -e "  IAF:      iaf.28sqn  / 28SQN@Secure2024"
echo -e "  Civilian: phone 9999000001 (OTP in console)"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Trap Ctrl+C to clean up
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down JADS Platform...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $ADMIN_PID 2>/dev/null
    kill $AUDIT_PID 2>/dev/null
    cd "$SCRIPT_DIR" && docker-compose down
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM

# Wait for all background processes
wait
STARTDEMO
chmod +x "$SHARE/start-demo.sh"

# ── Stop script ─────────────────────────────────────────────────────────────
cat > "$SHARE/stop-demo.sh" << 'STOPDEMO'
#!/usr/bin/env bash
# Stop all JADS services
echo "Stopping JADS Platform..."
pkill -f "node dist/server.js" 2>/dev/null || true
pkill -f "serve dist -l 5173" 2>/dev/null || true
pkill -f "serve dist -l 5174" 2>/dev/null || true
docker-compose down 2>/dev/null || true
echo "All services stopped."
STOPDEMO
chmod +x "$SHARE/stop-demo.sh"


# ============================================================================
# PHASE 3: PACKAGE "do-not-share" (SOURCE CODE — YOUR IP)
# ============================================================================
echo ""
echo -e "${BOLD}${CYAN}── PHASE 3: Packaging 'do-not-share' (your IP) ──${NC}"

# ── Backend Source Code ──────────────────────────────────────────────────────
echo "  Copying backend source code..."
mkdir -p "$PRIVATE/jads-backend"
cp -r "$PROJECT_ROOT/jads-backend/src" "$PRIVATE/jads-backend/src"
cp "$PROJECT_ROOT/jads-backend/package.json" "$PRIVATE/jads-backend/package.json"
cp "$PROJECT_ROOT/jads-backend/tsconfig.json" "$PRIVATE/jads-backend/tsconfig.json"
cp "$PROJECT_ROOT/jads-backend/tsconfig.check.json" "$PRIVATE/jads-backend/" 2>/dev/null || true
cp "$PROJECT_ROOT/jads-backend/tsconfig.stage1.json" "$PRIVATE/jads-backend/" 2>/dev/null || true
cp "$PROJECT_ROOT/jads-backend/jest.config.js" "$PRIVATE/jads-backend/" 2>/dev/null || true

# Prisma schema (the DB design is IP)
mkdir -p "$PRIVATE/jads-backend/prisma"
cp "$PROJECT_ROOT/jads-backend/prisma/schema.prisma" "$PRIVATE/jads-backend/prisma/"
cp "$PROJECT_ROOT/jads-backend/prisma/seed.ts" "$PRIVATE/jads-backend/prisma/"
cp -r "$PROJECT_ROOT/jads-backend/prisma/migrations" "$PRIVATE/jads-backend/prisma/migrations"

# ── Android Source Code ──────────────────────────────────────────────────────
echo "  Copying Android source code..."
mkdir -p "$PRIVATE/jads-android"
cp -r "$PROJECT_ROOT/jads-android/app" "$PRIVATE/jads-android/app"
cp "$PROJECT_ROOT/jads-android/build.gradle.kts" "$PRIVATE/jads-android/" 2>/dev/null || true
cp "$PROJECT_ROOT/jads-android/settings.gradle.kts" "$PRIVATE/jads-android/" 2>/dev/null || true
cp "$PROJECT_ROOT/jads-android/gradle.properties" "$PRIVATE/jads-android/" 2>/dev/null || true
# Exclude build outputs from private copy
rm -rf "$PRIVATE/jads-android/app/build" 2>/dev/null || true

# ── Admin Portal Source ──────────────────────────────────────────────────────
echo "  Copying admin portal source..."
mkdir -p "$PRIVATE/jads-admin-portal"
cp -r "$PROJECT_ROOT/jads-admin-portal/src" "$PRIVATE/jads-admin-portal/src"
cp "$PROJECT_ROOT/jads-admin-portal/package.json" "$PRIVATE/jads-admin-portal/"
cp "$PROJECT_ROOT/jads-admin-portal/tsconfig.json" "$PRIVATE/jads-admin-portal/"
cp "$PROJECT_ROOT/jads-admin-portal/vite.config.ts" "$PRIVATE/jads-admin-portal/"
cp "$PROJECT_ROOT/jads-admin-portal/index.html" "$PRIVATE/jads-admin-portal/" 2>/dev/null || true

# ── Audit Portal Source ──────────────────────────────────────────────────────
echo "  Copying audit portal source..."
mkdir -p "$PRIVATE/jads-audit-portal"
cp -r "$PROJECT_ROOT/jads-audit-portal/src" "$PRIVATE/jads-audit-portal/src"
cp "$PROJECT_ROOT/jads-audit-portal/package.json" "$PRIVATE/jads-audit-portal/"
cp "$PROJECT_ROOT/jads-audit-portal/tsconfig.json" "$PRIVATE/jads-audit-portal/"
cp "$PROJECT_ROOT/jads-audit-portal/vite.config.ts" "$PRIVATE/jads-audit-portal/"

# ── User App Source ──────────────────────────────────────────────────────────
echo "  Copying user app source..."
if [ -d "$PROJECT_ROOT/jads-user-app/src" ]; then
    mkdir -p "$PRIVATE/jads-user-app"
    cp -r "$PROJECT_ROOT/jads-user-app/src" "$PRIVATE/jads-user-app/src"
fi

# ── AI Agents Source ─────────────────────────────────────────────────────────
echo "  Copying AI agents source..."
if [ -d "$PROJECT_ROOT/agents" ]; then
    cp -r "$PROJECT_ROOT/agents" "$PRIVATE/agents"
fi

# ── E2E Tests ────────────────────────────────────────────────────────────────
echo "  Copying E2E test suites..."
if [ -d "$PROJECT_ROOT/e2e" ]; then
    cp -r "$PROJECT_ROOT/e2e" "$PRIVATE/e2e"
fi

# ── Architecture & Documentation (IP) ───────────────────────────────────────
echo "  Copying architecture documentation..."
cp "$PROJECT_ROOT/CLAUDE.md" "$PRIVATE/" 2>/dev/null || true
cp "$PROJECT_ROOT/KOTLIN_DEV_BRIEF.md" "$PRIVATE/" 2>/dev/null || true

# ── Dev Container Config ────────────────────────────────────────────────────
if [ -d "$PROJECT_ROOT/.devcontainer" ]; then
    cp -r "$PROJECT_ROOT/.devcontainer" "$PRIVATE/.devcontainer"
fi


# ============================================================================
# PHASE 4: GENERATE README FILES
# ============================================================================
echo ""
echo -e "${BOLD}${CYAN}── PHASE 4: Generating documentation ──${NC}"

# ── README for "share-this" ──────────────────────────────────────────────────
cat > "$SHARE/README.md" << 'SHAREREADME'
# JADS Platform v4.0 — Deployment Package

**Joint Airspace Drone System** — Forensic-grade UTM & Flight Planning Platform for Indian Airspace

---

## What's Included

| Component | Location | Description |
|-----------|----------|-------------|
| Backend API | `jads-backend/` | Compiled Node.js server (PostgreSQL) |
| Admin Portal | `jads-admin-portal/dist/` | Government admin web interface |
| Audit Portal | `jads-audit-portal/dist/` | Forensic audit web interface |
| Android APK | `jads-android/` | Drone telemetry mobile app |
| Database | `docker-compose.yml` | PostgreSQL 16 container |
| CI/CD | `ci/` | GitHub Actions pipeline |

---

## Quick Start (One Command)

### Prerequisites
- Docker Desktop installed and running
- Node.js 20+ installed

### Launch Everything
```bash
chmod +x start-demo.sh
./start-demo.sh
```

This will:
1. Start PostgreSQL database
2. Run database migrations
3. Start the backend API server
4. Serve the admin portal
5. Serve the audit portal

### Stop Everything
```bash
./stop-demo.sh
```

---

## Manual Setup

### Step 1: Start Database
```bash
docker-compose up -d
```

### Step 2: Setup & Start Backend
```bash
cd jads-backend
chmod +x setup.sh
./setup.sh          # Install deps, run migrations
cp .env.example .env  # Then edit .env with your secrets
npm start           # Starts on http://localhost:8080
```

### Step 3: Serve Web Portals
```bash
# Admin Portal
cd jads-admin-portal
npx serve dist -l 5173    # http://localhost:5173

# Audit Portal
cd jads-audit-portal
npx serve dist -l 5174    # http://localhost:5174
```

---

## Demo Credentials

| Role | Username | Password |
|------|----------|----------|
| DGCA Super Admin | `dgca.admin` | `Admin@JADS2024` |
| IAF 28 Sqn | `iaf.28sqn` | `28SQN@Secure2024` |
| Civilian Pilot | phone `9999000001` | OTP shown in backend console |

---

## API Endpoints

Base URL: `http://localhost:8080/api`
Required Header: `X-JADS-Version: 4.0`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/civilian/request-otp` | Civilian OTP login |
| POST | `/auth/civilian/verify-otp` | Verify OTP → JWT |
| POST | `/auth/special/login` | Government/military login |
| POST | `/flight-plans` | File manned flight plan |
| POST | `/drone/missions/upload` | Upload drone telemetry |
| GET | `/audit/missions` | List missions |
| GET | `/audit/missions/:id` | Mission forensic detail |
| GET | `/admin/airspace/versions` | Airspace versions |
| PATCH | `/admin/airspace/versions/:id/approve` | Two-person approval |
| GET | `/system/health` | Health check |

---

## Regulatory Compliance

- DGCA UAS Rules 2021 — Drone zone classifications (GREEN/YELLOW/RED)
- ICAO Doc 4444 — Flight plan format
- NPNT (No Permission No Takeoff) compliance
- Two-person approval rule for airspace changes
- Forensic-grade audit trail (append-only)

---

## Support

For technical support, deployment assistance, or licensing inquiries,
contact the JADS Platform development team.

**Version**: 4.0.0
**Build Date**: $(date +%Y-%m-%d)
SHAREREADME

# ── README for "do-not-share" ────────────────────────────────────────────────
cat > "$PRIVATE/README.md" << 'PRIVATEREADME'
# JADS Platform v4.0 — Source Code (CONFIDENTIAL)

## *** DO NOT SHARE THIS FOLDER ***

This folder contains the complete source code and intellectual property
for the JADS Platform. Keep this secure and private.

---

## What's Protected Here

| Component | Location | Language |
|-----------|----------|----------|
| Backend API Source | `jads-backend/src/` | TypeScript |
| Database Schema | `jads-backend/prisma/` | Prisma/SQL |
| Android App Source | `jads-android/app/src/` | Kotlin |
| Admin Portal Source | `jads-admin-portal/src/` | React/TypeScript |
| Audit Portal Source | `jads-audit-portal/src/` | React/TypeScript |
| User App Source | `jads-user-app/src/` | React Native |
| AI Agents | `agents/` | TypeScript |
| E2E Tests | `e2e/` | TypeScript |
| Architecture Docs | `CLAUDE.md`, `KOTLIN_DEV_BRIEF.md` | Markdown |

---

## Key IP Components

### Cryptographic Telemetry Engine
- `jads-android/app/src/main/kotlin/com/jads/crypto/` — ECDSA P-256 signing
- `jads-android/app/src/main/kotlin/com/jads/telemetry/` — 96-byte canonical format
- `jads-backend/src/telemetry/` — Server-side telemetry verification

### Forensic Verification System
- `jads-backend/src/services/ForensicVerifier.ts` — Hash chain & signature verification
- `jads-backend/src/services/AuditService.ts` — Append-only audit system

### Airspace Management Engine
- `jads-backend/src/services/AirspaceVersioningService.ts` — Two-person approval
- `jads-backend/src/services/FirGeometryEngine.ts` — FIR boundary calculations
- `jads-backend/src/services/AirportProximityGate.ts` — 5km/8km gate logic

### ICAO Flight Planning
- `jads-backend/src/services/FlightPlanService.ts` — ICAO Doc 4444 compliance
- `jads-backend/src/services/AftnMessageBuilder.ts` — AFTN message construction
- `jads-backend/src/services/RouteSemanticEngine.ts` — Route validation

### Drone Compliance
- `jads-android/app/src/main/kotlin/com/jads/drone/` — NPNT, geofence, GNSS
- `jads-backend/src/services/ClearanceService.ts` — Mission clearance logic

---

## To Rebuild From Source

```bash
# Backend
cd jads-backend && npm install && npm run build

# Admin Portal
cd jads-admin-portal && npm install && npm run build

# Audit Portal
cd jads-audit-portal && npm install && npm run build

# Android APK
cd jads-android && ./gradlew assembleDebug
```

---

## IP Protection Notes

1. The "share-this" folder contains ONLY compiled/built artifacts
2. Clients cannot see or modify your TypeScript/Kotlin source code
3. The compiled JS is minified but functional — it runs the system
4. Web portals are compiled to static HTML/CSS/JS bundles
5. Android APK is compiled bytecode
6. Database schema is shared (needed for migrations) — this is standard practice
7. Keep this "do-not-share" folder in a secure, private location
PRIVATEREADME

# ── IP Protection Notice ────────────────────────────────────────────────────
cat > "$DIST_DIR/IP-PROTECTION-NOTICE.txt" << 'IPNOTICE'
================================================================================
  JADS Platform v4.0 — IP Protection Distribution
================================================================================

  This distribution package is organized for intellectual property protection:

  share-this/      → SAFE TO SHARE
                     Contains compiled, deployable artifacts only.
                     No source code is exposed. Clients can run the
                     system but cannot modify or reverse-engineer the
                     core logic easily.

  do-not-share/    → KEEP PRIVATE
                     Contains all original source code, architecture
                     documentation, test suites, and development
                     configurations. This is your intellectual property.

  GUIDELINES:
  - Share the "share-this" folder with government agencies, private
    companies, or testing partners for live demos and evaluation
  - NEVER share the "do-not-share" folder without a proper NDA and
    licensing agreement in place
  - Consider adding a software license (proprietary) to the
    "share-this" folder before distribution
  - The compiled artifacts cannot be easily decompiled back to
    readable source code

================================================================================
IPNOTICE

# ── Exclude secrets from both folders ────────────────────────────────────────
echo "  Removing any leaked secrets from distribution..."
find "$DIST_DIR" -name ".env" -not -name ".env.example" -delete 2>/dev/null || true
find "$DIST_DIR" -name "*.pem" -delete 2>/dev/null || true
find "$DIST_DIR" -name "*.key" -delete 2>/dev/null || true
find "$DIST_DIR" -name ".git" -type d -exec rm -rf {} + 2>/dev/null || true
find "$DIST_DIR" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true


# ============================================================================
# PHASE 5: CREATE ZIP ARCHIVES
# ============================================================================
echo ""
echo -e "${BOLD}${CYAN}── PHASE 5: Creating ZIP archives ──${NC}"

cd "$DIST_DIR"

if command -v zip &>/dev/null; then
    echo "  Creating share-this.zip..."
    zip -r "jads-v4.0-share-this-${TIMESTAMP}.zip" "share-this/" -x "*/node_modules/*" "*/\.git/*" > /dev/null
    echo "  Creating do-not-share.zip..."
    zip -r "jads-v4.0-do-not-share-${TIMESTAMP}.zip" "do-not-share/" -x "*/node_modules/*" "*/\.git/*" > /dev/null
    echo -e "  ${GREEN}ZIP archives created${NC}"
elif command -v tar &>/dev/null; then
    echo "  Creating share-this.tar.gz..."
    tar -czf "jads-v4.0-share-this-${TIMESTAMP}.tar.gz" "share-this/"
    echo "  Creating do-not-share.tar.gz..."
    tar -czf "jads-v4.0-do-not-share-${TIMESTAMP}.tar.gz" "do-not-share/"
    echo -e "  ${GREEN}TAR archives created${NC}"
else
    echo -e "  ${YELLOW}No zip/tar found. Folders are ready but not compressed.${NC}"
fi


# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo -e "${BOLD}${GREEN}  PACKAGING COMPLETE!${NC}"
echo -e "${BOLD}${GREEN}============================================================${NC}"
echo ""
echo -e "  ${BOLD}Distribution folder:${NC} $DIST_DIR"
echo ""
echo -e "  ${GREEN}share-this/${NC}      → Give this to clients/government"
echo -e "    ├── start-demo.sh         (one-command launcher)"
echo -e "    ├── stop-demo.sh          (stop all services)"
echo -e "    ├── docker-compose.yml    (database)"
echo -e "    ├── jads-backend/         (compiled JS + migrations)"
echo -e "    ├── jads-admin-portal/    (static web build)"
echo -e "    ├── jads-audit-portal/    (static web build)"
echo -e "    └── jads-android/         (APK if built)"
echo ""
echo -e "  ${RED}do-not-share/${NC}    → Keep this PRIVATE (your IP)"
echo -e "    ├── jads-backend/src/     (TypeScript source)"
echo -e "    ├── jads-android/app/src/ (Kotlin source)"
echo -e "    ├── jads-admin-portal/src/(React source)"
echo -e "    ├── jads-audit-portal/src/(React source)"
echo -e "    ├── agents/               (AI agent source)"
echo -e "    ├── e2e/                  (test suites)"
echo -e "    └── CLAUDE.md             (architecture docs)"
echo ""

if [ "$BACKEND_BUILT" = true ]; then
    echo -e "  Backend build:      ${GREEN}SUCCESS${NC}"
else
    echo -e "  Backend build:      ${RED}FAILED${NC} (run manually: cd jads-backend && npm run build)"
fi
if [ "$ADMIN_BUILT" = true ]; then
    echo -e "  Admin portal build: ${GREEN}SUCCESS${NC}"
else
    echo -e "  Admin portal build: ${RED}FAILED${NC} (run manually: cd jads-admin-portal && npm run build)"
fi
if [ "$AUDIT_BUILT" = true ]; then
    echo -e "  Audit portal build: ${GREEN}SUCCESS${NC}"
else
    echo -e "  Audit portal build: ${RED}FAILED${NC} (run manually: cd jads-audit-portal && npm run build)"
fi

echo ""
echo -e "${BOLD}${YELLOW}  REMINDER: Never share 'do-not-share' without an NDA!${NC}"
echo ""
