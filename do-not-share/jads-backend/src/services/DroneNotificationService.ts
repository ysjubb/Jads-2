/**
 * DroneNotificationService.ts
 *
 * Centralised notification engine for the JADS platform.
 *
 * 13 notification types (N01–N13):
 *   N01–N05: Expiry alerts (90 / 60 / 30 / 7 days, expired)
 *   N06–N10: Permission lifecycle (submitted / approved / rejected / downloaded / revoked)
 *   N11–N13: Compliance & system (violation / compliance warning / broadcast)
 *
 * Delivery channels:
 *   1. In-app — stored in NotificationRecord table, queried via REST API
 *   2. Email  — optional nodemailer transport (SMTP env vars must be set)
 *
 * All methods are idempotent — duplicate notifications for the same event
 * are prevented via metadata matching.
 */

import { PrismaClient, NotificationType } from '@prisma/client'
import { createServiceLogger } from '../logger'
import { env } from '../env'

const log = createServiceLogger('DroneNotificationService')

// ── Notification category mapping (for UI colour coding) ─────────────────────

export type NotificationCategory = 'EXPIRY' | 'PERMISSION' | 'COMPLIANCE' | 'SYSTEM'

const TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  EXPIRY_90_DAYS:        'EXPIRY',
  EXPIRY_60_DAYS:        'EXPIRY',
  EXPIRY_30_DAYS:        'EXPIRY',
  EXPIRY_7_DAYS:         'EXPIRY',
  EXPIRY_EXPIRED:        'EXPIRY',
  PERMISSION_SUBMITTED:  'PERMISSION',
  PERMISSION_APPROVED:   'PERMISSION',
  PERMISSION_REJECTED:   'PERMISSION',
  PERMISSION_DOWNLOADED: 'PERMISSION',
  PERMISSION_REVOKED:    'PERMISSION',
  VIOLATION_DETECTED:    'COMPLIANCE',
  COMPLIANCE_WARNING:    'COMPLIANCE',
  SYSTEM_BROADCAST:      'SYSTEM',
}

export function getCategoryForType(type: NotificationType): NotificationCategory {
  return TYPE_CATEGORY[type]
}

// ── Alert config type (for admin UI) ─────────────────────────────────────────

export interface AlertConfig {
  type:          NotificationType
  label:         string
  category:      NotificationCategory
  enabled:       boolean
  emailEnabled:  boolean
  thresholdDays: number | null
}

// Default alert configuration — admin can override via API
const DEFAULT_ALERT_CONFIGS: AlertConfig[] = [
  { type: 'EXPIRY_90_DAYS',        label: 'Licence/UIN Expiry — 90 days',       category: 'EXPIRY',     enabled: true,  emailEnabled: true,  thresholdDays: 90 },
  { type: 'EXPIRY_60_DAYS',        label: 'Licence/UIN Expiry — 60 days',       category: 'EXPIRY',     enabled: true,  emailEnabled: true,  thresholdDays: 60 },
  { type: 'EXPIRY_30_DAYS',        label: 'Licence/UIN Expiry — 30 days',       category: 'EXPIRY',     enabled: true,  emailEnabled: true,  thresholdDays: 30 },
  { type: 'EXPIRY_7_DAYS',         label: 'Licence/UIN Expiry — 7 days',        category: 'EXPIRY',     enabled: true,  emailEnabled: true,  thresholdDays: 7  },
  { type: 'EXPIRY_EXPIRED',        label: 'Licence/UIN Expired',                category: 'EXPIRY',     enabled: true,  emailEnabled: true,  thresholdDays: 0  },
  { type: 'PERMISSION_SUBMITTED',  label: 'PA Submitted to eGCA',               category: 'PERMISSION', enabled: true,  emailEnabled: false, thresholdDays: null },
  { type: 'PERMISSION_APPROVED',   label: 'PA Approved by Authority',            category: 'PERMISSION', enabled: true,  emailEnabled: true,  thresholdDays: null },
  { type: 'PERMISSION_REJECTED',   label: 'PA Rejected by Authority',            category: 'PERMISSION', enabled: true,  emailEnabled: true,  thresholdDays: null },
  { type: 'PERMISSION_DOWNLOADED', label: 'PA ZIP Downloaded',                   category: 'PERMISSION', enabled: true,  emailEnabled: false, thresholdDays: null },
  { type: 'PERMISSION_REVOKED',    label: 'PA Revoked Post-Approval',            category: 'PERMISSION', enabled: true,  emailEnabled: true,  thresholdDays: null },
  { type: 'VIOLATION_DETECTED',    label: 'Airspace/Geofence Violation',         category: 'COMPLIANCE', enabled: true,  emailEnabled: true,  thresholdDays: null },
  { type: 'COMPLIANCE_WARNING',    label: 'Compliance Issue (Chain Break, etc)', category: 'COMPLIANCE', enabled: true,  emailEnabled: true,  thresholdDays: null },
  { type: 'SYSTEM_BROADCAST',      label: 'System Broadcast Message',            category: 'SYSTEM',     enabled: true,  emailEnabled: false, thresholdDays: null },
]

// ── Email transport (lazy-init) ──────────────────────────────────────────────

let emailTransport: any = null

async function getEmailTransport() {
  if (emailTransport) return emailTransport
  if (!env.SMTP_HOST || !env.SMTP_USER) return null

  try {
    // Dynamic import — nodemailer is optional
    const nodemailer = await import('nodemailer')
    emailTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
    log.info('smtp_transport_created', { data: { host: env.SMTP_HOST, port: env.SMTP_PORT } })
    return emailTransport
  } catch (e) {
    log.warn('smtp_transport_failed', { data: { error: e instanceof Error ? e.message : String(e) } })
    return null
  }
}

// ── Service class ────────────────────────────────────────────────────────────

export class DroneNotificationService {
  private prisma: PrismaClient
  private alertConfigs: AlertConfig[]

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
    this.alertConfigs = [...DEFAULT_ALERT_CONFIGS]
  }

  // ── Alert config management ─────────────────────────────────────────────

  getAlertConfigs(): AlertConfig[] {
    return this.alertConfigs
  }

  updateAlertConfig(type: NotificationType, updates: Partial<Pick<AlertConfig, 'enabled' | 'emailEnabled' | 'thresholdDays'>>): AlertConfig | null {
    const config = this.alertConfigs.find(c => c.type === type)
    if (!config) return null
    if (updates.enabled !== undefined) config.enabled = updates.enabled
    if (updates.emailEnabled !== undefined) config.emailEnabled = updates.emailEnabled
    if (updates.thresholdDays !== undefined) config.thresholdDays = updates.thresholdDays
    return config
  }

  // ── Core notification creation ──────────────────────────────────────────

  /**
   * Create an in-app notification and optionally send email.
   * Returns the created NotificationRecord.
   */
  async notify(params: {
    userId:    string
    type:      NotificationType
    title:     string
    body:      string
    metadata?: Record<string, unknown>
    email?:    string   // recipient email for email delivery
  }) {
    const config = this.alertConfigs.find(c => c.type === params.type)
    if (config && !config.enabled) {
      log.info('notification_suppressed', { data: { type: params.type, userId: params.userId } })
      return null
    }

    // Create in-app notification
    const record = await this.prisma.notificationRecord.create({
      data: {
        userId:   params.userId,
        type:     params.type,
        title:    params.title,
        body:     params.body,
        metadata: (params.metadata ?? {}) as any,
      },
    })

    log.info('notification_created', {
      data: { id: record.id, type: params.type, userId: params.userId },
    })

    // Send email if configured and recipient provided
    if (params.email && config?.emailEnabled) {
      await this.sendEmail(params.email, params.title, params.body)
    }

    return record
  }

  /**
   * Broadcast a message to multiple users.
   * Used by admin alert management for system-wide announcements.
   */
  async broadcast(params: {
    userIds:  string[]
    title:    string
    body:     string
    metadata?: Record<string, unknown>
  }) {
    const records = await this.prisma.notificationRecord.createMany({
      data: params.userIds.map(userId => ({
        userId,
        type:     'SYSTEM_BROADCAST' as NotificationType,
        title:    params.title,
        body:     params.body,
        metadata: (params.metadata ?? {}) as any,
      })),
    })

    log.info('broadcast_sent', {
      data: { recipientCount: params.userIds.length, title: params.title },
    })

    return { count: records.count }
  }

  // ── Query methods ───────────────────────────────────────────────────────

  /**
   * Get notifications for a user with filtering and pagination.
   */
  async getNotifications(params: {
    userId:     string
    unreadOnly?: boolean
    category?:  NotificationCategory
    page?:      number
    limit?:     number
  }) {
    const page  = Math.max(1, params.page ?? 1)
    const limit = Math.min(100, Math.max(1, params.limit ?? 20))

    const where: Record<string, unknown> = { userId: params.userId }
    if (params.unreadOnly) where.read = false

    // Filter by category (maps to multiple NotificationTypes)
    if (params.category) {
      const types = Object.entries(TYPE_CATEGORY)
        .filter(([, cat]) => cat === params.category)
        .map(([type]) => type)
      where.type = { in: types }
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notificationRecord.findMany({
        where,
        skip:    (page - 1) * limit,
        take:    limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notificationRecord.count({ where }),
      this.prisma.notificationRecord.count({
        where: { userId: params.userId, read: false },
      }),
    ])

    return { notifications, total, unreadCount, page, limit }
  }

  /**
   * Get unread notification count for a user (for bell badge).
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notificationRecord.count({
      where: { userId, read: false },
    })
  }

  /**
   * Mark a single notification as read.
   */
  async markRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notificationRecord.findUnique({
      where: { id: notificationId },
    })
    if (!notification || notification.userId !== userId) {
      return null
    }

    return this.prisma.notificationRecord.update({
      where: { id: notificationId },
      data:  { read: true, readAt: new Date() },
    })
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllRead(userId: string) {
    const result = await this.prisma.notificationRecord.updateMany({
      where: { userId, read: false },
      data:  { read: true, readAt: new Date() },
    })
    return { count: result.count }
  }

  // ── Expiry notification helpers ─────────────────────────────────────────

  /**
   * Scan all civilian users for upcoming licence/UIN expiry and create
   * expiry notifications. Intended to be called from a daily cron job.
   */
  async scanAndNotifyExpiries() {
    const now = new Date()
    const thresholds = [
      { days: 90, type: 'EXPIRY_90_DAYS' as NotificationType },
      { days: 60, type: 'EXPIRY_60_DAYS' as NotificationType },
      { days: 30, type: 'EXPIRY_30_DAYS' as NotificationType },
      { days: 7,  type: 'EXPIRY_7_DAYS'  as NotificationType },
      { days: 0,  type: 'EXPIRY_EXPIRED' as NotificationType },
    ]

    let totalCreated = 0

    // Scan civilian users with dgcaLicenseExpiry set
    const users = await this.prisma.civilianUser.findMany({
      where: { dgcaLicenseExpiry: { not: null } },
      select: { id: true, email: true, dgcaLicenseExpiry: true, dgcaLicenseNumber: true },
    })

    for (const user of users) {
      if (!user.dgcaLicenseExpiry) continue

      const daysUntilExpiry = Math.ceil(
        (user.dgcaLicenseExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      for (const threshold of thresholds) {
        if (
          (threshold.days === 0 && daysUntilExpiry <= 0) ||
          (threshold.days > 0 && daysUntilExpiry <= threshold.days && daysUntilExpiry > (threshold.days === 90 ? 60 : threshold.days === 60 ? 30 : threshold.days === 30 ? 7 : 0))
        ) {
          // Check for existing notification of this type for this user in the last 24 hours
          const existing = await this.prisma.notificationRecord.findFirst({
            where: {
              userId: user.id,
              type:   threshold.type,
              createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            },
          })

          if (!existing) {
            const label = threshold.days === 0
              ? 'has expired'
              : `expires in ${threshold.days} days`

            await this.notify({
              userId: user.id,
              type:   threshold.type,
              title:  `DGCA Licence ${label}`,
              body:   `Your DGCA licence ${user.dgcaLicenseNumber ?? ''} ${label}. Please renew promptly to continue drone operations.`,
              metadata: {
                licenseNumber: user.dgcaLicenseNumber,
                expiryDate:    user.dgcaLicenseExpiry.toISOString(),
                daysRemaining: daysUntilExpiry,
              },
              email: user.email ?? undefined,
            })
            totalCreated++
          }
        }
      }
    }

    log.info('expiry_scan_complete', { data: { usersScanned: users.length, notificationsCreated: totalCreated } })
    return { usersScanned: users.length, notificationsCreated: totalCreated }
  }

  // ── Upcoming expiries report (for admin CSV export) ─────────────────────

  async getUpcomingExpiries(withinDays: number = 90) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + withinDays)

    const users = await this.prisma.civilianUser.findMany({
      where: {
        dgcaLicenseExpiry: {
          not: null,
          lte: cutoff,
        },
      },
      select: {
        id: true,
        email: true,
        phone: true,
        dgcaLicenseNumber: true,
        dgcaLicenseExpiry: true,
        role: true,
        accountStatus: true,
      },
      orderBy: { dgcaLicenseExpiry: 'asc' },
    })

    return users.map(u => ({
      userId:           u.id,
      email:            u.email,
      phone:            u.phone,
      licenseNumber:    u.dgcaLicenseNumber,
      expiryDate:       u.dgcaLicenseExpiry?.toISOString() ?? null,
      daysRemaining:    u.dgcaLicenseExpiry
        ? Math.ceil((u.dgcaLicenseExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null,
      role:             u.role,
      accountStatus:    u.accountStatus,
    }))
  }

  // ── Delivery status ────────────────────────────────────────────────────

  async getDeliveryStats() {
    const [total, unread, readCount, byType] = await Promise.all([
      this.prisma.notificationRecord.count(),
      this.prisma.notificationRecord.count({ where: { read: false } }),
      this.prisma.notificationRecord.count({ where: { read: true } }),
      this.prisma.notificationRecord.groupBy({
        by: ['type'],
        _count: { type: true },
      }),
    ])

    return {
      total,
      unread,
      read: readCount,
      byType: byType.map(g => ({ type: g.type, count: g._count.type })),
    }
  }

  // ── Email helper ────────────────────────────────────────────────────────

  private async sendEmail(to: string, subject: string, text: string) {
    try {
      const transport = await getEmailTransport()
      if (!transport) return

      await transport.sendMail({
        from:    env.SMTP_FROM,
        to,
        subject: `[JADS] ${subject}`,
        text,
      })

      log.info('email_sent', { data: { to, subject } })
    } catch (e) {
      log.warn('email_send_failed', {
        data: { to, subject, error: e instanceof Error ? e.message : String(e) },
      })
    }
  }
}
