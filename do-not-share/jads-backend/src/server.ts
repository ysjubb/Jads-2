import 'dotenv/config'
import express          from 'express'
import cors             from 'cors'
import helmet           from 'helmet'
import { env }          from './env'
import { rootLogger }   from './logger'
import { versionHeaderMiddleware } from './middleware/authMiddleware'
import authRoutes        from './routes/authRoutes'
import flightPlanRoutes  from './routes/flightPlanRoutes'
import droneRoutes       from './routes/droneRoutes'
import notamMetarRoutes  from './routes/notamMetarRoutes'
import auditRoutes       from './routes/auditRoutes'
import adminRoutes       from './routes/adminRoutes'
import adcFicRoutes      from './routes/adcFicRoutes'
import adapterWebhookRoutes from './routes/adapterWebhookRoutes'
import systemRoutes      from './routes/systemRoutes'
import agentRoutes       from './routes/agentRoutes'
import manufacturerRoutes from './routes/manufacturerRoutes'
import droneOperationPlanRoutes from './routes/droneOperationPlanRoutes'
import telemetryRoutes          from './routes/telemetryRoutes'
import { initWsServer }         from './ws/wsServer'
import { DEMO_CONFIG, getDemoCorsOrigins } from './config/demoConfig'

const app = express()

app.use(helmet())

const productionOrigins = getDemoCorsOrigins([
  'https://admin.jads.gov.in',
  'https://audit.jads.gov.in',
])

app.use(cors({
  origin:         env.NODE_ENV === 'production' && !DEMO_CONFIG.enabled
    ? productionOrigins
    : true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH'],  // No DELETE — platform invariant
  allowedHeaders: ['Content-Type', 'Authorization', 'X-JADS-Version'],
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: false }))

app.use((req, _res, next) => {
  rootLogger.info('http_request', { data: { method: req.method, path: req.path } })
  next()
})

// Health — no version header required
app.get('/health', (_req, res) => {
  res.json({
    status:    'ok',
    version:   env.JADS_VERSION,
    timestamp: new Date().toISOString(),
    demo:      DEMO_CONFIG.enabled,
    ...(DEMO_CONFIG.enabled && DEMO_CONFIG.publicUrl
      ? { publicUrl: DEMO_CONFIG.publicUrl, wsUrl: DEMO_CONFIG.wsUrl }
      : {}),
  })
})

// All /api routes require X-JADS-Version: 4.0
const api = express.Router()
api.use(versionHeaderMiddleware)
api.use('/auth',         authRoutes)
api.use('/flight-plans', flightPlanRoutes)
api.use('/drone',        droneRoutes)
api.use('/notams',       notamMetarRoutes)
api.use('/metars',       notamMetarRoutes)
api.use('/adc',          adcFicRoutes)
api.use('/adapter',      adapterWebhookRoutes)
api.use('/audit',        auditRoutes)
api.use('/admin',        adminRoutes)
api.use('/system',       systemRoutes)
api.use('/agents',       agentRoutes)
api.use('/manufacturer', manufacturerRoutes)
api.use('/drone-plans', droneOperationPlanRoutes)
api.use('/missions',    telemetryRoutes)
app.use('/api', api)

app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', version: env.JADS_VERSION })
})

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  rootLogger.error('unhandled_error', { data: { message: err.message } })
  res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
})

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JobScheduler } = require('./jobs/JobScheduler')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AuditIntegrityService } = require('./services/AuditIntegrityService')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { RuntimeIntegrityService } = require('./services/KeyManagementService')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path')

  const prisma    = new PrismaClient()
  const scheduler = new JobScheduler(prisma)

  const server = app.listen(env.PORT, async () => {
    rootLogger.info('server_started', { data: { port: env.PORT, version: env.JADS_VERSION } })

    // ── T02: WebSocket server for live telemetry ──────────────────────────
    initWsServer(server)

    // ── Defense 6: Audit log immutability triggers ───────────────────────
    // Idempotent — safe to call on every startup. Creates PostgreSQL
    // BEFORE UPDATE/DELETE triggers that block all audit log mutation.
    // Without this, audit log entries are mutable at the DB level.
    try {
      const auditIntegrity = new AuditIntegrityService(prisma)
      const triggerResult = await auditIntegrity.installTriggers()
      rootLogger.info('audit_triggers_status', { data: triggerResult })
    } catch (e) {
      rootLogger.error('audit_triggers_install_failed', {
        data: { error: e instanceof Error ? e.message : String(e) }
      })
    }

    // ── Defense 2: Runtime integrity baseline ────────────────────────────
    // Computes SHA-256 of critical service files at startup. Re-checks
    // every 5 minutes. Detects if an attacker modifies ForensicVerifier
    // or other critical code on a running server.
    try {
      const distDir = path.resolve(__dirname)
      const criticalFiles = [
        path.join(distDir, 'services', 'ForensicVerifier.js'),
        path.join(distDir, 'services', 'AuditIntegrityService.js'),
        path.join(distDir, 'services', 'KeyManagementService.js'),
        path.join(distDir, 'services', 'MerkleTreeService.js'),
        path.join(distDir, 'services', 'ExternalAnchorService.js'),
        path.join(distDir, 'telemetry', 'canonicalSerializer.js'),
      ]
      const integrity = new RuntimeIntegrityService(criticalFiles)
      integrity.computeBaseline()
      setInterval(() => {
        const result = integrity.checkIntegrity()
        if (!result.intact) {
          rootLogger.error('runtime_integrity_violation', { data: { violations: result.violations } })
        }
      }, 5 * 60 * 1000)
    } catch (e) {
      rootLogger.warn('runtime_integrity_init_failed', {
        data: { error: e instanceof Error ? e.message : String(e) }
      })
    }

    scheduler.startAll()
  })

  process.on('SIGTERM', async () => {
    rootLogger.info('server_shutting_down', {})
    scheduler.stopAll()
    await prisma.$disconnect()
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    rootLogger.info('server_sigint', {})
    scheduler.stopAll()
    await prisma.$disconnect()
    process.exit(0)
  })
}

export default app
