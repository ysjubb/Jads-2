#!/usr/bin/env bash
# JADS Dev Launcher — starts all services in correct order with health checks
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║         JADS Platform — Dev Launcher         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 1: Start PostgreSQL ─────────────────────────────────────────────
echo "▶ [1/4] Starting PostgreSQL..."
cd "$ROOT"
docker-compose up -d

echo "   Waiting for PostgreSQL to be healthy..."
for i in $(seq 1 30); do
  if docker-compose exec -T postgres pg_isready -U jads -d jads_dev &>/dev/null; then
    echo "   ✓ PostgreSQL is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "   ✗ PostgreSQL failed to start after 30 seconds."
    echo "     Run: docker-compose logs postgres"
    exit 1
  fi
  sleep 1
done

# ── Step 2: Run migrations ────────────────────────────────────────────────
echo ""
echo "▶ [2/4] Running Prisma migrations..."
cd "$ROOT/jads-backend"

if [ ! -f ".env" ]; then
  echo "   ✗ No .env file found in jads-backend/"
  echo "     Create it first. See CLAUDE.md Environment Variables section."
  exit 1
fi

npx prisma migrate deploy --skip-generate 2>&1 | tail -3
echo "   ✓ Migrations applied"

# ── Step 3: Start Backend ─────────────────────────────────────────────────
echo ""
echo "▶ [3/4] Starting backend on :${PORT:-8081}..."
cd "$ROOT/jads-backend"
npm run dev &
BACKEND_PID=$!

echo "   Waiting for backend to be ready..."
BACKEND_PORT="${PORT:-8081}"
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${BACKEND_PORT}/health" &>/dev/null; then
    echo "   ✓ Backend is ready — http://localhost:${BACKEND_PORT}"
    break
  fi
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo "   ✗ Backend process died. Check the error above."
    exit 1
  fi
  if [ "$i" -eq 30 ]; then
    echo "   ✗ Backend did not respond after 30 seconds."
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

# ── Step 4: Start portals ─────────────────────────────────────────────────
echo ""
echo "▶ [4/4] Starting portals..."

cd "$ROOT/jads-admin-portal"
npm run dev &
ADMIN_PID=$!

cd "$ROOT/jads-audit-portal"
npm run dev &
AUDIT_PID=$!

# User portal (if it exists)
USER_PID=""
if [ -d "$ROOT/jads-user-portal" ] && [ -f "$ROOT/jads-user-portal/package.json" ]; then
  cd "$ROOT/jads-user-portal"
  npm run dev &
  USER_PID=$!
fi

sleep 4

echo "   ✓ Admin portal  — http://localhost:5173"
echo "   ✓ Audit portal  — http://localhost:5174"
if [ -n "$USER_PID" ]; then
  echo "   ✓ User portal   — http://localhost:5175"
fi

# ── Ready ─────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────"
echo "  All services running. Press Ctrl+C to stop all."
echo "────────────────────────────────────────────────"
echo ""

# Trap Ctrl+C and kill everything cleanly
cleanup() {
  echo ""
  echo "Stopping all services..."
  kill $BACKEND_PID $ADMIN_PID $AUDIT_PID $USER_PID 2>/dev/null || true
  docker-compose stop
  echo "Done."
}
trap cleanup INT TERM

# Keep script alive
wait $BACKEND_PID
