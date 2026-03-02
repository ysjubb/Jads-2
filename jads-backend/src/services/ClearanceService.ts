// ClearanceService handles inbound ADC and FIC issuances from AFMLU and FIR offices.
// When a clearance arrives via push webhook, this service:
//   1. Validates the flight plan exists and is in the right state
//   2. Appends the new ref to issuedAdcRefsJson / issuedFicRefsJson
//   3. Updates clearanceStatus based on what has now been received
//   4. Writes an audit log entry (AFMLU/FIR acted as external system)
//   5. Broadcasts an SSE event so the pilot's app updates instantly

import { PrismaClient }        from '@prisma/client'
import { createServiceLogger } from '../logger'
import type { Response }       from 'express'

const log = createServiceLogger('ClearanceService')

// ── SSE Connection Registry ────────────────────────────────────────────────
// Maps flightPlanDbId → Set of active SSE response objects.
// In-process only — acceptable for single-instance deployment.
// For multi-instance: replace with Redis pub/sub on the same channel.
const sseClients = new Map<string, Set<Response>>()

export function registerSseClient(flightPlanDbId: string, res: Response): void {
  if (!sseClients.has(flightPlanDbId)) sseClients.set(flightPlanDbId, new Set())
  sseClients.get(flightPlanDbId)!.add(res)
  log.info('sse_client_connected', { data: { flightPlanDbId, total: sseClients.get(flightPlanDbId)!.size } })
}

export function unregisterSseClient(flightPlanDbId: string, res: Response): void {
  sseClients.get(flightPlanDbId)?.delete(res)
  if (sseClients.get(flightPlanDbId)?.size === 0) sseClients.delete(flightPlanDbId)
}

function broadcastSseEvent(flightPlanDbId: string, event: string, data: object): void {
  const clients = sseClients.get(flightPlanDbId)
  if (!clients || clients.size === 0) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  let dead: Response[] = []
  for (const res of clients) {
    try {
      res.write(payload)
    } catch {
      dead.push(res)  // Client disconnected ungracefully
    }
  }
  dead.forEach(r => unregisterSseClient(flightPlanDbId, r))
  log.info('sse_event_broadcast', { data: { flightPlanDbId, event, clientCount: clients.size } })
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AdcIssuanceInput {
  flightPlanId:    string   // JADS flight plan DB id
  afmluId:         number
  adcNumber:       string
  adcType:         string   // RESTRICTED, PROHIBITED, DANGER, etc.
  issuedAt:        string   // ISO 8601 from AFMLU system
  afmluOfficerName: string  // For audit trail
}

export interface FicIssuanceInput {
  flightPlanId:   string   // JADS flight plan DB id
  firCode:        string   // VIDF, VABB, VECC, VOMF
  ficNumber:      string
  subject:        string
  issuedAt:       string   // ISO 8601 from FIR system
  firOfficerName: string   // For audit trail
}

export interface ClearanceRef {
  afmluId?:         number
  adcNumber?:       string
  adcType?:         string
  firCode?:         string
  ficNumber?:       string
  subject?:         string
  issuedAt:         string
  officerName:      string
}

// ── Clearance Status Logic ─────────────────────────────────────────────────
// PENDING_CLEARANCE  — plan filed, no ADC or FIC yet
// ADC_ISSUED         — AFMLU has issued ADC number(s), awaiting FIC
// FIC_ISSUED         — FIR has issued FIC number(s), awaiting ADC
// FULLY_CLEARED      — both ADC and FIC issued → pilot can fly
// CLEARANCE_REJECTED — AFMLU or FIR explicitly rejected

function computeClearanceStatus(adcRefs: ClearanceRef[], ficRefs: ClearanceRef[]): string {
  const hasAdc = adcRefs.length > 0
  const hasFic = ficRefs.length > 0
  if (hasAdc && hasFic) return 'FULLY_CLEARED'
  if (hasAdc)           return 'ADC_ISSUED'
  if (hasFic)           return 'FIC_ISSUED'
  return 'PENDING_CLEARANCE'
}

// ── Main Service ───────────────────────────────────────────────────────────

export class ClearanceService {
  constructor(private readonly prisma: PrismaClient) {}

  async issueAdc(input: AdcIssuanceInput): Promise<{ status: string }> {
    const plan = await this.prisma.mannedFlightPlan.findUnique({
      where: { id: input.flightPlanId }
    })
    if (!plan) throw new Error(`Flight plan ${input.flightPlanId} not found`)

    // Parse existing refs
    // Idempotent: skip if same ADC number already recorded
    if (plan.adcNumber === input.adcNumber) {
      log.info('adc_issuance_duplicate', { data: { flightPlanId: input.flightPlanId, adcNumber: input.adcNumber } })
      return { status: plan.status as string }
    }

    await this.prisma.mannedFlightPlan.update({
      where: { id: input.flightPlanId },
      data:  {
        adcNumber: input.adcNumber,
        status:    'ACKNOWLEDGED',
      }
    })
    const newStatus = 'ACKNOWLEDGED'

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SYSTEM',
        actorId:      `AFMLU_${input.afmluId}`,
        action:       'adc_number_issued',
        resourceType: 'manned_flight_plan',
        resourceId:   input.flightPlanId,
        detailJson: JSON.stringify({
          adcNumber:       input.adcNumber,
          adcType:         input.adcType,
          afmluId:         input.afmluId,
          officerName:     input.afmluOfficerName,
          issuedAt:        input.issuedAt,
          status: newStatus,
        })
      }
    })

    // Push to pilot's app immediately — no polling required
    broadcastSseEvent(input.flightPlanId, 'adc_issued', {
      adcNumber:       input.adcNumber,
      adcType:         input.adcType,
      afmluId:         input.afmluId,
      issuedAt:        input.issuedAt,
      status: newStatus,
      allAdcRefs:      adcRefs,
    })

    log.info('adc_issued', {
      data: { flightPlanId: input.flightPlanId, adcNumber: input.adcNumber, newStatus }
    })

    return { status: newStatus }
  }

  async issueFic(input: FicIssuanceInput): Promise<{ status: string }> {
    const plan = await this.prisma.mannedFlightPlan.findUnique({
      where: { id: input.flightPlanId }
    })
    if (!plan) throw new Error(`Flight plan ${input.flightPlanId} not found`)

    const ficRefs: ClearanceRef[] = plan.ficNumber ? JSON.parse(plan.ficNumber) : []

    // Idempotent: skip if this FIC already recorded
    const alreadyIssued = ficRefs.some(r => r.ficNumber === input.ficNumber && r.firCode === input.firCode)
    if (alreadyIssued) {
      log.info('fic_issuance_duplicate', { data: { flightPlanId: input.flightPlanId, ficNumber: input.ficNumber } })
      return { status: plan.status as string }
    }

    const newRef: ClearanceRef = {
      firCode:     input.firCode,
      ficNumber:   input.ficNumber,
      subject:     input.subject,
      issuedAt:    input.issuedAt,
      officerName: input.firOfficerName,
    }
    ficRefs.push(newRef)

    const newStatus = computeClearanceStatus(adcRefs, ficRefs)

    await this.prisma.mannedFlightPlan.update({
      where: { id: input.flightPlanId },
      data:  {
        ficNumber: JSON.stringify(ficRefs),
        status:   newStatus,
      }
    })

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SYSTEM',
        actorId:      `FIR_${input.firCode}`,
        action:       'fic_number_issued',
        resourceType: 'manned_flight_plan',
        resourceId:   input.flightPlanId,
        detailJson: JSON.stringify({
          ficNumber:       input.ficNumber,
          firCode:         input.firCode,
          subject:         input.subject,
          officerName:     input.firOfficerName,
          issuedAt:        input.issuedAt,
          status: newStatus,
        })
      }
    })

    // Push to pilot's app immediately
    broadcastSseEvent(input.flightPlanId, 'fic_issued', {
      ficNumber:       input.ficNumber,
      firCode:         input.firCode,
      subject:         input.subject,
      issuedAt:        input.issuedAt,
      status: newStatus,
      allFicRefs:      ficRefs,
    })

    log.info('fic_issued', {
      data: { flightPlanId: input.flightPlanId, ficNumber: input.ficNumber, newStatus }
    })

    return { status: newStatus }
  }

  async rejectClearance(flightPlanId: string, reason: string, rejectedBy: string): Promise<void> {
    await this.prisma.mannedFlightPlan.update({
      where: { id: flightPlanId },
      data:  { status: 'CLEARANCE_REJECTED' }
    })

    await this.prisma.auditLog.create({
      data: {
        actorType:    'SYSTEM',
        actorId:      rejectedBy,
        action:       'clearance_rejected',
        resourceType: 'manned_flight_plan',
        resourceId:   flightPlanId,
        detailJson: JSON.stringify({ reason, rejectedBy })
      }
    })

    broadcastSseEvent(flightPlanId, 'clearance_rejected', { reason, rejectedBy })

    log.warn('clearance_rejected', { data: { flightPlanId, reason } })
  }

  async getClearanceStatus(flightPlanId: string): Promise<{
    status: string
    adcRefs: ClearanceRef[]
    ficRefs: ClearanceRef[]
  }> {
    const plan = await this.prisma.mannedFlightPlan.findUniqueOrThrow({
      where:  { id: flightPlanId },
      select: { status: true, adcNumber: true, ficNumber: true }
    })
    return {
      status: plan.status,
      adcRefs: plan.adcNumber ? JSON.parse(plan.adcNumber) : [],
      ficRefs: plan.ficNumber ? JSON.parse(plan.ficNumber) : [],
    }
  }
}
