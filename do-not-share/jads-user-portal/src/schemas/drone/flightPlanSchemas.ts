import { z } from 'zod'

// ── Flight Category Enum ────────────────────────────────────────────────────

export const FlightCategory = {
  NANO_RECREATIONAL:       'NANO_RECREATIONAL',
  MICRO_RECREATIONAL:      'MICRO_RECREATIONAL',
  MICRO_COMMERCIAL:        'MICRO_COMMERCIAL',
  SMALL_VLOS:              'SMALL_VLOS',
  AGRICULTURAL:            'AGRICULTURAL',
  COMMERCIAL_SURVEY:       'COMMERCIAL_SURVEY',
  PHOTOGRAPHY:             'PHOTOGRAPHY',
  BVLOS:                   'BVLOS',
  NIGHT_OPS:               'NIGHT_OPS',
  SPECIAL:                 'SPECIAL',
} as const

export type FlightCategoryType = typeof FlightCategory[keyof typeof FlightCategory]

// ── Category Metadata ───────────────────────────────────────────────────────

export interface CategoryMeta {
  label: string
  description: string
  estimatedMinutes: number
  requiresEgca: boolean
  stepCount: number
  fieldGroups: string[]
}

export const CATEGORY_META: Record<FlightCategoryType, CategoryMeta> = {
  NANO_RECREATIONAL: {
    label: 'Nano Recreational',
    description: 'Drones under 250g, non-commercial use',
    estimatedMinutes: 0.5,
    requiresEgca: false,
    stepCount: 1,
    fieldGroups: ['basic'],
  },
  MICRO_RECREATIONAL: {
    label: 'Micro Recreational',
    description: '250g-2kg, non-commercial use',
    estimatedMinutes: 2,
    requiresEgca: true,
    stepCount: 2,
    fieldGroups: ['basic', 'location', 'zoneCheck'],
  },
  MICRO_COMMERCIAL: {
    label: 'Micro Commercial',
    description: '250g-2kg, commercial operations (VLOS)',
    estimatedMinutes: 5,
    requiresEgca: true,
    stepCount: 4,
    fieldGroups: ['basic', 'operator', 'location', 'zoneCheck', 'mission'],
  },
  SMALL_VLOS: {
    label: 'Small VLOS',
    description: '2-25kg, visual line of sight operations',
    estimatedMinutes: 5,
    requiresEgca: true,
    stepCount: 4,
    fieldGroups: ['basic', 'operator', 'location', 'zoneCheck', 'mission'],
  },
  AGRICULTURAL: {
    label: 'Agricultural',
    description: 'Agricultural spraying and survey operations',
    estimatedMinutes: 7,
    requiresEgca: true,
    stepCount: 5,
    fieldGroups: ['basic', 'operator', 'location', 'zoneCheck', 'mission', 'agriculture'],
  },
  COMMERCIAL_SURVEY: {
    label: 'Commercial Survey',
    description: 'Aerial survey, mapping, and data collection',
    estimatedMinutes: 7,
    requiresEgca: true,
    stepCount: 5,
    fieldGroups: ['basic', 'operator', 'location', 'zoneCheck', 'mission', 'survey'],
  },
  PHOTOGRAPHY: {
    label: 'Photography / Videography',
    description: 'Aerial photography, videography, and media',
    estimatedMinutes: 7,
    requiresEgca: true,
    stepCount: 5,
    fieldGroups: ['basic', 'operator', 'location', 'zoneCheck', 'mission', 'survey'],
  },
  BVLOS: {
    label: 'BVLOS Operations',
    description: 'Beyond Visual Line of Sight -- requires Rule 70 exemption',
    estimatedMinutes: 15,
    requiresEgca: true,
    stepCount: 6,
    fieldGroups: ['basic', 'operator', 'location', 'zoneCheck', 'mission', 'agriculture', 'survey', 'special'],
  },
  NIGHT_OPS: {
    label: 'Night Operations',
    description: 'Night-time drone operations -- requires Rule 70 exemption',
    estimatedMinutes: 15,
    requiresEgca: true,
    stepCount: 6,
    fieldGroups: ['basic', 'operator', 'location', 'zoneCheck', 'mission', 'agriculture', 'survey', 'special'],
  },
  SPECIAL: {
    label: 'Special Operations',
    description: 'Full wizard -- all fields, Rule 70 exemption required',
    estimatedMinutes: 15,
    requiresEgca: true,
    stepCount: 6,
    fieldGroups: ['basic', 'operator', 'location', 'zoneCheck', 'mission', 'agriculture', 'survey', 'special'],
  },
}

// ── Shared Field Validators ─────────────────────────────────────────────────

const uinPattern = /^UA-\d{4}-\d{5}$/
const uaopPattern = /^UAOP-\d{6,}$/
const rpcPattern = /^RPC-[A-Z]{2,4}-\d{6,}$/

// ── Schema: Basic (NANO_RECREATIONAL) ───────────────────────────────────────

export const nanoRecreationalSchema = z.object({
  droneDescription: z.string()
    .min(3, 'Describe your drone (e.g. "DJI Mini 3")')
    .max(200, 'Description too long'),
  locationLat: z.number()
    .min(6.5, 'Latitude must be within India (6.5-35.7)')
    .max(35.7, 'Latitude must be within India (6.5-35.7)'),
  locationLon: z.number()
    .min(68.0, 'Longitude must be within India (68.0-97.4)')
    .max(97.4, 'Longitude must be within India (68.0-97.4)'),
  plannedTime: z.string().min(1, 'Select a planned time'),
})

export type NanoRecreationalData = z.infer<typeof nanoRecreationalSchema>

// ── Schema: Micro Recreational ──────────────────────────────────────────────

export const microRecreationalSchema = z.object({
  uin: z.string().regex(uinPattern, 'UIN format: UA-YYYY-NNNNN'),
  locationGeoJson: z.string().min(1, 'Draw an operation area on the map'),
  plannedStartUtc: z.string().min(1, 'Select start time'),
  plannedEndUtc: z.string().min(1, 'Select end time'),
  purpose: z.string().min(1, 'Select a purpose'),
})

export type MicroRecreationalData = z.infer<typeof microRecreationalSchema>

// ── Schema: Operator Details (shared by commercial+ categories) ─────────

export const operatorDetailsSchema = z.object({
  uin: z.string().regex(uinPattern, 'UIN format: UA-YYYY-NNNNN'),
  uaop: z.string().regex(uaopPattern, 'UAOP format: UAOP-NNNNNN'),
  rpcId: z.string().regex(rpcPattern, 'RPC format: RPC-XX-NNNNNN'),
  operatorName: z.string().min(2, 'Enter operator name'),
  operatorContact: z.string().min(10, 'Enter valid contact number'),
  operatorEmail: z.string().email('Enter valid email address'),
})

export type OperatorDetailsData = z.infer<typeof operatorDetailsSchema>

// ── Schema: Mission Details (shared by commercial+ categories) ──────────

export const missionDetailsSchema = z.object({
  locationGeoJson: z.string().min(1, 'Draw an operation area on the map'),
  plannedStartUtc: z.string().min(1, 'Select start time'),
  plannedEndUtc: z.string().min(1, 'Select end time'),
  purpose: z.string().min(1, 'Select a purpose'),
  maxAltitudeAglM: z.number().min(1, 'Altitude must be at least 1m').max(500, 'Max altitude 500m AGL'),
  payloadDescription: z.string().min(1, 'Describe payload'),
  payloadWeightKg: z.number().min(0, 'Weight must be positive').max(150, 'Max payload 150kg'),
  insurancePolicyNumber: z.string().min(1, 'Insurance policy number required'),
  insuranceExpiry: z.string().min(1, 'Insurance expiry date required'),
})

export type MissionDetailsData = z.infer<typeof missionDetailsSchema>

// ── Schema: Agricultural Operations ─────────────────────────────────────────

/** CIB&RC pesticide codes -- common entries */
export const CIBRC_PESTICIDE_CODES = [
  { code: 'CIB-IM-001',  label: 'Imidacloprid 17.8% SL' },
  { code: 'CIB-FI-002',  label: 'Fipronil 5% SC' },
  { code: 'CIB-CL-003',  label: 'Chlorpyriphos 20% EC' },
  { code: 'CIB-AC-004',  label: 'Acetamiprid 20% SP' },
  { code: 'CIB-TH-005',  label: 'Thiamethoxam 25% WG' },
  { code: 'CIB-LA-006',  label: 'Lambda Cyhalothrin 5% EC' },
  { code: 'CIB-GL-007',  label: 'Glyphosate 41% SL' },
  { code: 'CIB-PR-008',  label: 'Propiconazole 25% EC' },
  { code: 'CIB-MA-009',  label: 'Mancozeb 75% WP' },
  { code: 'CIB-HX-010',  label: 'Hexaconazole 5% EC' },
  { code: 'CIB-NA-000',  label: 'Not Applicable (non-spray operation)' },
] as const

export const CROP_TYPES = [
  'Rice', 'Wheat', 'Cotton', 'Sugarcane', 'Maize', 'Soybean',
  'Groundnut', 'Mustard', 'Tea', 'Coffee', 'Jute', 'Millet',
  'Pulses', 'Vegetables', 'Fruits', 'Other',
] as const

export const agricultureSchema = z.object({
  pesticideCode: z.string().min(1, 'Select a CIB&RC pesticide code'),
  cropType: z.string().min(1, 'Select crop type'),
  fieldAreaHectares: z.number().min(0.01, 'Field area must be at least 0.01 hectares').max(500, 'Max 500 hectares'),
  sprayVolumeLitresPerHa: z.number().min(1, 'Spray volume must be at least 1 L/ha').max(100, 'Max 100 L/ha'),
  sopFileAttached: z.boolean().refine(v => v === true, {
    message: 'SOP document upload is required for agricultural operations',
  }),
})

export type AgricultureData = z.infer<typeof agricultureSchema>

// ── Schema: Survey / Photography Operations ─────────────────────────────────

export const SENSOR_TYPES = [
  'RGB Camera',
  'Multispectral Camera',
  'Hyperspectral Sensor',
  'LiDAR',
  'Thermal Camera',
  'SAR (Synthetic Aperture Radar)',
  'Video Camera (4K+)',
  'Gimbal Stabilized Camera',
  'Other',
] as const

export const DATA_USAGE_TYPES = [
  'Internal Use Only',
  'Client Deliverable',
  'Government/Public Sector',
  'Published / Media Release',
  'Academic / Research',
  'Other',
] as const

export const surveySchema = z.object({
  cameraSensorType: z.string().min(1, 'Select camera/sensor type'),
  dataUsageDeclaration: z.string().min(1, 'Declare intended data usage'),
  privacyImpactAcknowledged: z.boolean().refine(v => v === true, {
    message: 'You must acknowledge the privacy impact assessment',
  }),
})

export type SurveyData = z.infer<typeof surveySchema>

// ── Schema: Special / BVLOS / Night Operations ──────────────────────────────

export const specialSchema = z.object({
  rule70ExemptionRef: z.string().min(1, 'Rule 70 exemption reference number is required'),
  rule70FileAttached: z.boolean().refine(v => v === true, {
    message: 'Rule 70 exemption document upload is required',
  }),
  additionalSafetyMeasures: z.string()
    .min(20, 'Describe additional safety measures (min 20 characters)')
    .max(2000, 'Description too long'),
})

export type SpecialData = z.infer<typeof specialSchema>

// ── Combined Schema Builder ─────────────────────────────────────────────────

/**
 * Returns the composite Zod schema for a given flight category.
 * Only includes fields relevant to the selected category.
 */
export function buildSchemaForCategory(category: FlightCategoryType) {
  switch (category) {
    case 'NANO_RECREATIONAL':
      return nanoRecreationalSchema

    case 'MICRO_RECREATIONAL':
      return microRecreationalSchema

    case 'MICRO_COMMERCIAL':
    case 'SMALL_VLOS':
      return operatorDetailsSchema.merge(missionDetailsSchema)

    case 'AGRICULTURAL':
      return operatorDetailsSchema.merge(missionDetailsSchema).merge(agricultureSchema)

    case 'COMMERCIAL_SURVEY':
    case 'PHOTOGRAPHY':
      return operatorDetailsSchema.merge(missionDetailsSchema).merge(surveySchema)

    case 'BVLOS':
    case 'NIGHT_OPS':
    case 'SPECIAL':
      return operatorDetailsSchema
        .merge(missionDetailsSchema)
        .merge(agricultureSchema.partial())
        .merge(surveySchema.partial())
        .merge(specialSchema)

    default:
      return nanoRecreationalSchema
  }
}

// ── Category Detection ──────────────────────────────────────────────────────

export interface UserProfile {
  weightCategory?: 'NANO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE'
  isCommercial?: boolean
  operationType?: string
  hasUAOP?: boolean
}

/**
 * Detects the flight category from user profile and drone registration data.
 * This drives which fields are shown in the adaptive form.
 */
export function detectCategory(profile: UserProfile): FlightCategoryType {
  const weight = profile.weightCategory || 'NANO'
  const commercial = profile.isCommercial ?? false
  const opType = (profile.operationType || '').toUpperCase()

  // Special operation types take precedence
  if (opType === 'BVLOS')       return FlightCategory.BVLOS
  if (opType === 'NIGHT')       return FlightCategory.NIGHT_OPS
  if (opType === 'SPECIAL')     return FlightCategory.SPECIAL

  // Nano -- always recreational
  if (weight === 'NANO' && !commercial) return FlightCategory.NANO_RECREATIONAL

  // Micro
  if (weight === 'MICRO') {
    if (!commercial) return FlightCategory.MICRO_RECREATIONAL
    return FlightCategory.MICRO_COMMERCIAL
  }

  // Small+ weight categories
  if (opType === 'AGRICULTURAL' || opType === 'AGRICULTURE') return FlightCategory.AGRICULTURAL
  if (opType === 'SURVEY' || opType === 'MAPPING')           return FlightCategory.COMMERCIAL_SURVEY
  if (opType === 'PHOTOGRAPHY' || opType === 'VIDEOGRAPHY')  return FlightCategory.PHOTOGRAPHY

  // Default for small+ commercial
  if (weight === 'SMALL' || weight === 'MEDIUM' || weight === 'LARGE') {
    return commercial ? FlightCategory.SMALL_VLOS : FlightCategory.MICRO_RECREATIONAL
  }

  return FlightCategory.NANO_RECREATIONAL
}

// ── Purpose Options ─────────────────────────────────────────────────────────

export const PURPOSE_OPTIONS = [
  { value: 'RECREATIONAL',   label: 'Recreational / Hobby' },
  { value: 'SURVEY',         label: 'Survey / Mapping' },
  { value: 'PHOTOGRAPHY',    label: 'Photography / Videography' },
  { value: 'INSPECTION',     label: 'Infrastructure Inspection' },
  { value: 'DELIVERY',       label: 'Delivery' },
  { value: 'AGRICULTURE',    label: 'Agriculture' },
  { value: 'TRAINING',       label: 'Training' },
  { value: 'EMERGENCY',      label: 'Emergency / Medical' },
  { value: 'OTHER',          label: 'Other' },
] as const
