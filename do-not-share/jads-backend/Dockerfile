# JADS Backend v4.0 — Production Dockerfile
# Multi-stage build: compile TypeScript → slim production image.
#
# Build:   docker build -t jads-backend:4.0 .
# Run:     docker run -p 8080:8080 --env-file .env jads-backend:4.0
#
# Security notes:
#   - Non-root user (node:node, UID 1000)
#   - No devDependencies in final image
#   - No source TypeScript in final image
#   - Health check via /api/health endpoint

# ── Stage 1: Build ──────────────────────────────────────────────────────────

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json .npmrc ./

# Install ALL dependencies (including devDeps for tsc)
# --ignore-scripts is set in .npmrc; run postinstall explicitly if needed
RUN npm ci && npx prisma generate

# Copy source
COPY tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/

# Build TypeScript
RUN npx tsc

# ── Stage 2: Production ────────────────────────────────────────────────────

FROM node:20-alpine AS production

# Security: run as non-root
RUN addgroup -S jads && adduser -S jads -G jads

WORKDIR /app

# Copy package files and install production-only deps
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npx prisma generate

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist/

# Copy Prisma schema (needed at runtime for client)
COPY prisma ./prisma/

# Security: no source code in production image
# Verify no .ts files leaked
RUN test -z "$(find /app/dist -name '*.ts' 2>/dev/null)" || exit 1

# Switch to non-root user
USER jads

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

# Start server
CMD ["node", "dist/server.js"]
