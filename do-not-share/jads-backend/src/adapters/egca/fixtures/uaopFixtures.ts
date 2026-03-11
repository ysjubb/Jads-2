// UAOP (Unmanned Aircraft Operator Permit) fixture data for eGCA mock adapter.

import type { UAOPValidationResult } from '../types'

export const UAOP_FIXTURES: Record<string, UAOPValidationResult> = {
  'UAOP-COM-001-DEMO': {
    valid:         true,
    uaopNumber:    'UAOP-COM-001-DEMO',
    operatorName:  'Skyward Drone Solutions Pvt. Ltd.',
    permitType:    'COMMERCIAL',
    validFrom:     '01-04-2024',
    validTo:       '31-03-2026',
    status:        'ACTIVE',
  },
  'UAOP-RND-002-DEMO': {
    valid:         true,
    uaopNumber:    'UAOP-RND-002-DEMO',
    operatorName:  'IIT Delhi Autonomous Systems Lab',
    permitType:    'R_AND_D',
    validFrom:     '01-01-2024',
    validTo:       '31-12-2025',
    status:        'ACTIVE',
  },
  'UAOP-GOV-003-DEMO': {
    valid:         true,
    uaopNumber:    'UAOP-GOV-003-DEMO',
    operatorName:  'Survey of India',
    permitType:    'GOVERNMENT',
    validFrom:     '01-07-2023',
    validTo:       '30-06-2026',
    status:        'ACTIVE',
  },
}
