#!/usr/bin/env bash
# ── JADS Live Telemetry Demo — One-Command Launcher ──────────────────────
# Starts the backend, generates a demo token, runs the simulator, and
# optionally opens an ngrok tunnel for remote viewers.
#
# Usage:
#   ./demo-run.sh                  # Local demo (localhost:8080)
#   ./demo-run.sh --ngrok          # With ngrok tunnel
#   ./demo-run.sh --speed 5        # 5x speed replay
#   ./demo-run.sh --loop           # Continuous loop
#
# Prerequisites:
#   - Node.js 18+
#   - PostgreSQL running with JADS schema migrated
#   - .env configured in do-not-share/jads-backend/
#   - (optional) ngrok installed for remote access

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/do-not-share/jads-backend"
SPEED=1
LOOP_FLAG=""
USE_NGROK=false
MISSION="demo-mission-001"
UIN="UA-DEL-0001"
BACKEND_URL="http://localhost:8080"

# ── Parse flags ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ngrok)    USE_NGROK=true; shift ;;
    --speed)    SPEED="$2"; shift 2 ;;
    --loop)     LOOP_FLAG="--loop"; shift ;;
    --mission)  MISSION="$2"; shift 2 ;;
    --uin)      UIN="$2"; shift 2 ;;
    *)          echo "Unknown flag: $1"; exit 1 ;;
  esac
done

echo "╔══════════════════════════════════════════════════════════╗"
echo "║           JADS Live Telemetry Demo Launcher v4.0        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo

# ── 1. Generate sample CSV if missing ────────────────────────────────────
SAMPLE_CSV="$BACKEND_DIR/scripts/sample-flight.csv"
if [ ! -f "$SAMPLE_CSV" ]; then
  echo "  [1/4] Generating sample flight CSV..."
  node "$BACKEND_DIR/scripts/generate-sample-log.js" > "$SAMPLE_CSV"
  echo "  ✓ Created $SAMPLE_CSV"
else
  echo "  [1/4] Sample CSV already exists"
fi

# ── 2. Generate demo token ───────────────────────────────────────────────
echo "  [2/4] Generating demo JWT..."
TOKEN=$(node -e "
  const crypto = require('crypto');
  const path = require('path');
  const fs = require('fs');
  try {
    const envPath = path.join('$BACKEND_DIR', '.env');
    if (fs.existsSync(envPath)) {
      fs.readFileSync(envPath, 'utf-8').split('\\n').forEach(line => {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      });
    }
  } catch {}
  const secret = process.env.JWT_SECRET;
  if (!secret) { console.error('No JWT_SECRET in .env'); process.exit(1); }
  function b64u(b) { return b.toString('base64').replace(/=/g,'').replace(/\\+/g,'-').replace(/\\//g,'_'); }
  const h = b64u(Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const now = Math.floor(Date.now()/1000);
  const p = b64u(Buffer.from(JSON.stringify({sub:'demo-user',role:'RPAS_OPERATOR',iat:now,exp:now+2592000,iss:'jads-demo'})));
  const s = b64u(crypto.createHmac('sha256',secret).update(h+'.'+p).digest());
  process.stdout.write(h+'.'+p+'.'+s);
")
echo "  ✓ Token generated (30-day expiry)"

# ── 3. Optionally start ngrok ────────────────────────────────────────────
NGROK_PID=""
if [ "$USE_NGROK" = true ]; then
  echo "  [3/4] Starting ngrok tunnel on port 8080..."
  if ! command -v ngrok &>/dev/null; then
    echo "  ✗ ngrok not found. Install from https://ngrok.com/download"
    exit 1
  fi
  ngrok http 8080 --log=stdout > /tmp/ngrok-jads.log 2>&1 &
  NGROK_PID=$!
  sleep 3
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{const t=JSON.parse(d).tunnels.find(t=>t.proto==='https');
      process.stdout.write(t?t.public_url:'');}catch{process.stdout.write('');}
    })
  ")
  if [ -n "$NGROK_URL" ]; then
    BACKEND_URL="$NGROK_URL"
    echo "  ✓ ngrok tunnel: $NGROK_URL"
    echo "  WebSocket URL:  ${NGROK_URL/https:/wss:}/ws/missions"
  else
    echo "  ⚠ Could not detect ngrok URL. Using localhost."
  fi
else
  echo "  [3/4] Skipping ngrok (use --ngrok to enable)"
fi

# ── 4. Run simulator ────────────────────────────────────────────────────
echo "  [4/4] Starting telemetry simulator..."
echo
echo "────────────────────────────────────────────────────────────"
echo

node "$BACKEND_DIR/scripts/demo-simulator.js" \
  --file "$SAMPLE_CSV" \
  --mission "$MISSION" \
  --uin "$UIN" \
  --backend "$BACKEND_URL" \
  --token "$TOKEN" \
  --speed "$SPEED" \
  $LOOP_FLAG

# ── Cleanup ──────────────────────────────────────────────────────────────
if [ -n "$NGROK_PID" ]; then
  echo
  echo "  Stopping ngrok..."
  kill "$NGROK_PID" 2>/dev/null || true
fi

echo "  Demo complete."
