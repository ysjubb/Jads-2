import { PrismaClient } from '@prisma/client'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('AdcFicService')

// Frozen role classification — DO NOT move filtering to DB layer.
// DB always returns all records. Service filters by role.
// Filtering in DB would make scope violations invisible in audit.
const GOVT_ENTITY_ROLES = new Set([
  'GOVT_PILOT', 'GOVT_DRONE_OPERATOR',
  'DGCA_AUDITOR', 'AAI_AUDITOR',
  'IAF_AUDITOR', 'ARMY_AUDITOR', 'NAVY_AUDITOR',
  'PLATFORM_SUPER_ADMIN'
])

// Civilian users CANNOT see EXERCISE-type ADC records.
// Military exercise areas must not appear on civilian pre-flight displays.
// This is the frozen filtering rule — enforced in service, not DB query.
const CIVILIAN_VISIBLE_ADC_TYPES = new Set(['PERMANENT', 'TEMPORARY', 'NOTAM_LINKED'])

export class AdcFicService {
  constructor(private readonly prisma: PrismaClient = new PrismaClient()) {}

  async getActiveAdcForRole(role: string, entityCode?: string) {
    const isGovt = GOVT_ENTITY_ROLES.has(role)
    const now    = new Date()

    // DB returns ALL active records — filtering applied after
    const allRecords = await this.prisma.adcRecord.findMany({
      where: {
        isActive:      true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
      },
      orderBy: [{ afmluId: 'asc' }, { adcNumber: 'asc' }]
    })

    // Role-based filtering in service layer (P6A frozen rule)
    const filtered = isGovt
      ? allRecords
      : allRecords.filter(r => r.adcType && CIVILIAN_VISIBLE_ADC_TYPES.has(r.adcType))

    log.info('adc_query', { data: {
      role, total: allRecords.length, visible: filtered.length,
      exerciseFiltered: allRecords.length - filtered.length
    }})

    return filtered.map(r => ({
      id:            r.id,
      afmluId:       r.afmluId,
      adcNumber:     r.adcNumber,
      adcType:       r.adcType,
      areaGeoJson:   r.areaGeoJson ? JSON.parse(r.areaGeoJson) : null,
      verticalLimits: {
        lowerFt:  r.lowerFt,
        lowerRef: r.lowerRef,
        upperFt:  r.upperFt,
        upperRef: r.upperRef
      },
      effectiveFrom:     r.effectiveFrom?.toISOString() ?? null,
      effectiveTo:       r.effectiveTo?.toISOString() ?? null,
      activitySchedule:  r.activitySchedule,
      contactFrequency:  r.contactFrequency,
      // Remarks: filtered for civilians — operational detail only for govt users
      remarks:           isGovt ? r.remarks : null,
      pulledAtUtc:       r.pulledAtUtc.toISOString(),
    }))
  }

  async getAdcByAfmlu(afmluId: number, role: string) {
    if (afmluId < 1 || afmluId > 10) {
      throw new Error(`INVALID_AFMLU_ID: must be 1-10, got ${afmluId}`)
    }
    const isGovt   = GOVT_ENTITY_ROLES.has(role)
    const now      = new Date()
    const records  = await this.prisma.adcRecord.findMany({
      where: {
        afmluId,
        isActive:      true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
      }
    })
    return isGovt
      ? records
      : records.filter(r => r.adcType && CIVILIAN_VISIBLE_ADC_TYPES.has(r.adcType))
  }

  async getActiveFic(firCode?: string) {
    // FIC records are published documents — all authenticated users can see all FICs
    const now = new Date()
    return this.prisma.ficRecord.findMany({
      where: {
        isActive:      true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        ...(firCode ? { firCode } : {})
      },
      orderBy: { issuedAtUtc: 'desc' }
    })
  }

  async getFicByNumber(ficNumber: string) {
    return this.prisma.ficRecord.findUnique({ where: { ficNumber } })
  }
}
