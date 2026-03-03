// Runs at 02:00 UTC daily alongside ReverificationJob.
// Bulk-suspends any SpecialUser whose nextAdminReconfirmDue has passed.
// Admin reinstates via PATCH /api/admin/special-users/:id/reconfirm.
// One audit_log entry per batch run (not per user) for efficiency.

import cron from 'node-cron'
import { PrismaClient }  from '@prisma/client'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('AnnualReconfirmJob')

const CRON_SCHEDULE = '0 2 * * *'   // 02:00 UTC — same window as ReverificationJob

export class AnnualReconfirmJob {
  private task: ReturnType<typeof cron.schedule> | null = null

  constructor(private readonly prisma: PrismaClient) {}

  start(): void {
    log.info('annual_reconfirm_job_starting', { data: { schedule: CRON_SCHEDULE } })
    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.runCheck().catch(e =>
        log.error('annual_reconfirm_job_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
      )
    })
  }

  stop(): void {
    this.task?.stop()
    log.info('annual_reconfirm_job_stopped', {})
  }

  async runCheck(): Promise<{ suspended: number }> {
    const now = new Date()

    const result = await this.prisma.specialUser.updateMany({
      where: {
        accountStatus:         'ACTIVE',
        nextAdminReconfirmDue: { lt: now },
      },
      data: { accountStatus: 'SUSPENDED' }
    })

    if (result.count > 0) {
      log.warn('special_users_suspended_overdue_reconfirmation', {
        data: { count: result.count, checkedAt: now.toISOString() }
      })
      await this.prisma.auditLog.create({
        data: {
          actorType:    'SYSTEM',
          actorId:      'ANNUAL_RECONFIRM_JOB',
          action:       'special_users_auto_suspended',
          resourceType: 'special_user',
          resourceId:   null,
          detailJson: JSON.stringify({
            suspendedCount: result.count,
            reason:         'annual_reconfirmation_overdue',
            ranAt:          now.toISOString(),
          })
        }
      })
    }

    log.info('annual_reconfirm_check_complete', {
      data: { suspended: result.count, checkedAt: now.toISOString() }
    })
    return { suspended: result.count }
  }
}
