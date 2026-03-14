import React from 'react'
import { T } from '../theme'
import { WeightBalance } from '../components/portal/WeightBalance'
import { FuelPlanning } from '../components/portal/FuelPlanning'

export function WeightBalancePage() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.3rem' }}>Weight, Balance & Fuel</h1>
      <p style={{ color: T.muted, fontSize: '0.65rem', marginBottom: '1rem' }}>
        Filing authority controls all W&B and fuel data. No admin override.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <WeightBalance />
        <FuelPlanning />
      </div>
    </div>
  )
}
