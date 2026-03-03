# JADS Platform v4.0 — Deployment Package

This folder contains the **deployable artifacts** for the JADS platform.
You can share this folder with clients, government agencies, and demo presenters.

> **This folder does NOT contain source code.** It contains only compiled
> JavaScript, static HTML/JS bundles, and deployment scripts.

## Quick Start

```bash
# 1. Start the database
docker-compose up -d

# 2. Start everything
./start-demo.sh

# 3. Open in browser
#    Backend API:    http://localhost:8080/api/system/health
#    Admin Portal:   http://localhost:5173
#    Audit Portal:   http://localhost:5174
```

## What's Included

| Component | Description |
|-----------|-------------|
| `jads-backend/` | Compiled Node.js server (JavaScript) |
| `jads-admin-portal/` | Static web build (HTML/CSS/JS) |
| `jads-audit-portal/` | Static web build (HTML/CSS/JS) |
| `jads-android/` | Android APK (if built) |
| `docker-compose.yml` | PostgreSQL 16 database |
| `start-demo.sh` | One-command launcher |
| `stop-demo.sh` | Stop all services |

## How to Generate This Package

Run from the repository root:
```bash
./package-for-distribution.sh
```

This builds all projects and populates this folder with compiled artifacts.

## Demo Credentials

| Role | Username | Password |
|------|----------|----------|
| DGCA Super Admin | `dgca.admin` | `Admin@JADS2024` |
| IAF 28 Sqn | `iaf.28sqn` | `28SQN@Secure2024` |
| Civilian Pilot | phone `9999000001` | OTP shown in console |
