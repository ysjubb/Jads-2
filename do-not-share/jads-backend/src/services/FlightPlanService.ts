// FlightPlanService — wires all validation engines in the correct order:
//   P4A: OfplValidationService — field syntax, Item 18, aerodrome lookup
//   P4B: RouteSemanticEngine   — route parsing, distances, TAS, magnetic track
//   P4C: AltitudeComplianceEngine — semicircular rule, RVSM
//   P4D: FirGeometryEngine     — FIR sequencing, EET per FIR
//   P4E: AftnMessageBuilder + IAftnGateway — build and file AFTN message
//
// Every write records permissionArtefactId for forensic replay.
// Audit log written for every file attempt (success and failure).

import { PrismaClient }             from '@prisma/client'
import { OfplValidationService }    from './OfplValidationService'
import { RouteSemanticEngine }      from './RouteSemanticEngine'
import { AltitudeComplianceEngine } from './AltitudeComplianceEngine'
import { FirGeometryEngine }        from './FirGeometryEngine'
import { AftnMessageBuilder }       from './AftnMessageBuilder'
import { AftnCnlBuilder }          from '../aftn/AftnCnlBuilder'
import { AftnDlaBuilder }          from '../aftn/AftnDlaBuilder'
import { AftnArrBuilder }          from '../aftn/AftnArrBuilder'
import { AftnAddresseeService }     from './AftnAddresseeService'
import { FlightPlanNotificationService } from './FlightPlanNotificationService'
import { AftnGatewayStub }          from '../adapters/stubs/AftnGatewayStub'
import { AirspaceVersioningService } from './AirspaceVersioningService'
import type { IAftnGateway }        from '../adapters/interfaces/IAftnGateway'
import { serializeForJson }         from '../utils/bigintSerializer'
import { getCruiseLevelString }      from './indiaAIP'
import { createServiceLogger }      from '../logger'

const log = createServiceLogger('FlightPlanService')

export class FlightPlanService {
  private validator:    OfplValidationService
  private routeEngine:  RouteSemanticEngine
  private altEngine    = new AltitudeComplianceEngine()
  private firEngine    = new FirGeometryEngine()
  private msgBuilder   = new AftnMessageBuilder()
  private cnlBuilder   = new AftnCnlBuilder()
  private dlaBuilder   = new AftnDlaBuilder()
  private arrBuilder   = new AftnArrBuilder()
  private addresseeSvc = new AftnAddresseeService()
  private notifySvc:    FlightPlanNotificationService

  constructor(
    private readonly prisma:      PrismaClient,
    private readonly aftnGateway: IAftnGateway = new AftnGatewayStub()
  ) {
    this.validator   = new OfplValidationService(this.prisma)
    this.routeEngine = new RouteSemanticEngine(
      this.prisma, new AirspaceVersioningService(this.prisma))
    this.notifySvc   = new FlightPlanNotificationService(this.prisma)
  }

  async createAndFilePlan(
    input:                any,
    userId:               string,
    userType:             'CIVILIAN' | 'SPECIAL',
    authorisedCallsigns?: string[]
  ): Promise<{ flightPlanId: string; status: string; atsRef?: string; report: any }> {
    const allErrors:         any[] = []
    const allWarnings:       any[] = []
    const allUsedVersionIds: string[] = []

    // ── P4A: Field validation, Item 18, aerodrome checks ───────────────────
    const step1 = await this.validator.validate(input, userType, authorisedCallsigns)
    allErrors.push(...step1.errors)
    allWarnings.push(...step1.warnings)
    allUsedVersionIds.push(...step1.usedVersionIds)

    if (step1.errors.length > 0) {
      await this.writeAuditLog(userId, userType, 'flight_plan_validation_failed', null, false,
        { errors: step1.errors, callsign: input.callsign })
      return {
        flightPlanId: '', status: 'VALIDATION_FAILED',
        report: serializeForJson({ errors: step1.errors, warnings: step1.warnings })
      }
    }

    // ── P4B: Route semantic computation ────────────────────────────────────
    const step2 = await this.routeEngine.validateAndCompute({
      departureIcao:   input.departureIcao,
      destinationIcao: input.destinationIcao,
      routeString:     input.route,
      speedIndicator:  input.speedIndicator,
      speedValue:      input.speedValue,
      depLatDeg:       step1.computedData.depAerodrome?.latDeg,
      depLonDeg:       step1.computedData.depAerodrome?.lonDeg,
      depMagVar:       step1.computedData.depAerodrome?.magneticVariation,
      destLatDeg:      step1.computedData.destAerodrome?.latDeg,
      destLonDeg:      step1.computedData.destAerodrome?.lonDeg,
    })
    allErrors.push(...step2.errors)
    allWarnings.push(...step2.warnings)
    allUsedVersionIds.push(...step2.usedVersionIds)

    // ── P4C: Altitude compliance ───────────────────────────────────────────
    const step3 = this.altEngine.checkCompliance({
      flightRules:    input.flightRules,
      levelIndicator: input.levelIndicator,
      levelValue:     input.levelValue,
      magneticTrackDeg: step2.magneticTrackDeg,
      equipment:      input.equipment,
      destinationTransitionAltFt:
        step1.computedData.destAerodrome?.transitionAltitudeFt ?? undefined,
      destinationTransitionLevelFl:
        step1.computedData.destAerodrome?.transitionLevelFl ?? undefined,
    })
    allErrors.push(...step3.errors)
    allWarnings.push(...step3.warnings)

    // ── P4D: FIR sequencing ────────────────────────────────────────────────
    const step4 = this.firEngine.computeFirSequence(
      step2.legs,
      step2.groundspeedKts,
      input.departureIcao,
      input.destinationIcao
    )

    // Final check after all engines
    if (allErrors.length > 0) {
      await this.writeAuditLog(userId, userType, 'flight_plan_engines_failed', null, false,
        { errors: allErrors, callsign: input.callsign })
      return {
        flightPlanId: '', status: 'VALIDATION_FAILED',
        report: serializeForJson({ errors: allErrors, warnings: allWarnings })
      }
    }

    // ── Build AFTN message ─────────────────────────────────────────────────
    const speedStr = `${input.speedIndicator}${input.speedValue}`
    const requestedFt = input.levelIndicator === 'F'
      ? parseInt(input.levelValue) * 100
      : input.levelIndicator === 'A'
      ? parseInt(input.levelValue) * 100
      : 9000
    const levelStr = input.levelIndicator === 'VFR'
      ? 'VFR'
      : getCruiseLevelString(input.departureIcao, requestedFt)

    const aftnMessage = this.msgBuilder.build({
      callsign:           input.callsign,
      flightRules:        input.flightRules,
      flightType:         input.flightType,
      aircraftType:       input.aircraftType,
      wakeTurbulence:     input.wakeTurbulence,
      equipment:          input.equipment,
      surveillance:       input.surveillance,
      departureIcao:      input.departureIcao,
      eobt:               input.estimatedOffBlock,
      speed:              speedStr,
      level:              levelStr,
      route:              input.route,
      destination:        input.destinationIcao,
      eet:                input.eet,
      alternate1:         input.alternate1,
      alternate2:         input.alternate2,
      item18Parsed:       step1.item18Parsed,
      endurance:          input.enduranceHHmm,
      pob:                input.personsOnBoard,
      // Item 19 SAR fields — passed through from operator input
      radioEquipment:     input.radioEquipment,
      survivalEquipment:  input.survivalEquipment,
      jackets:            input.jackets,
      dinghies:           input.dinghies,
    })

    // ── Save to DB — VALIDATED ─────────────────────────────────────────────
    // Map ICAO single-letter codes back to Prisma enum values for DB storage
    const rulesDbMap: Record<string, string> = { V: 'VFR', I: 'IFR', Y: 'Y', Z: 'Z' }
    const flightPlanIdBig = BigInt(Date.now())
    const plan = await this.prisma.mannedFlightPlan.create({
      data: {
        flightPlanId:               flightPlanIdBig,
        aircraftId:              input.callsign,
        flightRules:           (rulesDbMap[input.flightRules] || input.flightRules) as any,
        flightType:            input.flightType,
        aircraftType:          input.aircraftType,
        wakeTurbulence:        input.wakeTurbulence,
        item10Equipment:            input.equipment.split(''),
        item10Surveillance:         input.surveillance.split(''),
        adep:            input.departureIcao,
        eobt:    this.parseEobt(input.estimatedOffBlock),
        cruisingSpeed:                speedStr,
        cruisingLevel:                levelStr,
        route:                input.route,
        ades:          input.destinationIcao,
        eet:                  String(this.hhmm2min(input.eet)),
        altn1:           input.alternate1 ?? null,
        altn2:           input.alternate2 ?? null,
        item18:            input.otherInfo ?? null,
        endurance:            input.enduranceHHmm ? String(this.hhmm2min(input.enduranceHHmm)) : null,
        personsOnBoard:       input.personsOnBoard ?? null,
        aftnMessage:            aftnMessage,
        permissionArtefactId: [...new Set(allUsedVersionIds)],
        validatedAtUtc:             new Date(),
        validationResultJson:       JSON.stringify({
          errors: allErrors, warnings: allWarnings,
          magneticTrackDeg:  step2.magneticTrackDeg,
          totalEet:   step2.totalEet,
          cruiseTasKts:      step2.cruiseTasKts,
          routeLegs: step2.legs.map((leg: any) => ({
            from: { identifier: leg.from.identifier, type: leg.from.type, latDeg: leg.from.latDeg, lonDeg: leg.from.lonDeg },
            to:   { identifier: leg.to.identifier,   type: leg.to.type,   latDeg: leg.to.latDeg,   lonDeg: leg.to.lonDeg },
            distanceNm: leg.distanceNm,
          })),
        }),
        status:                     'VALIDATED' as any,
        totalEet:            String(Math.round(step2.totalEet)),
        filedBy:              userId,
        filedByType:          userType,
        originalEobt:         this.parseEobt(input.estimatedOffBlock),
      }
    })

    // ── Auto-generate AFTN addressees (AftnAddresseeService) ──────────────
    const addresseeStructure = this.addresseeSvc.generateAddressees({
      adep:           input.departureIcao,
      ades:           input.destinationIcao,
      depAlternate:   input.alternate1 ?? undefined,
      destAlternate:  input.alternate2 ?? undefined,
      firSequence:    step4.crossings.map(c => ({
        firCode:       c.firCode,
        firName:       c.firName ?? c.firCode,
        entryWaypoint: c.entryPoint ?? input.departureIcao,
      })),
    })
    const addressees = addresseeStructure.actionAddressees.map(a => a.aftnAddress)

    const filingResult = await this.aftnGateway.fileFpl({
      messageType:    'FPL',
      priority:       'GG',
      addressees,
      originator:     'JADSZTZX',
      filingTime:     input.estimatedOffBlock,
      messageContent: aftnMessage
    })

    // ── Update filing result ───────────────────────────────────────────────
    const finalStatus = filingResult.accepted ? 'FILED' : 'FILING_FAILED'
    await this.prisma.mannedFlightPlan.update({
      where: { id: plan.id },
      data: {
        status:             finalStatus as any,
        atsRef:             filingResult.atsRef ?? null,
        aftnTransmissionId: filingResult.aftnTransmissionId ?? null,
        filedAt:         filingResult.accepted ? new Date() : null,
      }
    })

    await this.writeAuditLog(
      userId, userType,
      filingResult.accepted ? 'flight_plan_filed' : 'flight_plan_filing_failed',
      plan.id, filingResult.accepted,
      {
        callsign:        input.callsign,
        atsRef:          filingResult.atsRef,
        aftnMessage:     aftnMessage.substring(0, 300),
        firSequence:     step4.crossings.map(c => c.firCode).join('→'),
        totalEet: Math.round(step2.totalEet),
        addresseesCount: addressees.length,
      }
    )

    // ── Filing confirmation — fire-and-forget, never blocks filing ─────────
    if (filingResult.accepted && input.pilotEmail) {
      this.notifySvc.sendFilingConfirmation(
        {
          id:            plan.id,
          aircraftId:    input.callsign,
          adep:          input.departureIcao,
          ades:          input.destinationIcao,
          eobt:          input.estimatedOffBlock,
          cruisingLevel: levelStr,
          totalEet:      input.eet,
          destAlternate: input.alternate1 ?? undefined,
          flightRules:   input.flightRules,
          atsRef:        filingResult.atsRef ?? null,
          aftnMessage,
          filedAt:       new Date(),
          addressees:    addresseeStructure,
        },
        {
          email:        input.pilotEmail,
          mobileNumber: input.pilotMobile ?? '',
        },
        input.notifyEmails ?? []
      ).catch(err => {
        log.warn('filing_notification_failed', { data: { planId: plan.id, err: err.message } })
      })
    }

    log.info(filingResult.accepted ? 'flight_plan_filed' : 'flight_plan_filing_failed', {
      data: {
        flightPlanId: plan.id, callsign: input.callsign,
        atsRef: filingResult.atsRef, status: finalStatus,
        addressees: addressees.length,
      }
    })

    return {
      flightPlanId: plan.id,
      status:       finalStatus,
      atsRef:       filingResult.atsRef ?? undefined,
      report:       serializeForJson({
        errors:           allErrors,
        warnings:         allWarnings,
        aftnMessage,
        magneticTrackDeg: step2.magneticTrackDeg,
        totalEet:  Math.round(step2.totalEet),
        totalEetMinutes:  step2.totalEetMinutes,
        firSequence:      step4.crossings,
        status:  'PENDING_CLEARANCE',
      })
    }
  }

  // ── Cancel a filed flight plan (AFTN CNL) ─────────────────────────────────
  async cancelPlan(
    flightPlanId: string,
    userId:       string,
    userType:     'CIVILIAN' | 'SPECIAL',
    reason:       string,
    role?:        string
  ): Promise<{ success: boolean; status: string; cnlMessage?: string }> {
    const plan = await this.prisma.mannedFlightPlan.findUnique({
      where: { id: flightPlanId }
    })

    if (!plan) throw new Error('FLIGHT_PLAN_NOT_FOUND')
    const isAdmin = ['PLATFORM_SUPER_ADMIN', 'DGCA_AUDITOR'].includes(role ?? '')
    if (!isAdmin && plan.filedBy !== userId) {
      throw new Error('FORBIDDEN: You did not file this plan')
    }

    const cancellableStatuses = ['FILED', 'ACKNOWLEDGED', 'VALIDATED', 'DELAYED']
    if (!cancellableStatuses.includes(plan.status)) {
      throw new Error(`CANNOT_CANCEL: Plan is ${plan.status}`)
    }

    // Build AFTN CNL message
    const eobtStr = this.formatEobt(plan.eobt)
    const cnlMessage = this.cnlBuilder.build({
      callsign:      plan.aircraftId,
      departureIcao: plan.adep,
      eobt:          eobtStr,
      destination:   plan.ades,
    })

    // Transmit via AFTN gateway
    const filingResult = await this.aftnGateway.fileFpl({
      messageType:    'CNL',
      priority:       'GG',
      addressees:     this.msgBuilder.deriveAddressees(plan.adep, plan.ades),
      originator:     'JADSZTZX',
      filingTime:     eobtStr,
      messageContent: cnlMessage,
    })

    // Update plan status + persist CNL message and gateway result
    await this.prisma.mannedFlightPlan.update({
      where: { id: flightPlanId },
      data: {
        status:                  'CANCELLED' as any,
        cancelledAt:             new Date(),
        cancelledBy:             userId,
        cancellationReason:      reason,
        cnlAftnMessage:          cnlMessage,
        aftnTransmissionStatus:  filingResult.stubMode ? 'STUB' : (filingResult.accepted ? 'TRANSMITTED' : 'FAILED'),
        aftnGatewayResultJson:   JSON.stringify(filingResult),
        aftnTransmittedAt:       new Date(filingResult.transmittedAtUtc),
      }
    })

    await this.writeAuditLog(userId, userType, 'flight_plan_cancelled', flightPlanId, true, {
      callsign: plan.aircraftId, reason, cnlAccepted: filingResult.accepted,
    })

    log.info('flight_plan_cancelled', {
      data: { flightPlanId, callsign: plan.aircraftId, reason }
    })

    return { success: true, status: 'CANCELLED', cnlMessage }
  }

  // ── Delay a filed flight plan (AFTN DLA) ─────────────────────────────────
  async delayPlan(
    flightPlanId: string,
    userId:       string,
    userType:     'CIVILIAN' | 'SPECIAL',
    newEobt:      string,    // DDHHmm format
    reason:       string,
    role?:        string
  ): Promise<{ success: boolean; status: string; dlaMessage?: string }> {
    const plan = await this.prisma.mannedFlightPlan.findUnique({
      where: { id: flightPlanId }
    })

    if (!plan) throw new Error('FLIGHT_PLAN_NOT_FOUND')
    const isAdmin = ['PLATFORM_SUPER_ADMIN', 'DGCA_AUDITOR'].includes(role ?? '')
    if (!isAdmin && plan.filedBy !== userId) {
      throw new Error('FORBIDDEN: You did not file this plan')
    }

    const delayableStatuses = ['FILED', 'ACKNOWLEDGED', 'DELAYED']
    if (!delayableStatuses.includes(plan.status)) {
      throw new Error(`CANNOT_DELAY: Plan is ${plan.status}`)
    }

    // ICAO Doc 4444 §11.4.2.4: delay must be ≥ 30 minutes
    const originalEobtMs = plan.eobt.getTime()
    const newEobtDate    = this.parseEobt(newEobt)
    const delayMinutes   = (newEobtDate.getTime() - originalEobtMs) / 60000
    if (delayMinutes < 30) {
      throw new Error(`DELAY_TOO_SHORT: ${Math.round(delayMinutes)} min delay provided — ICAO Doc 4444 §11.4.2.4 requires ≥ 30 min`)
    }

    // Build AFTN DLA message
    const originalEobtStr = this.formatEobt(plan.eobt)
    const dlaMessage = this.dlaBuilder.build({
      callsign:      plan.aircraftId,
      departureIcao: plan.adep,
      originalEobt:  originalEobtStr,
      newEobt,
      destination:   plan.ades,
    })

    // Transmit via AFTN gateway
    const filingResult = await this.aftnGateway.fileFpl({
      messageType:    'DLA',
      priority:       'GG',
      addressees:     this.msgBuilder.deriveAddressees(plan.adep, plan.ades),
      originator:     'JADSZTZX',
      filingTime:     originalEobtStr,
      messageContent: dlaMessage,
    })

    // Update plan with new EOBT, DELAYED status, and persist DLA message + gateway result
    await this.prisma.mannedFlightPlan.update({
      where: { id: flightPlanId },
      data: {
        status:                  'DELAYED' as any,
        delayedNewEobt:          newEobtDate,
        delayReason:             reason,
        eobt:                    newEobtDate,
        dlaAftnMessage:          dlaMessage,
        dlaFiledAt:              new Date(),
        aftnTransmissionStatus:  filingResult.stubMode ? 'STUB' : (filingResult.accepted ? 'TRANSMITTED' : 'FAILED'),
        aftnGatewayResultJson:   JSON.stringify(filingResult),
        aftnTransmittedAt:       new Date(filingResult.transmittedAtUtc),
      }
    })

    await this.writeAuditLog(userId, userType, 'flight_plan_delayed', flightPlanId, true, {
      callsign: plan.aircraftId, reason, newEobt, dlaAccepted: filingResult.accepted,
    })

    log.info('flight_plan_delayed', {
      data: { flightPlanId, callsign: plan.aircraftId, newEobt, reason }
    })

    return { success: true, status: 'DELAYED', dlaMessage }
  }

  // ── Report arrival of a flight plan (AFTN ARR) ─────────────────────────────
  async arrivePlan(
    flightPlanId: string,
    userId:       string,
    userType:     'CIVILIAN' | 'SPECIAL',
    arrivalTime:  string,   // HHmm UTC
    arrivalIcao?: string,   // Override ADES for diversion
    role?:        string
  ): Promise<{ success: boolean; status: string; arrMessage?: string }> {
    const plan = await this.prisma.mannedFlightPlan.findUnique({
      where: { id: flightPlanId }
    })

    if (!plan) throw new Error('FLIGHT_PLAN_NOT_FOUND')
    const isAdmin = ['PLATFORM_SUPER_ADMIN', 'DGCA_AUDITOR'].includes(role ?? '')
    if (!isAdmin && plan.filedBy !== userId) {
      throw new Error('FORBIDDEN: You did not file this plan')
    }

    const arrivableStatuses = ['FILED', 'ACKNOWLEDGED', 'ACTIVATED', 'DELAYED', 'FULLY_CLEARED']
    if (!arrivableStatuses.includes(plan.status)) {
      throw new Error(`CANNOT_ARRIVE: Plan is ${plan.status}`)
    }

    // Build AFTN ARR message — use arrivalIcao override for diversions
    const actualArrivalAerodrome = arrivalIcao ?? plan.ades
    const arrMessage = this.arrBuilder.build({
      callsign:          plan.aircraftId,
      departureIcao:     plan.adep,
      eobt:              this.formatEobt(plan.eobt),
      arrivalAerodrome:  actualArrivalAerodrome,
      arrivalTime,
    })

    // Transmit via AFTN gateway
    const filingResult = await this.aftnGateway.fileFpl({
      messageType:    'ARR',
      priority:       'GG',
      addressees:     this.msgBuilder.deriveAddressees(plan.adep, plan.ades),
      originator:     'JADSZTZX',
      filingTime:     arrivalTime,
      messageContent: arrMessage,
    })

    // Update plan status to ARRIVED + persist ARR message and gateway result
    await this.prisma.mannedFlightPlan.update({
      where: { id: flightPlanId },
      data: {
        status:                  'ARRIVED' as any,
        arrivedAt:               new Date(),
        actualArrivalTime:       arrivalTime,
        arrAftnMessage:          arrMessage,
        aftnTransmissionStatus:  filingResult.stubMode ? 'STUB' : (filingResult.accepted ? 'TRANSMITTED' : 'FAILED'),
        aftnGatewayResultJson:   JSON.stringify(filingResult),
        aftnTransmittedAt:       new Date(filingResult.transmittedAtUtc),
      }
    })

    await this.writeAuditLog(userId, userType, 'flight_plan_arrived', flightPlanId, true, {
      callsign: plan.aircraftId, arrivalTime, arrAccepted: filingResult.accepted,
    })

    log.info('flight_plan_arrived', {
      data: { flightPlanId, callsign: plan.aircraftId, arrivalTime }
    })

    return { success: true, status: 'ARRIVED', arrMessage }
  }

  private formatEobt(eobt: Date): string {
    const dd = String(eobt.getUTCDate()).padStart(2, '0')
    const hh = String(eobt.getUTCHours()).padStart(2, '0')
    const mm = String(eobt.getUTCMinutes()).padStart(2, '0')
    return `${dd}${hh}${mm}`
  }

  private parseEobt(eobt: string): Date {
    const day  = parseInt(eobt.substring(0, 2))
    const hour = parseInt(eobt.substring(2, 4))
    const min  = parseInt(eobt.substring(4, 6))
    const now  = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, min, 0))
  }

  private hhmm2min(hhmm: string): number {
    return parseInt(hhmm.substring(0, 2)) * 60 + parseInt(hhmm.substring(2, 4))
  }

  private async writeAuditLog(
    actorId:    string,
    actorType:  string,
    action:     string,
    resourceId: string | null,
    success:    boolean,
    data:       object
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType:    actorType === 'CIVILIAN' ? 'CIVILIAN_USER' : 'SPECIAL_USER',
        actorId, action,
        resourceType: 'flight_plan',
        resourceId:   resourceId ?? undefined,
        success,
        detailJson: JSON.stringify(data)
      }
    })
  }
}
