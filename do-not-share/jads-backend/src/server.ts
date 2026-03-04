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

const app = express()

app.use(helmet())
app.use(cors({
  origin:         env.NODE_ENV === 'production'
    ? ['https://admin.jads.gov.in', 'https://audit.jads.gov.in']
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
  res.json({ status: 'ok', version: env.JADS_VERSION, timestamp: new Date().toISOString() })
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

  const prisma    = new PrismaClient()
  const scheduler = new JobScheduler(prisma)

  app.listen(env.PORT, () => {
    rootLogger.info('server_started', { data: { port: env.PORT, version: env.JADS_VERSION } })
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
