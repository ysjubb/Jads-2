# JADS Platform v4.0 — Deployment Guide with Risk Analysis

**Classification:** RESTRICTED — For authorised deployment engineers and operations teams.
**Version:** 1.2
**Date:** 2026-03-05
**Scope:** Covers backend API, admin portal, audit portal, Android app, and 4 agent microservices for both manned aircraft flight plan filing and drone forensic audit.

This guide is written so that **anyone** — even someone with no server experience — can deploy JADS to a production server. Every step is described in full detail.

---

## 1. What You Are Deploying (Plain English)

You are setting up 9 programs that all work together:

```
                        THE BIG PICTURE
                        ===============

    Internet Users (pilots, admins, auditors)
            │
            ▼
    ┌───────────────────────┐
    │   Reverse Proxy       │   ← This is the "front door". It handles
    │   (nginx)             │     encryption (HTTPS) and blocks bad traffic.
    │   Ports 80 & 443      │
    └──────────┬────────────┘
               │
               │  Passes requests to the right place:
               │
    ┌──────────┴────────────────────────────────────────────────┐
    │                                                           │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
    │  │ JADS Backend  │  │ Admin Portal │  │ Audit Portal │   │
    │  │ (the brain)   │  │ (website for │  │ (website for │   │
    │  │ Port 8080     │  │  gov admins) │  │  auditors)   │   │
    │  │               │  │ Port 5173    │  │ Port 5174    │   │
    │  └───────┬───────┘  └──────────────┘  └──────────────┘   │
    │          │                                                │
    │  ┌───────┴───────┐                                        │
    │  │  PostgreSQL    │  ← The database. Stores everything.   │
    │  │  (database)    │    Missions, flight plans, users,      │
    │  │  Port 5432     │    audit logs.                         │
    │  └───────────────┘                                        │
    │                                                           │
    │  ┌────────────────────────────────────────────────────┐   │
    │  │  4 Agent Microservices (optional helper programs)   │   │
    │  │  NOTAM:3101  Forensic:3102  AFTN:3103  Anomaly:3104│   │
    │  └────────────────────────────────────────────────────┘   │
    │                                                           │
    │  ┌───────────────────┐  ┌────────────────────────────┐   │
    │  │ HSM (key vault)    │  │ NTP Servers (accurate time)│   │
    │  │ Stores crypto keys │  │ At least 2 independent     │   │
    │  │ in tamper-proof HW │  │ time sources               │   │
    │  └───────────────────┘  └────────────────────────────┘   │
    │                                                           │
    │  ┌────────────────────────────────────────────────────┐   │
    │  │ External Anchor Backends (tamper proof witnesses)   │   │
    │  │ 1. HMAC-signed file on separate server              │   │
    │  │ 2. DGCA webhook (sends proof to government)         │   │
    │  └────────────────────────────────────────────────────┘   │
    └───────────────────────────────────────────────────────────┘
```

**In plain English:**
- The **Backend** is the main server that does everything — verifies drone missions, processes flight plans, manages users
- The **Admin Portal** is a website that government people use to manage airspace and issue clearances
- The **Audit Portal** is a website that auditors use to inspect drone missions for forensic evidence
- **PostgreSQL** is the database — it stores all the data
- The **4 agents** are small helper programs (not required, but nice to have)
- The **reverse proxy** (nginx) is the "front door" that encrypts traffic
- **HSM** is a hardware vault for cryptographic keys (optional but strongly recommended)
- **NTP** keeps clocks accurate (critical for forensic timestamps)
- **External anchors** publish tamper-proof evidence hashes to separate systems

---

## 2. Environment Variables — The Configuration File

The backend needs a set of "environment variables" — these are settings that tell it how to connect to the database, what secret keys to use, etc. Think of them as the platform's "settings file".

### 2.1 Required Variables (The Server Will NOT Start Without These)

These 4 settings MUST be set. If any is missing, the server will print an error and stop.

| Variable name | What it is (in plain English) | Example value | What happens if you get it wrong |
|---------------|-------------------------------|---------------|----------------------------------|
| `DATABASE_URL` | The address of your PostgreSQL database — tells the server where to store data | `postgresql://jads:YourPassword@localhost:5432/jads` | **CRITICAL:** The server can't store or read any data. Nothing works |
| `JWT_SECRET` | A long random password used to create login tokens for pilots and operators. Must be at least 64 characters of random letters and numbers | `a3b7f9...` (64+ hex characters) | **CRITICAL:** If this is too short or guessable, attackers can fake login tokens and impersonate users. The server validates minimum length at startup via `env.ts` |
| `ADMIN_JWT_SECRET` | A DIFFERENT long random password for admin login tokens. **MUST be different from JWT_SECRET** | `f2e8d1...` (64+ hex characters) | **CRITICAL:** If this equals JWT_SECRET, a regular user's token could work as an admin token. The server asserts `JWT_SECRET !== ADMIN_JWT_SECRET` at startup |
| `ADAPTER_INBOUND_KEY` | A shared secret that government systems (AFMLU, FIR) use when sending clearance data to JADS | `deadbeef...` (32+ hex characters) | **HIGH:** Without this, anyone could send fake clearance data to the system |

**How to generate a random secret:**

Open a terminal on your server and type:
```bash
openssl rand -hex 64
```
This prints 128 random hex characters (= 64 bytes). Copy the output and paste it as your secret value.

Run this command **3 separate times** to get 3 different secrets for JWT_SECRET, ADMIN_JWT_SECRET, and ADAPTER_INBOUND_KEY.

**IMPORTANT:** All 3 secrets MUST be DIFFERENT from each other. Never reuse the same secret for multiple purposes.

---

### 2.2 External Anchoring Variables (Strongly Recommended)

External anchoring means the system publishes tamper-proof "receipts" to a separate location. This way, even if someone hacks the main database, the receipts on the separate system prove what the original data was.

| Variable | What it is | What happens if missing |
|----------|-----------|----------------------|
| `ANCHOR_HMAC_KEY` | A secret key used to sign evidence anchors. **MUST come from a DIFFERENT password vault than JWT_SECRET** (the whole point is separation — if someone steals the JWT vault, they shouldn't also have the anchor key) | **HIGH risk:** No external tamper detection. If someone modifies the database, you can't prove it was changed |
| `ANCHOR_HMAC_FILE_PATH` | Where to save the signed evidence file on disk | Defaults to `./evidence_anchor_signed.log` in the current folder |
| `ANCHOR_WEBHOOK_URL` | A URL to send evidence anchors to (e.g., a DGCA government server) | **HIGH risk:** Only one anchor location (the file). If that file is deleted, you lose the external proof |
| `ANCHOR_WEBHOOK_SECRET` | Password for the webhook endpoint | **HIGH risk:** Without it, attackers could inject fake anchors |

---

### 2.3 Device Attestation Variables (Recommended for Production)

These tell the server how to verify that Android phones running the JADS app are genuine (not rooted, not tampered with).

| Variable | What it is | What happens if missing |
|----------|-----------|----------------------|
| `PLAY_INTEGRITY_PROJECT_ID` | Your Google Cloud project ID (from Google Cloud Console) | All drone missions are marked "UNATTESTED" — you can't verify device integrity |
| `PLAY_INTEGRITY_API_KEY` | Your Play Integrity API key (from Google Cloud Console) | Same as above |

**How to get these:**
1. Go to **https://console.cloud.google.com** in your browser
2. Sign in with a Google account
3. Create a project (or select an existing one)
4. In the left menu, click **APIs & Services** → **Enable APIs**
5. Search for **"Play Integrity API"** → click it → click **"Enable"**
6. Go to **APIs & Services** → **Credentials** → click **"Create Credentials"** → **"API Key"**
7. Copy the API key — that's your `PLAY_INTEGRITY_API_KEY`
8. Your project ID is visible in the top bar of Google Cloud Console — that's your `PLAY_INTEGRITY_PROJECT_ID`

---

### 2.4 HSM Variables (Required for Production)

An HSM (Hardware Security Module) is a physical device that stores cryptographic keys. Keys stored in an HSM can NEVER be extracted — even if someone gets full access to your server. This is critical for production deployments.

| Variable | What it is | What happens if missing |
|----------|-----------|----------------------|
| `HSM_ENDPOINT` | The URL/address of your HSM device or cloud HSM service (e.g., AWS CloudHSM) | Falls back to storing keys in environment variables (memory). This means a hacker with root access to your server can steal the keys |
| `HSM_CREDENTIALS` | Login credentials for the HSM | HSM unavailable — keys stay in memory |

Without HSM, the server logs a warning: `using_env_key_provider`. This is acceptable for testing but NOT for production.

---

### 2.5 Government Adapter Variables

These connect JADS to real government systems. In testing/demo mode, all of these can be left empty — the system uses "stubs" (fake implementations) that return demo data.

| Variable | What it connects to | Default |
|----------|-------------------|---------|
| `DIGITAL_SKY_BASE_URL` | DGCA Digital Sky API (drone registration) | Empty = stub mode (hardcoded demo zones) |
| `DIGITAL_SKY_API_KEY` | Digital Sky credentials | Empty = stub mode |
| `UIDAI_BASE_URL` | Aadhaar verification (pilot identity) | Empty = stub mode (accepts any OTP) |
| `UIDAI_API_KEY` | UIDAI credentials | Empty = stub mode |
| `AFMLU_BASE_URL` | AFMLU data feed (Air Defence Clearance) | Empty = stub mode |
| `AFMLU_API_KEY` | AFMLU credentials | Empty = stub mode |
| `FIR_BASE_URL` | FIR office data feed (Flight Information Centre) | Empty = stub mode |
| `AFTN_GATEWAY_HOST` | AFTN network gateway (flight plan transmission) | Empty = stub mode (messages generated but not transmitted) |
| `AFTN_GATEWAY_PORT` | AFTN gateway port | `0` = stub mode |
| `METAR_BASE_URL` | Weather observation feed | Empty = stub mode |
| `NOTAM_BASE_URL` | NOTAM feed | Empty = stub mode |
| `USE_LIVE_ADAPTERS` | Master switch: set to `true` only when ALL the above URLs are configured | `false` (stub mode for everything) |

**To switch from stubs to real government systems:**
1. Get the API URL and credentials from the relevant government agency
2. Set the corresponding `*_BASE_URL` and `*_API_KEY` variables
3. Set `USE_LIVE_ADAPTERS=true`
4. Restart the backend server

---

## 3. Deployment Steps — Full Detail

### 3.1 — Set Up the Database (PostgreSQL)

PostgreSQL is the database that stores everything. You need version 16 or higher.

#### Step 3.1.1 — Install PostgreSQL

**Option A — Using Docker (recommended, easiest):**

1. Make sure Docker is installed and running (see ANUJ_N_LALIT_PLAN_1.md, Step 1.2)
2. Create a file called `docker-compose.yml` (or use the one in the project):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: jads
      POSTGRES_USER: jads
      POSTGRES_PASSWORD: YOUR_STRONG_PASSWORD_HERE
    ports:
      - "5432:5432"
    volumes:
      - pg-data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jads"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pg-data:
```

Replace `YOUR_STRONG_PASSWORD_HERE` with a strong password. Then run:
```bash
docker-compose up -d
```

**Option B — Install PostgreSQL directly on the server:**

Follow the official PostgreSQL installation guide for your OS:
- Ubuntu: `sudo apt install postgresql-16`
- Then create the database:
```bash
sudo -u postgres createdb jads
sudo -u postgres psql -c "CREATE USER jads WITH PASSWORD 'YOUR_STRONG_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE jads TO jads;"
```

#### Step 3.1.2 — Apply Database Migrations

Navigate to the backend folder and run:
```bash
cd do-not-share/jads-backend
DATABASE_URL="postgresql://jads:YOUR_PASSWORD@localhost:5432/jads" \
  npx prisma migrate deploy
```

This creates all the database tables. You should see:
```
All migrations have been successfully applied.
```

#### Step 3.1.3 — About Audit Log Triggers (Migration-Deployed)

Three security triggers on the `AuditLog` table are deployed automatically as part of the Prisma migration (`20260314000000_add_audit_log_immutability_triggers`). When you run `npx prisma migrate deploy` in Step 3.1.2, these triggers are created as part of the database schema. You do NOT need to install them manually or start the server first.

| Trigger name | What it does |
|-------------|-------------|
| `trg_audit_log_row_hash` | Automatically computes a SHA-256 hash of every new audit log row. This lets you detect if someone secretly changed the data later |
| `trg_audit_log_no_update` | Blocks ALL updates to audit log rows. Once written, they can never be changed — not even by a database administrator |
| `trg_audit_log_no_delete` | Blocks ALL deletes from the audit log. Once written, rows can never be removed |

This is a schema-level guarantee — the triggers exist as soon as migrations complete, regardless of whether the application server has ever started. This is stronger than the previous approach of installing triggers at server startup.

#### Step 3.1.4 — Verify Triggers (Optional)

After running `npx prisma migrate deploy`, you can verify the triggers exist:

```bash
psql -U jads -d jads -c "
  SELECT trigger_name, event_manipulation, action_statement
  FROM information_schema.triggers
  WHERE event_object_table = 'AuditLog';
"
```

You should see **3 rows** — one for each trigger listed above. If you see 0 rows, the migrations have not been applied yet. Run `npx prisma migrate deploy` (see Step 3.1.2), then check again.

---

### 3.2 — Start the Backend Server

#### Step 3.2.1 — Install Dependencies

```bash
cd do-not-share/jads-backend
npm ci --production
```

`npm ci` installs the exact versions of all required libraries. You should see:
```
added XXX packages in XXs
```

#### Step 3.2.2 — Build the TypeScript Code

```bash
npm run build
```

This compiles the TypeScript source code into JavaScript. You should see no errors. The output goes into a `dist/` folder.

#### Step 3.2.3 — Create the Environment File

Create a file called `.env` in the `jads-backend/` folder with all the required variables. Example for production:

```env
NODE_ENV=production
PORT=8080

DATABASE_URL=postgresql://jads:YOUR_DB_PASSWORD@localhost:5432/jads

JWT_SECRET=PASTE_YOUR_64_BYTE_HEX_HERE
ADMIN_JWT_SECRET=PASTE_A_DIFFERENT_64_BYTE_HEX_HERE
ADAPTER_INBOUND_KEY=PASTE_ANOTHER_32_BYTE_HEX_HERE

ANCHOR_HMAC_KEY=PASTE_ANCHOR_KEY_FROM_SEPARATE_VAULT
ANCHOR_HMAC_FILE_PATH=/data/evidence_anchor_signed.log
ANCHOR_WEBHOOK_URL=https://your-dgca-anchor-endpoint.gov.in/anchor
ANCHOR_WEBHOOK_SECRET=PASTE_WEBHOOK_SECRET

USE_LIVE_ADAPTERS=false
```

#### Step 3.2.4 — Start the Server

```bash
NODE_ENV=production node dist/server.js
```

You should see:
```
[server_started] { port: 8080, version: '4.0' }
```

**For production, use a process manager** so the server restarts if it crashes:

```bash
# Option A: systemd (Linux)
# Create /etc/systemd/system/jads-backend.service with:
# [Unit]
# Description=JADS Backend
# After=postgresql.service
#
# [Service]
# WorkingDirectory=/path/to/do-not-share/jads-backend
# ExecStart=/usr/bin/node dist/server.js
# EnvironmentFile=/path/to/do-not-share/jads-backend/.env
# Restart=always
#
# [Install]
# WantedBy=multi-user.target

# Then:
sudo systemctl enable jads-backend
sudo systemctl start jads-backend

# Option B: PM2 (cross-platform)
npm install -g pm2
pm2 start dist/server.js --name jads-backend
pm2 save
pm2 startup   # follow the printed instructions to auto-start on boot
```

---

### 3.3 — Background Jobs (Automatic)

The backend automatically starts 7 background jobs. You don't need to do anything — they start when the server starts.

| Job | When it runs | What it does | What happens if it fails |
|-----|-------------|-------------|------------------------|
| **EvidenceLedgerJob** | Every day at 00:05 UTC (midnight + 5 minutes) | Creates a daily tamper-proof "receipt" of all missions and publishes it to external anchors | **HIGH IMPACT:** Evidence for that day is not externally anchored. If someone tampers with the database, you can't prove it. Monitor for `all_anchor_backends_failed` in logs |
| **NotamPollJob** | Every 5 minutes | Fetches active NOTAMs (airspace notices) from the NOTAM feed | Low impact: NOTAM data becomes stale |
| **MetarPollJob** | Every 30 minutes | Fetches weather data (METAR) | Low impact: weather data becomes stale |
| **AdcFicPollJob** | Every 6 hours | Syncs ADC/FIC clearance data from AFMLU/FIR | Low impact: clearance data becomes stale |
| **AirspaceDataPollJob** | Every 60 minutes | Syncs airspace geometry from external sources | Low impact: airspace geometry becomes stale |
| **ReverificationJob** | Periodic | Re-checks identity documents against revocation lists | Low impact: delayed detection of revoked credentials |
| **AnnualReconfirmJob** | Daily | Flags special users who need annual reconfirmation | Low impact: delayed credential expiry prompts |

**The EvidenceLedgerJob is the most important.** Set up monitoring to alert you if it fails. Look for this log message:
```
all_anchor_backends_failed
```
If you see this, it means the daily evidence anchor could NOT be published. Investigate immediately.

---

### 3.4 — Build and Serve the Admin and Audit Portals

These are the two websites (for admins and auditors).

#### Step 3.4.1 — Build the Admin Portal

```bash
cd do-not-share/jads-admin-portal
npm ci
npm run build
```

This creates a `dist/` folder with static HTML/CSS/JS files. You should see:
```
✓ built in Xs
```

#### Step 3.4.2 — Build the Audit Portal

```bash
cd do-not-share/jads-audit-portal
npm ci
npm run build
```

Same as above — creates a `dist/` folder.

#### Step 3.4.3 — Serve with nginx

These are static websites. You serve them using a web server like nginx.

**Install nginx:**
```bash
sudo apt install nginx    # Ubuntu/Debian
```

**Create nginx config** (example: `/etc/nginx/sites-available/jads`):

```nginx
# Admin Portal
server {
    listen 443 ssl;
    server_name admin.jads.yourdomain.com;

    ssl_certificate     /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols       TLSv1.3;

    # Serve the built Admin Portal files
    root /path/to/do-not-share/jads-admin-portal/dist;
    index index.html;

    # For single-page app routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to the backend
    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Audit Portal
server {
    listen 443 ssl;
    server_name audit.jads.yourdomain.com;

    ssl_certificate     /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols       TLSv1.3;

    root /path/to/do-not-share/jads-audit-portal/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Backend API (direct access)
server {
    listen 443 ssl;
    server_name api.jads.yourdomain.com;

    ssl_certificate     /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols       TLSv1.3;

    location / {
        proxy_pass http://localhost:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Required for SSE (Server-Sent Events) — clearance notifications
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

**Enable the config:**
```bash
sudo ln -s /etc/nginx/sites-available/jads /etc/nginx/sites-enabled/
sudo nginx -t          # Test config (should say "syntax is ok")
sudo systemctl reload nginx
```

Replace `/path/to/...` and `yourdomain.com` with your actual paths and domain names.

---

### 3.5 — Build the Android App for Distribution

```bash
cd do-not-share/jads-android
./gradlew assembleRelease
```

The signed APK will be at:
```
app/build/outputs/apk/release/app-release.apk
```

Distribute this APK through a government-controlled channel (NOT the public Google Play Store). Common distribution methods:
- Internal website download (over HTTPS)
- MDM (Mobile Device Management) push
- Manual sideloading via USB

---

### 3.6 — Deploy the Agent Microservices (Optional)

The 4 agents are small helper programs. They are NOT required — the core platform works without them. They add human-readable interpretations and reports.

#### Option A — Deploy as individual processes

For each agent, in a separate terminal or as a background service:

```bash
# NOTAM Interpreter (port 3101)
cd do-not-share/agents/notam-interpreter
npm ci && npm run build && node dist/index.js

# Forensic Narrator (port 3102)
cd do-not-share/agents/forensic-narrator
npm ci && npm run build && node dist/index.js

# AFTN Draft (port 3103)
cd do-not-share/agents/aftn-draft
npm ci && npm run build && node dist/index.js

# Anomaly Advisor (port 3104)
cd do-not-share/agents/anomaly-advisor
npm ci && npm run build && node dist/index.js
```

#### Option B — Deploy as Docker containers

Add this to your `docker-compose.yml`:

```yaml
  notam-interpreter:
    build: ./do-not-share/agents/notam-interpreter
    ports: ["3101:3101"]
    restart: unless-stopped

  forensic-narrator:
    build: ./do-not-share/agents/forensic-narrator
    ports: ["3102:3102"]
    restart: unless-stopped

  aftn-draft:
    build: ./do-not-share/agents/aftn-draft
    ports: ["3103:3103"]
    restart: unless-stopped

  anomaly-advisor:
    build: ./do-not-share/agents/anomaly-advisor
    ports: ["3104:3104"]
    restart: unless-stopped
```

Then: `docker-compose up -d`

#### Verify agents are running

```bash
curl http://localhost:3101/health   # NOTAM Interpreter
curl http://localhost:3102/health   # Forensic Narrator
curl http://localhost:3103/health   # AFTN Draft
curl http://localhost:3104/health   # Anomaly Advisor
```

Each should return `{"status":"ok"}`.

**If an agent is down:** The backend cannot call that specific service. Requests to it return HTTP connection errors. BUT core operations (flight plan filing, mission upload, forensic verification) continue to work normally. Agents only enhance the user experience.

---

## 4. What Can Go Wrong — Risk Matrix

This section lists everything that can fail, how to detect it, and what to do.

### 4.1 Configuration Risks

| What could go wrong | How you'd know | How bad is it | How to fix/prevent it |
|---------------------|---------------|---------------|----------------------|
| **JWT_SECRET is too short** (less than 64 characters) | Security audit discovers it | **CRITICAL** — attackers can brute-force login tokens and impersonate any user | Always use `openssl rand -hex 64` to generate secrets. Add a startup check that rejects secrets under 64 chars |
| **JWT_SECRET and ADMIN_JWT_SECRET are the same** | Code review or security scan | **HIGH** — a regular pilot's token could be accepted as an admin token | Always generate them separately. The `env.ts` file should validate they differ |
| **ANCHOR_HMAC_KEY is the same as JWT_SECRET** | Security audit | **HIGH** — if someone compromises the server and steals JWT_SECRET, they can also forge evidence anchors (defeats the whole purpose of external anchoring) | Store ANCHOR_HMAC_KEY in a completely separate vault/secrets manager |
| **ANCHOR_HMAC_KEY is not set** | Server logs `no_anchor_backends_configured` on startup | **HIGH** — no external evidence anchoring. The database can be tampered with and nobody can prove it | Always set this in production |
| **HSM is not configured** | Server logs `using_env_key_provider` on startup | **MEDIUM** — cryptographic keys are stored in memory. A hacker with root access to the server can extract them | Deploy an HSM (AWS CloudHSM, Azure Dedicated HSM, or on-premises PKCS#11 device) for production |
| **Play Integrity not configured** | Server logs `play_integrity_not_configured` | **MEDIUM** — all Android devices are accepted without integrity verification. Rooted/tampered phones are not detected | Configure Google Play Integrity API (see Section 2.3) |
| **Only one anchor backend** | Check how many backends are configured | **MEDIUM** — if that one backend fails, you have no external proof for that period | Configure at least 2 backends (HMAC file + webhook) |
| **Server crashes during EvidenceLedgerJob** | Evidence anchor for that day is missing from external backends | **MEDIUM** — gap in the evidence chain for that day | Set `terminationGracePeriodSeconds ≥ 30` in Kubernetes/Docker. Monitor for daily anchor completion |
| **Clock skew between servers** | NTP monitoring shows drift | **MEDIUM** — missions might get assigned to the wrong day's evidence ledger | Use `chrony` for NTP synchronization. Pin the EvidenceLedgerJob to a single server (see Section 4.2) |
| **PostgreSQL without TLS** | Network security audit | **HIGH** — database passwords and data are sent in plain text over the network | Add `?sslmode=require` to the end of your `DATABASE_URL` |
| **Migrations not applied** | Run the trigger verification query (Step 3.1.4) and get 0 rows | **CRITICAL** — audit log is NOT protected by triggers. It can be modified by anyone with database access | Run `npx prisma migrate deploy`. Verify triggers exist |

### 4.2 Multi-Server Deployment Risks

If you run multiple copies of the backend server (for high availability):

**Risk 1 — EvidenceLedgerJob runs on multiple servers simultaneously**

If two servers both run the EvidenceLedgerJob at the same time, you get duplicate evidence anchors and potentially inconsistent data.

**Fix:** Only run the job on ONE server. Options:
- Use Kubernetes CronJob with `concurrencyPolicy: Forbid`
- Use a distributed lock (Redis `SETNX` or PostgreSQL advisory lock)
- Pin the job to a specific server using environment variable `ENABLE_LEDGER_JOB=true` on only one server

**Risk 2 — SSE (real-time clearance notifications) only works on one server**

The SSE (Server-Sent Events) system uses an in-memory registry. If a pilot connects to Server A and a clearance is issued through Server B, the pilot won't get the notification.

**Fix:** Use Redis pub/sub to broadcast SSE events between servers. This requires additional code changes.

**Risk 3 — Clock drift between servers**

If Server A's clock says 11:59 PM and Server B's clock says 12:01 AM, they think it's different days. This causes issues with the daily evidence ledger.

**Fix:** All servers must use the same NTP servers. Install `chrony`:
```bash
sudo apt install chrony
sudo systemctl enable chrony
```

**Risk 4 — Duplicate background jobs**

If multiple servers all run the same background jobs (METAR polling, NOTAM polling, etc.), they do the same work multiple times. This wastes resources but doesn't cause data corruption (the jobs are idempotent — running them twice produces the same result).

**Fix:** Pin jobs to a single server, or use a job queue like BullMQ or pg-boss.

---

## 5. Health Checks & Monitoring

### 5.1 Health Check Endpoint

The backend has a health check URL that tells you if it's running:

```
GET http://your-server:8080/health
```

Returns:
```json
{"status": "ok", "version": "4.0", "timestamp": "2026-03-05T12:00:00.000Z"}
```

This endpoint requires NO authentication. Use it for load balancer health checks (nginx, AWS ALB, etc.).

**How to test it:**
- From a terminal on the server: `curl http://localhost:8080/health`
- From your browser: type `http://your-server:8080/health` in the address bar

### 5.2 Log Messages to Watch For

Set up log monitoring (e.g., CloudWatch, Datadog, ELK stack, or even just `grep` on log files) to alert you when these messages appear:

| Log message | How serious | What to do |
|-------------|-----------|-----------|
| `all_anchor_backends_failed` | **CRITICAL — act immediately** | Evidence anchors are NOT being published. Check network connectivity to anchor backends. Check webhook URL. Check HMAC file path permissions |
| `integrity_violation_detected` | **CRITICAL — act immediately** | A critical server file has been modified. This could mean the server is compromised. Start incident response: isolate the server, investigate the change, restore from known-good backup |
| `hmac_anchor_failed` | **HIGH** | The HMAC file anchor backend is unreachable. Check file path, disk space, file permissions |
| `webhook_anchor_failed` | **HIGH** | The webhook anchor backend is unreachable. Check URL, network connectivity, the receiving server's health |
| `no_external_anchor_backends_configured` | **HIGH** | No anchor backends are configured at all. Set ANCHOR_HMAC_KEY and ANCHOR_WEBHOOK_URL |
| `play_integrity_not_configured` | **MEDIUM** | Device attestation is disabled. All phones are accepted without integrity checking |
| `using_env_key_provider` | **MEDIUM** | HSM is not configured. Cryptographic keys are stored in memory instead of tamper-proof hardware |
| `special_user_login_failed` | **INFO** | A government/military user failed to log in. Could be a typo, could be a brute-force attempt. Monitor the rate — many failures in a short time = potential attack |
| `clearance_rejected` | **INFO** | A flight clearance was denied. Normal operational event — just awareness |

### 5.3 Database Health Checks

Run these SQL queries periodically to verify database integrity:

**Check 1 — Are audit log triggers active?**
```sql
SELECT COUNT(*) FROM information_schema.triggers
WHERE event_object_table = 'AuditLog';
```
Expected result: **3**. If you get 0, the backend server has never been started against this database.

**Check 2 — Is the evidence ledger continuous (no gaps)?**
```sql
SELECT a.anchor_date, b.anchor_date,
       (b.anchor_date - a.anchor_date) AS gap_days
FROM "EvidenceLedger" a
JOIN "EvidenceLedger" b ON b.anchor_date = (
  SELECT MIN(anchor_date) FROM "EvidenceLedger" WHERE anchor_date > a.anchor_date
)
WHERE (b.anchor_date - a.anchor_date) > 1;
```
Expected result: **0 rows** (no gaps). If you see rows, it means the evidence ledger has gaps — the server was down on those days, or the EvidenceLedgerJob failed.

**Check 3 — Are audit log row hashes consistent?**

Call the batch verification API (requires admin authentication) or trigger it programmatically via `AuditIntegrityService.batchVerify()`.

---

## 6. Backup & Recovery

### 6.1 Database Backup

**Daily automated backup (strongly recommended):**

```bash
# Create a backup
pg_dump -U jads -d jads -F c -f /backup/jads_$(date +%Y%m%d).dump

# This creates a file like: /backup/jads_20260305.dump
```

**Set up a daily cron job:**
```bash
crontab -e
# Add this line (runs at 2 AM every day):
0 2 * * * pg_dump -U jads -d jads -F c -f /backup/jads_$(date +\%Y\%m\%d).dump
```

**To restore from a backup:**
```bash
pg_restore -U jads -d jads /backup/jads_20260305.dump
```

**After restoring, verify these 3 things:**
1. Audit log triggers are active (run the query from Check 1 above — expect 3 triggers)
2. Evidence ledger chain is intact (run Check 2 above — expect 0 gaps)
3. Row hashes match (run Check 3 above — expect 0 tampered rows)

### 6.2 Evidence Anchor Log Backup

The HMAC-signed evidence anchor file (`evidence_anchor_signed.log`) is your independent tamper-detection record.

**CRITICAL RULE: Never store this backup on the same server or storage system as the database backup.** The entire point of external anchoring is SEPARATION. If both the database and the anchor log are on the same disk, a hacker who compromises that disk can modify both.

Store the anchor log backup on:
- A different physical server
- A different cloud account
- A USB drive in a safe
- Any location that is physically and logically separate from the database server

### 6.3 Key Rotation Schedule

| Key | How often to rotate | What happens when you rotate |
|-----|--------------------|-----------------------------|
| `JWT_SECRET` | Every 3 months (or immediately if compromised) | All active pilot/operator login sessions are invalidated. Users must log in again |
| `ADMIN_JWT_SECRET` | Every 3 months | All active admin sessions are invalidated. Admins must log in again |
| `ADAPTER_INBOUND_KEY` | When personnel change (people leave the team) | AFMLU and FIR webhook configurations must be updated with the new key |
| `ANCHOR_HMAC_KEY` | Annually | New evidence anchors use the new key. Old anchors are still verified with the old key (keep a record of which key was active on which dates) |
| HSM master key | Per HSM vendor policy | Coordinated with the HSM vendor. Do NOT attempt this without vendor guidance |

**How to rotate a key:**
1. Generate a new random key: `openssl rand -hex 64`
2. Update the `.env` file with the new key
3. Restart the backend server
4. If you rotated ADAPTER_INBOUND_KEY, notify the AFMLU/FIR teams to update their webhook configuration

---

## 7. Adapter Integration — Connecting to Real Government Systems

When it's time to replace stub (fake) adapters with real government system connections:

### Step-by-step process

1. **Get API access** from the government agency (URL, API key, documentation)
2. **Write the adapter implementation**: Create a new TypeScript class that implements the interface (e.g., `IDigitalSkyAdapter`). The interface file in `src/adapters/interfaces/` tells you exactly what methods you need to implement
3. **Set the environment variables**: Fill in the `*_BASE_URL` and `*_API_KEY` for that adapter
4. **Set `USE_LIVE_ADAPTERS=true`** in the `.env` file
5. **Inject the live adapter**: The services use constructor injection — pass the live adapter instead of the stub
6. **Test thoroughly**: Run the full test suite (`npm test`) to confirm nothing is broken
7. **Test with the real endpoint** in a staging environment before going to production
8. **Document** the endpoint URLs and credential rotation schedule

### All 7 adapters

| # | Adapter | Interface file | Stub file | What it connects to |
|---|---------|---------------|-----------|-------------------|
| 1 | Digital Sky (DGCA) | `IDigitalSkyAdapter.ts` | `DigitalSkyAdapterStub.ts` | Drone registration, NPNT tokens, flight permissions |
| 2 | UIDAI (Aadhaar) | `IUidaiAdapter.ts` | `UidaiAdapterStub.ts` | Pilot identity verification |
| 3 | AFMLU (ADC) | `IAfmluAdapter.ts` | `AfmluAdapterStub.ts` | Air Defence Clearance coordination |
| 4 | FIR | `IFirAdapter.ts` | `FirAdapterStub.ts` | Flight Information Centre records |
| 5 | AFTN | `IAftnGateway.ts` | `AftnGatewayStub.ts` | Flight plan transmission to ATC |
| 6 | METAR | `IMetarAdapter.ts` | `MetarAdapterStub.ts` | Weather observations |
| 7 | NOTAM | `INotamAdapter.ts` | `NotamAdapterStub.ts` | Airspace notices |

**Important:** Replacing a stub with a live adapter does NOT change any core platform logic. The forensic verification, hash chains, ECDSA signatures, two-person rule, and audit logging all work identically regardless of which adapter is in use.

---

## 8. Docker Deployment — Complete Example

Here is a complete `docker-compose.yml` for production deployment:

```yaml
services:
  jads-backend:
    build: ./do-not-share/jads-backend
    ports: ["8080:8080"]
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://jads:${DB_PASSWORD}@postgres:5432/jads
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET}
      ADAPTER_INBOUND_KEY: ${ADAPTER_INBOUND_KEY}
      ANCHOR_HMAC_KEY: ${ANCHOR_HMAC_KEY}
      ANCHOR_HMAC_FILE_PATH: /data/evidence_anchor_signed.log
      HSM_ENDPOINT: ${HSM_ENDPOINT}
      HSM_CREDENTIALS: ${HSM_CREDENTIALS}
    volumes:
      - anchor-data:/data
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: jads
      POSTGRES_USER: jads
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pg-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jads"]
      interval: 10s
      timeout: 5s
      retries: 5
    command: >
      postgres
        -c ssl=on
        -c ssl_cert_file=/certs/server.crt
        -c ssl_key_file=/certs/server.key
    restart: unless-stopped

  notam-interpreter:
    build: ./do-not-share/agents/notam-interpreter
    ports: ["3101:3101"]
    restart: unless-stopped

  forensic-narrator:
    build: ./do-not-share/agents/forensic-narrator
    ports: ["3102:3102"]
    restart: unless-stopped

  aftn-draft:
    build: ./do-not-share/agents/aftn-draft
    ports: ["3103:3103"]
    restart: unless-stopped

  anomaly-advisor:
    build: ./do-not-share/agents/anomaly-advisor
    ports: ["3104:3104"]
    restart: unless-stopped

volumes:
  pg-data:
  anchor-data:
```

**How to use it:**

1. Create a `.env` file **in the same folder as docker-compose.yml** with:
```env
DB_PASSWORD=your_strong_database_password
JWT_SECRET=your_64_byte_hex_jwt_secret
ADMIN_JWT_SECRET=your_different_64_byte_hex_admin_secret
ADAPTER_INBOUND_KEY=your_32_byte_hex_adapter_key
ANCHOR_HMAC_KEY=your_anchor_hmac_key_from_separate_vault
HSM_ENDPOINT=
HSM_CREDENTIALS=
```

2. Run:
```bash
docker-compose up -d
```

3. Apply database migrations:
```bash
docker-compose exec jads-backend npx prisma migrate deploy
```

4. Verify everything is running:
```bash
docker-compose ps          # All services should be "Up"
curl http://localhost:8080/health   # Should return {"status":"ok"}
```

---

## 9. Pre-Flight Deployment Checklist

Before going live, verify every item on this list. Check each box:

### Database & Triggers
- [ ] PostgreSQL 16+ is installed and running
- [ ] TLS is enabled on PostgreSQL (`sslmode=require` in DATABASE_URL)
- [ ] Prisma migrations applied (`npx prisma migrate deploy` — installs audit triggers via migration)
- [ ] All 3 audit log triggers verified active (run the trigger query — expect 3 rows)

### Secrets & Security
- [ ] JWT_SECRET is at least 64 characters of random hex
- [ ] ADMIN_JWT_SECRET is at least 64 characters of random hex
- [ ] JWT_SECRET ≠ ADMIN_JWT_SECRET ≠ ANCHOR_HMAC_KEY (all three are DIFFERENT)
- [ ] ANCHOR_HMAC_KEY is stored in a SEPARATE secrets vault from JWT_SECRET
- [ ] At least 2 external anchor backends are configured (HMAC file + webhook)
- [ ] HSM endpoint configured (or written risk acceptance for using EnvKeyProvider)
- [ ] Play Integrity API configured (or written risk acceptance for UNATTESTED devices)

### Infrastructure
- [ ] NTP (chrony or systemd-timesyncd) is active on all servers
- [ ] If running multiple backend replicas: EvidenceLedgerJob is pinned to a single node
- [ ] `/health` endpoint responds with `{"status":"ok"}`
- [ ] Log aggregation is configured for the critical events listed in Section 5.2
- [ ] Database backup is automated (daily pg_dump)
- [ ] Anchor log file is backed up to a SEPARATE system from the database backup

### Application
- [ ] Test suite passes: 545 tests across 19 suites, 0 failures (`npm test`)
- [ ] Agent microservices health checks responding (ports 3101–3104) — optional but recommended
- [ ] First admin account provisioned via database seed (`npx prisma db seed`)
- [ ] Genesis anchor created and published to external backends
- [ ] Android APK built and distributed to authorized devices

### Networking
- [ ] HTTPS (TLS 1.3) configured on reverse proxy (nginx)
- [ ] API endpoints only accessible through the reverse proxy (backend port 8080 not exposed to internet)
- [ ] CORS configured to allow only your portal domains
- [ ] Rate limiting configured on the reverse proxy

---

## 10. Quick Reference — All Ports

| Port | Service | Accessible from internet? |
|------|---------|--------------------------|
| 443 | nginx (HTTPS) | YES — this is the only port exposed |
| 8080 | JADS Backend | NO — only through nginx proxy |
| 5173 | Admin Portal (dev only) | NO — in production, served as static files through nginx |
| 5174 | Audit Portal (dev only) | NO — in production, served as static files through nginx |
| 5432 | PostgreSQL | NO — internal only |
| 3101 | NOTAM Interpreter | NO — internal only |
| 3102 | Forensic Narrator | NO — internal only |
| 3103 | AFTN Draft | NO — internal only |
| 3104 | Anomaly Advisor | NO — internal only |
