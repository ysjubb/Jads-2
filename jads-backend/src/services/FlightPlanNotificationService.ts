/**
 * FlightPlanNotificationService.ts
 *
 * Sends filing confirmation to pilots after a flight plan is successfully
 * transmitted to AAI via AFTN. Two channels:
 *
 *   1. SMS  — immediate, concise, single message
 *   2. Email — full details including AFTN message text + CC list
 *
 * Non-blocking: notification failure NEVER fails the filing.
 * Additional recipients (CC) set by pilot in the flight plan form.
 * All recipients logged in audit trail.
 *
 * Uses adapter pattern — EmailAdapter and SmsAdapter stubs ship with platform.
 * Live implementations provided by government integration team.
 */

import { PrismaClient }       from '@prisma/client'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('FlightPlanNotificationService')

// ── Adapter interfaces (stubs in dev — live in production) ───────────────────

export interface EmailMessage {
  to:       string
  cc?:      string[]
  subject:  string
  html:     string
  text:     string
}

export interface SmsMessage {
  to:   string    // E.164 format: +919800000001
  text: string
}

export interface IEmailAdapter {
  send(msg: EmailMessage): Promise<void>
}

export interface ISmsAdapter {
  send(msg: SmsMessage): Promise<void>
}

// ── Stub implementations ──────────────────────────────────────────────────────

export class EmailAdapterStub implements IEmailAdapter {
  async send(msg: EmailMessage): Promise<void> {
    log.debug('email_stub_send', {
      data: { to: msg.to, cc: msg.cc, subject: msg.subject }
    })
    // In production: replaced by government-provided SMTP/SES adapter
  }
}

export class SmsAdapterStub implements ISmsAdapter {
  async send(msg: SmsMessage): Promise<void> {
    log.debug('sms_stub_send', {
      data: { to: msg.to, text: msg.text.slice(0, 50) }
    })
    // In production: replaced by government-provided SMS gateway adapter
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FiledPlanSummary {
  id:           string
  aircraftId:        string
  adep:         string
  ades:         string
  eobt:         string
  cruisingLevel:string
  totalEet?:    string
  destAlternate?:string
  flightRules:  string
  atsRef?:      string | null
  aftnMessage:  string
  filedAt:      Date
  addressees:   {
    actionAddressees: Array<{ aftnAddress: string; unitName: string; unitType: string }>
  }
}

export interface PilotContact {
  email:        string
  mobileNumber: string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class FlightPlanNotificationService {

  constructor(
    private readonly prisma:       PrismaClient,
    private readonly emailAdapter: IEmailAdapter = new EmailAdapterStub(),
    private readonly smsAdapter:   ISmsAdapter   = new SmsAdapterStub()
  ) {}

  /**
   * Send filing confirmation. Non-blocking — caller should not await in
   * the main request path. Call with .catch() to log failures silently.
   */
  async sendFilingConfirmation(
    plan:             FiledPlanSummary,
    pilot:            PilotContact,
    additionalEmails: string[]
  ): Promise<void> {

    const recipients = [
      pilot.email,
      ...additionalEmails.filter(e => this.isValidEmail(e)),
    ]

    let emailStatus: string
    let smsStatus:   string

    // ── Email ──────────────────────────────────────────────────────────────
    try {
      await this.emailAdapter.send({
        to:      recipients[0],
        cc:      recipients.length > 1 ? recipients.slice(1) : undefined,
        subject: `Flight Plan Filed: ${plan.aircraftId} ${plan.adep}→${plan.ades} ${plan.eobt}Z`,
        html:    this.buildHtml(plan),
        text:    this.buildText(plan),
      })
      emailStatus = 'SENT'
      log.info('filing_confirmation_email_sent', {
        data: { planId: plan.id, aircraftId: plan.aircraftId, recipients }
      })
    } catch (err: any) {
      emailStatus = 'FAILED'
      log.error('filing_confirmation_email_failed', {
        data: { planId: plan.id, error: err.message }
      })
    }

    // ── SMS ────────────────────────────────────────────────────────────────
    try {
      await this.smsAdapter.send({
        to:   pilot.mobileNumber,
        text: this.buildSms(plan),
      })
      smsStatus = 'SENT'
    } catch (err: any) {
      smsStatus = 'FAILED'
      log.error('filing_confirmation_sms_failed', {
        data: { planId: plan.id, error: err.message }
      })
    }

    // ── Update delivery status ─────────────────────────────────────────────
    await this.prisma.mannedFlightPlan.update({
      where: { id: plan.id },
      data: {
        confirmationEmailSentAt:  new Date(),
        confirmationEmailStatus:  emailStatus,
        confirmationSmsSentAt:    new Date(),
        confirmationSmsStatus:    smsStatus,
      },
    }).catch(err => {
      log.error('notification_status_update_failed', { data: { planId: plan.id, err: err.message } })
    })

    // ── Audit log ──────────────────────────────────────────────────────────
    await this.prisma.auditLog.create({
      data: {
        actorType:    'SYSTEM',
        actorId:      plan.id,
        action:       'flight_plan_confirmation_sent',
        resourceType: 'manned_flight_plan',
        resourceId:   plan.id,
        success:      emailStatus === 'SENT',
        detailJson: JSON.stringify({
          recipients,
          smsRecipient:  pilot.mobileNumber,
          emailStatus,
          smsStatus,
        }),
      },
    }).catch(() => { /* audit log failure is non-fatal */ })
  }

  // ── SMS template — fits in one 160-char message ─────────────────────────────

  private buildSms(plan: FiledPlanSummary): string {
    const ref = plan.atsRef ?? plan.id.slice(0, 8).toUpperCase()
    return [
      `JADS: FPL Filed`,
      `${plan.aircraftId} ${plan.adep}-${plan.ades}`,
      `EOBT: ${plan.eobt}Z  ${plan.cruisingLevel}`,
      `Ref: ${ref}`,
      `${new Date(plan.filedAt).toISOString().slice(0, 16)}Z`,
    ].join('\n')
  }

  // ── Email HTML template ───────────────────────────────────────────────────

  private buildHtml(plan: FiledPlanSummary): string {
    const addrRows = plan.addressees.actionAddressees
      .map(a => `
        <tr>
          <td style="font-family:monospace;padding:3px 8px;color:#1a3a5c;">${a.aftnAddress}</td>
          <td style="padding:3px 8px;color:#444;">${a.unitName}</td>
          <td style="padding:3px 8px;color:#888;font-size:11px;">${a.unitType.replace(/_/g, ' ')}</td>
        </tr>`)
      .join('')

    return `<!DOCTYPE html><html><head><style>
      body{font-family:Arial,sans-serif;color:#222;max-width:680px;margin:0 auto;background:#f9f9f9}
      .header{background:#1a3a5c;color:#fff;padding:16px 24px;border-radius:4px 4px 0 0}
      .body{background:#fff;padding:20px 24px;border:1px solid #ddd}
      .row{display:flex;margin:6px 0;font-size:13px}
      .lbl{width:180px;color:#666;font-weight:600}
      .val{color:#222}
      .aftn{background:#111;color:#00d066;font-family:monospace;font-size:12px;
            padding:14px;border-radius:4px;white-space:pre;overflow-x:auto}
      .footer{background:#f0f0f0;padding:10px 24px;font-size:11px;color:#888;
              border:1px solid #ddd;border-top:none;border-radius:0 0 4px 4px}
      hr{border:none;border-top:1px solid #eee;margin:16px 0}
      .ok{color:#1a7a1a;font-size:16px;font-weight:700}
      table{width:100%;border-collapse:collapse}
      th{text-align:left;font-size:11px;color:#888;padding:3px 8px;border-bottom:1px solid #eee}
    </style></head><body>
    <div class="header">
      <div style="font-size:20px;font-weight:700">JADS — Flight Plan Filing Confirmation</div>
      <div style="font-size:12px;opacity:.8;margin-top:4px">Joint Aviation Data System | Government of India | Platform v4.0</div>
    </div>
    <div class="body">
      <div class="ok">✓ Flight Plan Successfully Filed</div>
      <div style="color:#888;font-size:12px;margin:4px 0 16px">
        Filed: ${new Date(plan.filedAt).toUTCString()}
      </div>
      <hr>
      <div style="font-weight:700;margin-bottom:10px">Flight Details</div>
      <div class="row"><span class="lbl">Aircraft ID (ARCID)</span><span class="val" style="font-weight:700">${plan.aircraftId}</span></div>
      <div class="row"><span class="lbl">Route</span><span class="val">${plan.adep} → ${plan.ades}</span></div>
      <div class="row"><span class="lbl">EOBT</span><span class="val">${plan.eobt}Z</span></div>
      <div class="row"><span class="lbl">Flight Rules</span><span class="val">${plan.flightRules}</span></div>
      <div class="row"><span class="lbl">Cruising Level</span><span class="val">${plan.cruisingLevel}</span></div>
      ${plan.totalEet ? `<div class="row"><span class="lbl">Total EET</span><span class="val">${plan.totalEet}</span></div>` : ''}
      ${plan.destAlternate ? `<div class="row"><span class="lbl">Dest. Alternate</span><span class="val">${plan.destAlternate}</span></div>` : ''}
      <div class="row"><span class="lbl">ATS Reference</span><span class="val" style="font-family:monospace">${plan.atsRef ?? 'Pending ATS acknowledgement'}</span></div>
      <hr>
      <div style="font-weight:700;margin-bottom:8px">AFTN Message Transmitted</div>
      <div style="font-size:11px;color:#888;margin-bottom:6px">The following message was filed with AAI via AFTN gateway:</div>
      <div class="aftn">${escapeHtml(plan.aftnMessage)}</div>
      <hr>
      <div style="font-weight:700;margin-bottom:8px">Addressees Notified</div>
      <table>
        <thead><tr>
          <th>AFTN Address</th><th>Unit</th><th>Role</th>
        </tr></thead>
        <tbody>${addrRows}</tbody>
      </table>
      <hr>
      <div style="color:#888;font-size:12px;line-height:1.5">
        <strong>Important:</strong> This confirmation does not constitute ATC clearance.
        Departure clearance is obtained from ${plan.adep} ATC before pushback/start-up.
        This flight plan remains active for 1 hour after EOBT unless cancelled (FPL CNL).
      </div>
    </div>
    <div class="footer">
      JADS Platform v4.0 | Ref: ${plan.id} |
      This is an automated notification. Do not reply to this email.
    </div>
    </body></html>`
  }

  // ── Plain text fallback ───────────────────────────────────────────────────

  private buildText(plan: FiledPlanSummary): string {
    const addrLines = plan.addressees.actionAddressees
      .map(a => `  ${a.aftnAddress}  ${a.unitName}`)
      .join('\n')

    return [
      'JADS — FLIGHT PLAN FILING CONFIRMATION',
      '=======================================',
      `STATUS: Successfully Filed at ${new Date(plan.filedAt).toUTCString()}`,
      '',
      'FLIGHT DETAILS',
      '--------------',
      `Aircraft ID:     ${plan.aircraftId}`,
      `Route:           ${plan.adep} → ${plan.ades}`,
      `EOBT:            ${plan.eobt}Z`,
      `Flight Rules:    ${plan.flightRules}`,
      `Cruising Level:  ${plan.cruisingLevel}`,
      plan.totalEet    ? `EET:             ${plan.totalEet}` : '',
      plan.destAlternate ? `Dest Alternate:  ${plan.destAlternate}` : '',
      `ATS Ref:         ${plan.atsRef ?? 'Pending'}`,
      '',
      'AFTN MESSAGE TRANSMITTED',
      '------------------------',
      plan.aftnMessage,
      '',
      'ADDRESSEES NOTIFIED',
      '-------------------',
      addrLines,
      '',
      'IMPORTANT: This confirmation does not constitute ATC clearance.',
      '',
      `JADS Platform v4.0 | Ref: ${plan.id}`,
    ].filter(l => l !== undefined).join('\n')
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
