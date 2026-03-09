// UIN validation fixture data for eGCA mock adapter.
// Realistic Indian UIN formats per DGCA UAS Rules 2021.

import type { UINValidationResult } from '../types'

export const UIN_FIXTURES: Record<string, UINValidationResult> = {
  'UA-SMALL-001-DEMO': {
    valid:            true,
    uin:              'UA-SMALL-001-DEMO',
    ownerName:        'Skyward Drone Solutions Pvt. Ltd.',
    manufacturerName: 'ideaForge Technology',
    modelName:        'Switch 1.0 UAV',
    weightCategory:   'SMALL',
    registrationDate: '15-01-2024',
    status:           'ACTIVE',
  },
  'UA-MICRO-002-DEMO': {
    valid:            true,
    uin:              'UA-MICRO-002-DEMO',
    ownerName:        'Agri-Drone Services India',
    manufacturerName: 'DJI',
    modelName:        'Agras T30',
    weightCategory:   'MICRO',
    registrationDate: '22-03-2024',
    status:           'ACTIVE',
  },
  'UA-MEDIUM-003-DEMO': {
    valid:            true,
    uin:              'UA-MEDIUM-003-DEMO',
    ownerName:        'National Remote Sensing Centre',
    manufacturerName: 'Asteria Aerospace',
    modelName:        'A200',
    weightCategory:   'MEDIUM',
    registrationDate: '01-06-2023',
    status:           'ACTIVE',
  },
  'UA-SUSPENDED-004': {
    valid:            true,
    uin:              'UA-SUSPENDED-004',
    ownerName:        'Deregistered Operator',
    manufacturerName: 'Unknown',
    modelName:        'Unknown',
    weightCategory:   'SMALL',
    registrationDate: '01-01-2023',
    status:           'SUSPENDED',
  },
}
