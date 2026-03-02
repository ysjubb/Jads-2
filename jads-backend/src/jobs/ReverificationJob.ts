// Runs daily at 02:00 UTC.
// Checks all CivilianUsers for Aadhaar due dates and all SpecialUsers for
// annual reconfirmation. Suspension is automatic — no human approval required.
// All suspensions write to audit_log with SYSTEM actor.

import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('ReverificationJob')

const CRON_SCHEDULE     = '0 2 * * *'   // 02:00 UTC daily
const WARNING_DAYS      = 7              // flag REVERIFICATION_DUE 7 days before deadline

export class ReverificationJob {
  private task: ReturnType<typeof cron.schedule> | null = null

  constructor(private readonly prisma: PrismaClient) {}

  start(): void {
    log.info('reverification_job_started', { data: { schedule: CRON_SCHEDULE } })
    this.task = cron.schedule(CRON_SCHEDULE, () => {
      this.runOnce().catch(e =>
        log.error('reverification_job_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
      )
    })
  }

  stop(): void {
    this.task?.stop()
    log.info('reverification_job_stopped', {})
  }

  async runOnce(): Promise<{ warned: number; suspended: number; specialSuspended: number }> {
    const now              = new Date()
    const warningThreshold = new Date(now.getTime() + WARNING_DAYS * 24 * 3600 * 1000)

    // ── 1. Flag users approaching the 90-day Aadhaar deadline ─────────────
    const approachingDue = await this.prisma.civilianUser.findMany({
      where: {
        verificationStatus: 'VERIFIED',
        aadhaarNextDueAt:   { lte: warningThreshold, gt: now },
      }
    })
    for (const user of approachingDue) {
      await this.prisma.civilianUser.update({
        where: { id: user.id },
        data:  { verificationStatus: 'REVERIFICATION_DUE' },
      })
      log.warn('reverification_due_soon', {
        data: { userId: user.id, dueDate: user.aadhaarNextDueAt }
      })
      // TODO: Trigger SMS via gateway adapter when government activates live notifications
    }

    // ── 2. Suspend users past their Aadhaar deadline ─────────────────────
    const overdue = await this.prisma.civilianUser.findMany({
      where: {
        verificationStatus: { in: ['VERIFIED', 'REVERIFICATION_DUE'] },
        aadhaarNextDueAt:   { lt: now },
      }
    })
    for (const user of overdue) {
      await this.prisma.civilianUser.update({
        where: { id: user.id },
        data:  { verificationStatus: 'EXPIRED', accountStatus: 'SUSPENDED' },
      })
      await this.prisma.auditLog.create({
        data: {
          actorType:    'SYSTEM',
          actorId:      'REVERIFICATION_JOB',
          action:       'account_suspended_aadhaar_expired',
          resourceType: 'civilian_user',
          resourceId:   user.id,
          detailJson: JSON.stringify({
            overdueDate: user.aadhaarNextDueAt,
            ranAt:       now.toISOString(),
          })
        }
      })
      log.warn('account_suspended_aadhaar_expired', {
        data: { userId: user.id, overdueDate: user.aadhaarNextDueAt }
      })
    }

    // ── 3. Suspend special users past annual reconfirmation deadline ───────
    const specialUsersOverdue = await this.prisma.specialUser.findMany({
      where: {
        accountStatus:        'ACTIVE',
        nextAdminReconfirmDue: { lt: now },
      }
    })
    for (const user of specialUsersOverdue) {
      await this.prisma.specialUser.update({
        where: { id: user.id },
        data:  { accountStatus: 'SUSPENDED' },
      })
      await this.prisma.auditLog.create({
        data: {
          actorType:    'SYSTEM',
          actorId:      'REVERIFICATION_JOB',
          action:       'special_user_suspended_reconfirmation_overdue',
          resourceType: 'special_user',
          resourceId:   user.id,
          detailJson: JSON.stringify({
            entityCode:  user.entityCode,
            overdueSince: user.nextAdminReconfirmDue,
            ranAt:        now.toISOString(),
          })
        }
      })
      log.warn('special_user_suspended_reconfirm_overdue', {
        data: { userId: user.id, entityCode: user.entityCode }
      })
    }

    const result = {
      warned:           approachingDue.length,
      suspended:        overdue.length,
      specialSuspended: specialUsersOverdue.length,
    }

    log.info('reverification_job_complete', { data: { ...result, ranAt: now.toISOString() } })
    return result
  }
}
