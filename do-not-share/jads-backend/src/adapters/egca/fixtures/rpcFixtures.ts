// RPC (Remote Pilot Certificate) fixture data for eGCA mock adapter.

import type { RPCValidationResult } from '../types'

export const RPC_FIXTURES: Record<string, RPCValidationResult> = {
  'RPC-DEMO-001': {
    valid:         true,
    rpcId:         'RPC-DEMO-001',
    pilotName:     'Rajesh Kumar',
    licenseClass:  'SMALL',
    validFrom:     '01-01-2024',
    validTo:       '31-12-2026',
    status:        'ACTIVE',
  },
  'RPC-DEMO-002': {
    valid:         true,
    rpcId:         'RPC-DEMO-002',
    pilotName:     'Priya Sharma',
    licenseClass:  'MEDIUM',
    validFrom:     '15-06-2023',
    validTo:       '14-06-2026',
    status:        'ACTIVE',
  },
  'RPC-EXPIRED-003': {
    valid:         true,
    rpcId:         'RPC-EXPIRED-003',
    pilotName:     'Amit Patel',
    licenseClass:  'MICRO',
    validFrom:     '01-01-2022',
    validTo:       '31-12-2023',
    status:        'EXPIRED',
  },
}
