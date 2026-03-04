# JADS Platform v4.0 — Deployment Guide with Risk Analysis

**Classification:** RESTRICTED — For authorised deployment engineers and operations teams.
**Version:** 1.1
**Date:** 2026-03-04
**Scope:** Covers backend API, admin portal, audit portal, Android app, and 4 agent microservices for both manned aircraft flight plan filing and drone forensic audit.

---

## 1. Deployment Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION DEPLOYMENT                            │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ JADS Backend │  │ Admin Portal│  │ Audit Portal │  │  PostgreSQL  │  │
│  │ (Express)    │  │ (React)     │  │ (React)      │  │  16+         │  │
│  │ Port 8080    │  │ Port 5173   │  │ Port 5174    │  │  Port 5432   │  │
│  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                │                  │          │
│         └─────────────────┴────────────────┴──────────────────┘          │
│                           │                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Agent Microservices (deterministic, no LLM)         │    │
│  │  NOTAM Interpreter :3101  │  Forensic Narrator :3102             │    │
│  │  AFTN Draft :3103         │  Anomaly Advisor :3104               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                           │                                              │
│  ┌────────────────────────┴──────────────────────────────────────┐      │
│  │                    Reverse Proxy (nginx)                        │      │
│  │                    TLS 1.3 termination                          │      │
│  │                    Rate limiting layer                          │      │
│  └──────────────────────────┬────────────────────────────────────┘      │
│                              │                                           │
│  ┌──────────────────────────┴──────────────────────────────────┐        │
│  │                 External Anchor Backends                      │        │
│  │  1. HMAC-signed append-only file (local/NFS)                  │        │
│  │  2. DGCA Webhook (HTTPS POST to timestamp authority)          │        │
│  └──────────────────────────────────────────────────────────────┘        │
│                                                                          │
│  ┌────────────────────┐  ┌────────────────────────────────────┐         │
│  │ HSM (Production)    │  │ NTP Sources (chrony/systemd-timesyncd) │     │
│  │ CloudHSM / PKCS#11 │  │ ≥2 independent NTP servers             │     │
│  └────────────────────┘  └────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Environment Variables

### 2.1 Required (Server Will Not Start Without These)

| Variable | Description | Example | Risk if Misconfigured |
|----------|-------------|---------|----------------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://jads:pass@host:5432/jads` | **CRITICAL:** No data persistence |
| `JWT_SECRET` | User JWT signing key (≥64 chars) | Random 64-byte hex string | **CRITICAL:** Token forgery |
| `ADMIN_JWT_SECRET` | Admin JWT signing key (different from JWT_SECRET) | Random 64-byte hex string | **CRITICAL:** Admin impersonation |
| `ADAPTER_INBOUND_KEY` | Shared secret for AFMLU/FIR push webhooks | Random 64-byte hex string | **HIGH:** Unauthorized clearance issuance |

### 2.2 External Anchoring (Strongly Recommended)

| Variable | Description | Risk if Missing |
|----------|-------------|----------------|
| `ANCHOR_HMAC_KEY` | HMAC key for evidence anchor signing. **MUST be from a different secrets store than JWT_SECRET** | **HIGH:** No external tamper detection |
| `ANCHOR_HMAC_FILE_PATH` | Path to append-only anchor log file | Defaults to `./evidence_anchor_signed.log` |
| `ANCHOR_WEBHOOK_URL` | HTTPS endpoint for external anchor (DGCA) | **HIGH:** Single point of anchor failure |
| `ANCHOR_WEBHOOK_SECRET` | Shared secret for webhook auth header | **HIGH:** Unauthorized anchor injection |

### 2.3 Device Attestation (Recommended for Production)

| Variable | Description | Risk if Missing |
|----------|-------------|----------------|
| `PLAY_INTEGRITY_PROJECT_ID` | Google Cloud project ID | All missions classified UNATTESTED |
| `PLAY_INTEGRITY_API_KEY` | Play Integrity API key | Device integrity unverified |

### 2.4 HSM (Required for Production)

| Variable | Description | Risk if Missing |
|----------|-------------|----------------|
| `HSM_ENDPOINT` | CloudHSM / PKCS#11 endpoint URL | Falls back to EnvKeyProvider (keys in memory) |
| `HSM_CREDENTIALS` | HSM authentication credentials | HSM unavailable |

### 2.5 Government Adapter Integration

| Variable | Description | Default |
|----------|-------------|---------|
| `DIGITAL_SKY_BASE_URL` | DGCA Digital Sky API endpoint | Empty (stub mode) |
| `DIGITAL_SKY_API_KEY` | Digital Sky API credential | Empty (stub mode) |
| `UIDAI_BASE_URL` | UIDAI Aadhaar gateway endpoint | Empty (stub mode) |
| `UIDAI_API_KEY` | UIDAI API credential | Empty (stub mode) |
| `AFMLU_BASE_URL` | AFMLU data provider endpoint | Empty (stub mode) |
| `AFMLU_API_KEY` | AFMLU API credential | Empty (stub mode) |
| `FIR_BASE_URL` | FIR data provider endpoint | Empty (stub mode) |
| `AFTN_GATEWAY_HOST` | AFTN network gateway host | Empty (stub mode) |
| `AFTN_GATEWAY_PORT` | AFTN gateway port | 0 (stub mode) |
| `METAR_BASE_URL` | METAR data provider | Empty (stub mode) |
| `NOTAM_BASE_URL` | NOTAM data provider | Empty (stub mode) |
| `USE_LIVE_ADAPTERS` | Set `true` to use live adapters instead of stubs | `false` |

---

## 3. Deployment Steps

### 3.1 Database Setup

```bash
# 1. Create PostgreSQL 16+ database
createdb -U postgres jads_production

# 2. Apply Prisma migrations (creates all tables)
cd do-not-share/jads-backend
DATABASE_URL="postgresql://jads:password@host:5432/jads_production" \
  npx prisma migrate deploy

# 3. Start the server — audit log triggers are installed AUTOMATICALLY
#    server.ts calls AuditIntegrityService.installTriggers() on every startup.
#    This is idempotent — safe to run repeatedly. No manual step needed.
#    Also activates RuntimeIntegrityService (SHA-256 baseline of critical files).

# 4. Verify audit log triggers are active (optional — for peace of mind)
psql -U jads -d jads_production -c "
  SELECT trigger_name, event_manipulation, action_statement
  FROM information_schema.triggers
  WHERE event_object_table = 'AuditLog';
"
# Expected: 3 triggers (trg_audit_log_row_hash, trg_audit_log_no_update, trg_audit_log_no_delete)
```

**NOTE:** Audit log immutability triggers are auto-installed by the JADS server on every startup. No manual intervention is needed. Prisma migrations create the tables; `server.ts` installs the triggers. Verify trigger presence after first startup if required by audit policy.

### 3.2 Backend Server

```bash
# 1. Install dependencies
npm ci --production

# 2. Build TypeScript
npm run build

# 3. Start server
NODE_ENV=production \
DATABASE_URL="..." \
JWT_SECRET="..." \
ADMIN_JWT_SECRET="..." \
ADAPTER_INBOUND_KEY="..." \
ANCHOR_HMAC_KEY="..." \
  node dist/server.js
```

### 3.3 Job Scheduler

The `JobScheduler` starts automatically with the server (`scheduler.startAll()` in `server.ts`). Background jobs include:

| Job | Schedule | Purpose | Failure Impact |
|-----|----------|---------|----------------|
| EvidenceLedgerJob | 00:05 UTC daily | Daily evidence anchoring | **HIGH:** Unanchored evidence gap |
| ReverificationJob | Periodic | Retro-revocation CRL check | LOW: Delayed revocation detection |
| NotamPollJob | Periodic | Fetch active NOTAMs | LOW: Stale NOTAM data |
| MetarPollJob | Every 30 min | Weather data refresh | LOW: Stale METAR |
| AdcFicPollJob | Periodic | AFMLU/FIR data sync | LOW: Stale airspace data |
| AnnualReconfirmJob | Daily | Special user reconfirmation | LOW: Delayed credential expiry |
| AirspaceDataPollJob | Periodic | Airspace geometry sync | LOW: Stale geometry |

**Critical:** The EvidenceLedgerJob MUST run successfully daily. Monitor for `all_anchor_backends_failed` log events.

### 3.4 Admin and Audit Portals

```bash
# Admin Portal
cd do-not-share/jads-admin-portal
npm ci && npm run build
# Serve dist/ via nginx

# Audit Portal
cd do-not-share/jads-audit-portal
npm ci && npm run build
# Serve dist/ via nginx
```

### 3.5 Android App Distribution

```bash
cd do-not-share/jads-android
./gradlew assembleRelease
# APK: app/build/outputs/apk/release/app-release.apk
# Distribute via government-controlled APK channel (not public Play Store)
```

### 3.6 Agent Microservices

Four deterministic, rule-based microservices. **No LLM, no Ollama, no external AI dependency.** Each is an Express server with pattern-matching logic.

```bash
# Deploy all 4 agents (each in its own process / container)
cd do-not-share/agents/notam-interpreter && npm ci && npm run build && node dist/index.js   # :3101
cd do-not-share/agents/forensic-narrator && npm ci && npm run build && node dist/index.js   # :3102
cd do-not-share/agents/aftn-draft        && npm ci && npm run build && node dist/index.js   # :3103
cd do-not-share/agents/anomaly-advisor   && npm ci && npm run build && node dist/index.js   # :3104
```

| Agent | Port | Health Check | Purpose |
|-------|------|-------------|---------|
| NOTAM Interpreter | 3101 | `GET /health` | Parses raw NOTAM text → structured advisory (severity, area, time, impact) |
| Forensic Narrator | 3102 | `GET /health` | Mission forensic data → human-readable narrative + risk score (0–100) |
| AFTN Draft | 3103 | `GET /health` | Structured input → ICAO AFTN message draft (FPL, CNL, DLA, CHG) |
| Anomaly Advisor | 3104 | `GET /health` | Telemetry sequence → anomaly report (altitude spikes, time reversals, GPS spoofing) |

**Failure mode:** If an agent is down, the backend cannot call that service — requests return HTTP connection errors. **Agents are not required for core operations** (flight plan filing, mission upload, forensic verification all work without agents). Agents enhance the user experience with human-readable outputs.

**Docker deployment (optional):**
```yaml
# Add to docker-compose.yml
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

---

## 4. Configuration Risk Matrix

### 4.1 What Can Fail

| Configuration | Failure Mode | Detection | Impact | Mitigation |
|---------------|-------------|-----------|--------|------------|
| JWT_SECRET too short | Brute-force token forgery | Security audit | **CRITICAL** | Enforce ≥64 chars at startup |
| JWT_SECRET = ADMIN_JWT_SECRET | Admin/user token cross-use | Code review | **HIGH** | env.ts should validate they differ |
| ANCHOR_HMAC_KEY = JWT_SECRET | Anchor forgery if server compromised | Security audit | **HIGH** | Must use separate secrets store |
| ANCHOR_HMAC_KEY not set | No external HMAC anchoring | `no_anchor_backends` log warning | **HIGH** | Always configure in production |
| HSM_ENDPOINT not set | Keys in memory (extractable with root) | `using_env_key_provider` log | **MEDIUM** | Deploy HSM for production |
| PLAY_INTEGRITY not configured | All devices UNATTESTED | `play_integrity_not_configured` log | **MEDIUM** | Configure for production |
| Single anchor backend | Single point of trust anchor failure | Backend count check | **MEDIUM** | Configure ≥2 backends |
| Container killed during EvidenceLedgerJob | Partial anchor (DB written, external not published) | Missing external receipts | **MEDIUM** | Set terminationGracePeriodSeconds ≥30 |
| Clock skew between nodes | Wrong day's missions anchored | NTP drift monitoring | **MEDIUM** | Use chrony; pin ledger job to single node |
| PostgreSQL without TLS | Credentials/data exposed in transit | Network audit | **HIGH** | Enforce `sslmode=require` in DATABASE_URL |
| Server never started against DB | Audit log triggers not installed | Trigger presence check | **CRITICAL** | Triggers auto-install on first server startup; verify with `information_schema.triggers` query |

### 4.2 Multi-Node Deployment Risks

If deploying multiple backend replicas:

1. **EvidenceLedgerJob must run on exactly ONE node.** Use Kubernetes CronJob with `concurrencyPolicy: Forbid` or a distributed lock (Redis/PostgreSQL advisory lock).

2. **SSE connections are in-process.** The ClearanceService SSE registry is a per-process Map. For multi-node SSE, replace with Redis pub/sub.

3. **Clock skew between nodes.** All nodes must use the same NTP sources. Add a startup health check that compares `Date.now()` against a known NTP endpoint.

4. **Job deduplication.** Jobs use cron-based scheduling. Multiple nodes running the same job = duplicate work. Pin jobs to a single node or use a job queue (BullMQ/pg-boss).

---

## 5. Health Checks & Monitoring

### 5.1 Health Endpoint

```
GET /health
→ { "status": "ok", "version": "4.0", "timestamp": "..." }
```

No authentication required. Use for load balancer health checks.

### 5.2 Critical Log Events to Monitor

| Log Event | Severity | Action |
|-----------|----------|--------|
| `all_anchor_backends_failed` | CRITICAL | Evidence not externally anchored — investigate immediately |
| `integrity_violation_detected` | CRITICAL | Server binary tampered — incident response required |
| `hmac_anchor_failed` | HIGH | HMAC anchor backend unreachable |
| `webhook_anchor_failed` | HIGH | Webhook anchor backend unreachable |
| `play_integrity_not_configured` | MEDIUM | Device attestation not active |
| `using_env_key_provider` | MEDIUM | HSM not configured — keys in memory |
| `no_external_anchor_backends_configured` | HIGH | No tamper detection capability |
| `special_user_login_failed` | INFO | Potential brute force (monitor rate) |
| `clearance_rejected` | INFO | Flight clearance denied — operational awareness |

### 5.3 Database Health Checks

```sql
-- Verify audit triggers are present
SELECT COUNT(*) FROM information_schema.triggers
WHERE event_object_table = 'AuditLog';
-- Expected: 3

-- Verify evidence ledger continuity (no gaps)
SELECT a.anchor_date, b.anchor_date,
       (b.anchor_date - a.anchor_date) AS gap_days
FROM "EvidenceLedger" a
JOIN "EvidenceLedger" b ON b.anchor_date = (
  SELECT MIN(anchor_date) FROM "EvidenceLedger" WHERE anchor_date > a.anchor_date
)
WHERE (b.anchor_date - a.anchor_date) > 1;
-- Expected: 0 rows (no gaps)

-- Verify audit log row hashes are consistent
-- (Run AuditIntegrityService.batchVerify() via admin API)
```

---

## 6. Backup & Recovery

### 6.1 Database Backup

```bash
# Daily automated backup (pg_dump)
pg_dump -U jads -d jads_production -F c -f /backup/jads_$(date +%Y%m%d).dump

# Restore
pg_restore -U jads -d jads_production /backup/jads_20260304.dump
```

**After restore, verify:**
1. Audit log triggers are active (3 triggers on AuditLog table)
2. Evidence ledger chain is intact (`verifyFullChain()`)
3. Row hashes match (`AuditIntegrityService.batchVerify()`)

### 6.2 Evidence Anchor Log Backup

The HMAC-signed evidence anchor log file (`evidence_anchor_signed.log`) is append-only. Back it up separately from the database — its value is that it's independent.

**Never store the anchor backup on the same system as the database backup.** The entire point is separation.

### 6.3 Key Rotation

| Key | Rotation Frequency | Impact of Rotation |
|-----|-------------------|-------------------|
| JWT_SECRET | Quarterly (or on compromise) | All active sessions invalidated |
| ADMIN_JWT_SECRET | Quarterly | All admin sessions invalidated |
| ADAPTER_INBOUND_KEY | On personnel change | AFMLU/FIR webhooks must be updated |
| ANCHOR_HMAC_KEY | Annually | New anchors use new key; old anchors verified with old key |
| HSM master key | Per HSM vendor policy | Coordinated with HSM provider |

---

## 7. Adapter Integration Checklist

When replacing a stub with a live government adapter:

1. Implement the interface (e.g., `IDigitalSkyAdapter`) in a new class
2. Set `USE_LIVE_ADAPTERS=true` and provide the relevant `*_BASE_URL` and `*_API_KEY`
3. Inject the live adapter via the factory function (no core service code changes)
4. Run the full test suite to confirm no regressions
5. Test with real government endpoint in staging environment
6. Document the endpoint URLs and credential rotation schedule

**All 7 adapters follow the same pattern:**

| # | Adapter | Interface | Stub | Status |
|---|---------|-----------|------|--------|
| 1 | Digital Sky (DGCA) | `IDigitalSkyAdapter` | `DigitalSkyAdapterStub` | Stub ready |
| 2 | UIDAI (Aadhaar) | `IUidaiAdapter` | `UidaiAdapterStub` | Stub ready |
| 3 | AFMLU (ADC zones) | `IAfmluAdapter` | `AfmluAdapterStub` | Stub ready |
| 4 | FIR (FIC records) | `IFirAdapter` | `FirAdapterStub` | Stub ready |
| 5 | AFTN (flight plans) | `IAftnGateway` | `AftnGatewayStub` | Stub ready |
| 6 | METAR (weather) | `IMetarAdapter` | `MetarAdapterStub` | Stub ready |
| 7 | NOTAM (airspace) | `INotamAdapter` | `NotamAdapterStub` | Stub ready |

---

## 8. Docker Deployment

```yaml
# docker-compose.yml (production reference)
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
    depends_on: [postgres]
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: jads
      POSTGRES_USER: jads
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pg-data:/var/lib/postgresql/data
    command: >
      postgres
        -c ssl=on
        -c ssl_cert_file=/certs/server.crt
        -c ssl_key_file=/certs/server.key

volumes:
  pg-data:
  anchor-data:
```

---

## 9. Pre-Flight Deployment Checklist

- [ ] PostgreSQL 16+ with TLS enabled (`sslmode=require`)
- [ ] Server started at least once against production DB (auto-installs audit triggers)
- [ ] All 3 audit log triggers verified active (`information_schema.triggers` query)
- [ ] JWT_SECRET ≠ ADMIN_JWT_SECRET ≠ ANCHOR_HMAC_KEY (all different)
- [ ] All secrets ≥64 characters, cryptographically random
- [ ] ANCHOR_HMAC_KEY from separate secrets store (not same vault as JWT_SECRET)
- [ ] ≥2 external anchor backends configured
- [ ] HSM endpoint configured (or documented risk acceptance for EnvKeyProvider)
- [ ] Play Integrity API configured (or documented risk acceptance)
- [ ] NTP (chrony/timesyncd) active on all nodes
- [ ] EvidenceLedgerJob pinned to single node (if multi-replica)
- [ ] `/health` endpoint responding
- [ ] Log aggregation configured for critical events (see Section 5.2)
- [ ] Database backup automated (daily pg_dump)
- [ ] Anchor log file backed up to separate system
- [ ] Test suite passes (517 tests across 18 suites, 0 failures)
- [ ] Agent microservices health checks responding (ports 3101–3104) — optional but recommended
- [ ] First admin account provisioned via direct DB seed (not API)
- [ ] Genesis anchor created and published to external backends
