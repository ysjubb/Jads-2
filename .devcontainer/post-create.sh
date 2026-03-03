#!/usr/bin/env bash
set -euo pipefail

echo "==> Starting PostgreSQL via docker-compose..."
docker compose up -d
echo "==> Waiting for Postgres to be healthy..."
until docker compose exec -T postgres pg_isready -U jads -d jads_dev >/dev/null 2>&1; do
  sleep 1
done
echo "==> Postgres is ready."

echo "==> Installing backend dependencies..."
cd jads-backend
npm install

echo "==> Copying .env.example → .env..."
cp -n .env.example .env || true

echo "==> Running Prisma migrations..."
npx prisma generate
npx prisma migrate deploy

echo "==> Seeding demo data..."
npx ts-node prisma/seed.ts

echo ""
echo "============================================"
echo "  JADS Platform ready!"
echo "  Start backend:       cd jads-backend && npm run dev"
echo "  Start admin portal:  cd jads-admin-portal && npm install && npm run dev"
echo "  Start audit portal:  cd jads-audit-portal && npm install && npm run dev"
echo "============================================"
