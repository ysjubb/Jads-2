// Flight permission fixture data for eGCA mock adapter.

import type { FlightPermission, PermissionStatus } from '../types'

export const PERMISSION_STATUS_FIXTURES: Record<string, PermissionStatus> = {
  'FP-DEMO-APPROVED-001': {
    status:               'APPROVED',
    permissionArtifactId: 'PA-2024-DEMO-001',
    remarks:              'Approved by DGCA regional office',
    updatedAt:            '2024-06-15T10:30:00Z',
  },
  'FP-DEMO-PENDING-002': {
    status:    'PENDING',
    remarks:   'Under review by DGCA',
    updatedAt: '2024-06-20T08:00:00Z',
  },
  'FP-DEMO-REJECTED-003': {
    status:    'REJECTED',
    remarks:   'Flight area overlaps restricted zone near Rashtrapati Bhavan',
    updatedAt: '2024-06-18T14:45:00Z',
  },
  'FP-DEMO-EXPIRED-004': {
    status:               'EXPIRED',
    permissionArtifactId: 'PA-2024-DEMO-EXPIRED',
    remarks:              'Permission period has elapsed',
    updatedAt:            '2024-01-01T00:00:00Z',
  },
}

export const FLIGHT_PERMISSION_FIXTURES: FlightPermission[] = [
  {
    applicationId:       'FP-DEMO-APPROVED-001',
    uinNumber:           'UA-SMALL-001-DEMO',
    pilotBusinessId:     'PBI-DEMO-001',
    flightPurpose:       'SURVEY',
    status:              'APPROVED',
    startDateTime:       '15-06-2024 09:00:00 IST',
    endDateTime:         '15-06-2024 17:00:00 IST',
    maxAltitudeInMeters: 120,
    typeOfOperation:     'VLOS',
    submittedAt:         '2024-06-10T08:00:00Z',
    updatedAt:           '2024-06-15T10:30:00Z',
  },
  {
    applicationId:       'FP-DEMO-PENDING-002',
    uinNumber:           'UA-MICRO-002-DEMO',
    pilotBusinessId:     'PBI-DEMO-002',
    flightPurpose:       'AGRICULTURAL',
    status:              'PENDING',
    startDateTime:       '25-06-2024 06:00:00 IST',
    endDateTime:         '25-06-2024 10:00:00 IST',
    maxAltitudeInMeters: 50,
    typeOfOperation:     'AGRICULTURAL',
    submittedAt:         '2024-06-20T08:00:00Z',
    updatedAt:           '2024-06-20T08:00:00Z',
  },
  {
    applicationId:       'FP-DEMO-REJECTED-003',
    uinNumber:           'UA-SMALL-001-DEMO',
    pilotBusinessId:     'PBI-DEMO-001',
    flightPurpose:       'PHOTOGRAPHY',
    status:              'REJECTED',
    startDateTime:       '20-06-2024 10:00:00 IST',
    endDateTime:         '20-06-2024 14:00:00 IST',
    maxAltitudeInMeters: 100,
    typeOfOperation:     'VLOS',
    submittedAt:         '2024-06-15T12:00:00Z',
    updatedAt:           '2024-06-18T14:45:00Z',
  },
]
