/**
 * JADS E2E — Scope Invariant Enforcement
 *
 * CRITICAL: These tests verify that the platform CANNOT be used as a
 * real-time monitoring system, even accidentally.
 *
 * Invariants under test (from P0 Section S):
 *   S2 — Platform must NOT be a real-time monitoring system
 *   S3 — Drone data flows ONE direction ONLY: device → backend AFTER landing
 *
 * These are not functional tests — they are architectural boundary tests.
 * If any of these fail, scope has been violated and the build must not ship.
 */

import supertest from 'supertest'
import app from '../../src/app'
import { createTestClient, cleanDatabase, assertDefined } from '../helpers/testDb'
import { bootstrapTestAuth, TestAuthContext } from '../helpers/authFactory'

const request = supertest(app)
const HEADERS  = { 'X-JADS-Version': '4.0' }

describe('Scope Invariant Enforcement — S2 / S3 (Post-Flight Only)', () => {

  const prisma = createTestClient()
  let   auth:   TestAuthContext

  beforeAll(async () => {
    await cleanDatabase(prisma)
    auth = await bootstrapTestAuth(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  // ── S2: No real-time WebSocket endpoint ─────────────────────────────────

  test('SCOPE-01: No WebSocket endpoint exists on the server', async () => {
    // WebSocket upgrade request must be rejected — the platform has no
    // real-time streaming capability by design (S2, S7)
    const res = await request
      .get('/ws')
      .set('Upgrade', 'websocket')
      .set('Connection', 'Upgrade')

    // 404 = no such route (good), 400 = server rejects upgrade (good)
    // 101 = WebSocket accepted = SCOPE VIOLATION
    expect(res.status).not.toBe(101)
    expect([404, 400, 405]).toContain(res.status)
  })

  test('SCOPE-02: No /ws/live-track endpoint', async () => {
    const res = await request
      .get('/ws/live-track')
      .set(HEADERS)

    expect(res.status).not.toBe(101)
    expect([404, 400, 405]).toContain(res.status)
  })

  test('SCOPE-03: No /ws/drone-position endpoint', async () => {
    const res = await request
      .get('/ws/drone-position')
      .set(HEADERS)

    expect(res.status).not.toBe(101)
    expect([404, 400, 405]).toContain(res.status)
  })

  // ── S2: No SSE (Server-Sent Events) live position streaming ─────────────

  test('SCOPE-04: No SSE live-position endpoint', async () => {
    const res = await request
      .get('/api/drone/stream/position')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .set('Accept', 'text/event-stream')

    // 404 = route does not exist (correct)
    // 200 with text/event-stream = SCOPE VIOLATION
    expect(res.status).toBe(404)
    expect(res.headers['content-type'] ?? '').not.toContain('text/event-stream')
  })

  test('SCOPE-05: No SSE live-mission-status endpoint', async () => {
    const res = await request
      .get('/api/drone/missions/active/stream')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .set('Accept', 'text/event-stream')

    expect(res.status).toBe(404)
  })

  // ── S2: No real-time alert push endpoints ───────────────────────────────

  test('SCOPE-06: No in-flight alert endpoint exists', async () => {
    // If someone accidentally adds a "send alert to drone" endpoint, this catches it
    const candidates = [
      '/api/drone/alert',
      '/api/drone/command',
      '/api/drone/in-flight/alert',
      '/api/drone/rtl',          // Return to Launch
      '/api/atc/alert',
    ]

    for (const path of candidates) {
      const res = await request
        .post(path)
        .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
        .send({ type: 'geofence_alert' })

      expect(res.status).toBe(404)
    }
  })

  // ── S3: Upload endpoint requires landing confirmation ───────────────────

  test('SCOPE-07: Drone upload with zero records → rejected (not silently stored)', async () => {
    const res = await request
      .post('/api/drone/missions/upload')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .send({
        missionId: 'SCOPE-TEST-EMPTY',
        records:   [],   // No records — mission not complete
      })

    // Must not return 201 for an empty mission
    expect(res.status).not.toBe(201)
    expect([400, 422]).toContain(res.status)
  })

  test('SCOPE-08: No endpoint accepts mid-flight telemetry POST', async () => {
    // S3: Data flows device → backend AFTER landing only.
    // There must be no endpoint that accepts a single mid-flight telemetry record.
    const res = await request
      .post('/api/drone/telemetry/live')
      .set({ ...HEADERS, Authorization: `Bearer ${auth.civilianJwt}` })
      .send({ missionId: 'TEST', sequence: 5, canonicalHex: 'aa'.repeat(96) })

    expect(res.status).toBe(404)
  })

  // ── S4: Manned aircraft data flows one way only ──────────────────────────

  test('SCOPE-09: No ATC response ingestion endpoint', async () => {
    // S4: Platform does not receive ATC responses.
    const candidates = [
      '/api/atc/response',
      '/api/flight-plans/atc-update',
      '/api/aftn/inbound',
    ]

    for (const path of candidates) {
      const res = await request
        .post(path)
        .set(HEADERS)
        .send({ message: 'ATC RESPONSE' })

      expect(res.status).toBe(404)
    }
  })

  // ── S3: Backend must never poll or command the drone ────────────────────

  test('SCOPE-10: No drone-query or command endpoints', async () => {
    const candidates = [
      '/api/drone/command/rtl',
      '/api/drone/command/land',
      '/api/drone/query/position',
      '/api/drone/query/status',
    ]

    for (const path of candidates) {
      const res = await request
        .get(path)
        .set({ ...HEADERS, Authorization: `Bearer ${auth.superAdminJwt}` })

      expect(res.status).toBe(404)
    }
  })

  // ── Verify no real-time routes are registered anywhere ──────────────────

  test('SCOPE-11: Express router has no registered realtime drone monitoring routes', () => {
    // AUDIT FIX: Expanded pattern list to include '/events' (SSE paths).
    // The legitimate manned aircraft SSE endpoint (/flight-plans/:id/events for ADC/FIC
    // clearance notifications) is explicitly allowlisted — it is NOT a drone monitoring
    // endpoint and is within platform scope (manned aircraft clearance workflow).
    const routerStack = (app as any)._router?.stack ?? []

    function collectPaths(stack: any[], prefix = ''): string[] {
      const paths: string[] = []
      for (const layer of stack) {
        if (layer.route?.path) {
          paths.push(prefix + layer.route.path)
        }
        if (layer.handle?.stack) {
          const subPrefix = layer.regexp?.source?.includes('\\/')
            ? prefix + (layer.keys?.[0] ? '/:param' : '')
            : prefix
          paths.push(...collectPaths(layer.handle.stack, subPrefix))
        }
      }
      return paths
    }

    // Allowlisted SSE/event paths (legitimate, non-drone, non-monitoring endpoints)
    const ALLOWLISTED = [
      '/flight-plans/:id/events',  // Manned aircraft ADC/FIC clearance SSE
    ]

    const allPaths = collectPaths(routerStack)
    const realtimePaths = allPaths.filter(p => {
      const matchesPattern =
        p.includes('/ws') ||
        p.includes('/stream') ||
        p.includes('/live') ||
        p.includes('/realtime') ||
        p.includes('/push') ||
        p.includes('/events')   // AUDIT FIX: was missing — could miss SSE endpoints
      if (!matchesPattern) return false
      // Exclude explicitly allowlisted paths
      return !ALLOWLISTED.some(allowed => p.includes(allowed.replace(':id', '')))
    })

    expect(realtimePaths).toHaveLength(0)
  })

})
