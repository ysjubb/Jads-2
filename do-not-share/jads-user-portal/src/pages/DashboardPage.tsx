import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { userApi } from '../api/client'
import { T } from '../theme'
import { AirspaceMap } from '../components/portal/AirspaceMap'
import { useAuth } from '../hooks/useAuth'

interface FlightPlan {
  id: string; flightPlanId: string | null; aircraftId: string
  adep: string; ades: string; eobt: string; status: string; filedAt: string | null
}

interface DronePlan {
  id: string; planId: string; droneSerialNumber: string; areaType: string
  purpose: string; status: string; plannedStartUtc: string; plannedEndUtc: string
}

const FPL_STATUS_COLOR: Record<string, string> = {
  DRAFT: T.muted, FILED: T.amber, ACKNOWLEDGED: T.amber, PENDING_CLEARANCE: T.amber,
  ADC_ISSUED: '#40A0FF', FIC_ISSUED: '#40A0FF', FULLY_CLEARED: T.primary,
  CANCELLED: '#888', CLEARANCE_REJECTED: T.red, ARRIVED: T.primary,
}

const DOP_STATUS_COLOR: Record<string, string> = {
  DRAFT: T.muted, SUBMITTED: T.amber, APPROVED: T.primary, REJECTED: T.red, CANCELLED: '#888',
}

export function DashboardPage() {
  const { credentialDomain, role } = useAuth()
  const [fplans, setFplans] = useState<FlightPlan[]>([])
  const [dplans, setDplans] = useState<DronePlan[]>([])
  const [loading, setLoading] = useState(true)

  const isAircraft = credentialDomain === 'AIRCRAFT' || role === 'PLATFORM_SUPER_ADMIN'
  const isDrone    = credentialDomain === 'DRONE'    || role === 'PLATFORM_SUPER_ADMIN'

  useEffect(() => {
    (async () => {
      try {
        const promises: Promise<any>[] = []
        if (isAircraft) promises.push(userApi().get('/flight-plans'))
        else promises.push(Promise.reject('skip'))
        if (isDrone) promises.push(userApi().get('/drone-plans'))
        else promises.push(Promise.reject('skip'))

        const [fRes, dRes] = await Promise.allSettled(promises)
        if (fRes.status === 'fulfilled') setFplans(fRes.value.data.plans ?? [])
        if (dRes.status === 'fulfilled') setDplans(dRes.value.data.plans ?? [])
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [isAircraft, isDrone])

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '--'

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ color: T.primary, fontSize: '1.1rem', marginBottom: '0.4rem' }}>Dashboard</h1>
      <p style={{ color: T.muted, fontSize: '0.7rem', marginBottom: '1.5rem' }}>
        Your flight plans and drone operation plans
      </p>

      {/* Quick action buttons — domain-filtered */}
      <div style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.5rem' }}>
        {isAircraft && (
          <Link to="/file-flight-plan" style={{
            padding: '0.6rem 1.2rem', background: T.primary + '15', border: `1px solid ${T.primary}40`,
            borderRadius: '4px', color: T.primary, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600,
          }}>+ File Flight Plan</Link>
        )}
        {isDrone && (
          <Link to="/file-drone-plan" style={{
            padding: '0.6rem 1.2rem', background: T.amber + '15', border: `1px solid ${T.amber}40`,
            borderRadius: '4px', color: T.amber, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600,
          }}>+ File Drone Plan</Link>
        )}
      </div>

      {/* Airspace Map — India Overview */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ color: T.textBright, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Airspace Overview
        </h2>
        <AirspaceMap height="350px" />
      </div>

      {loading ? <p style={{ color: T.muted }}>Loading...</p> : (
        <>
          {/* Flight Plans Table — AIRCRAFT domain only */}
          {isAircraft && <>
          <h2 style={{ color: T.textBright, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Flight Plans ({fplans.length})
          </h2>
          {fplans.length === 0 ? (
            <p style={{ color: T.muted, fontSize: '0.75rem', marginBottom: '1.5rem' }}>No flight plans filed yet.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                    <th style={{ padding: '0.4rem' }}>ID</th>
                    <th style={{ padding: '0.4rem' }}>Aircraft</th>
                    <th style={{ padding: '0.4rem' }}>Route</th>
                    <th style={{ padding: '0.4rem' }}>EOBT</th>
                    <th style={{ padding: '0.4rem' }}>Status</th>
                    <th style={{ padding: '0.4rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fplans.map(fp => (
                    <tr key={fp.id} style={{ borderBottom: `1px solid ${T.border}08` }}>
                      <td style={{ padding: '0.4rem', color: T.primary }}>{fp.flightPlanId ?? fp.id.slice(0,8)}</td>
                      <td style={{ padding: '0.4rem' }}>{fp.aircraftId}</td>
                      <td style={{ padding: '0.4rem' }}>{fp.adep} → {fp.ades}</td>
                      <td style={{ padding: '0.4rem', fontSize: '0.65rem' }}>{fmtDate(fp.eobt)}</td>
                      <td style={{ padding: '0.4rem' }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: '3px', fontSize: '0.6rem', fontWeight: 700,
                          color: '#fff', background: FPL_STATUS_COLOR[fp.status] ?? T.muted,
                        }}>{fp.status}</span>
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <Link to={`/flight-plan/${fp.id}`} style={{ color: T.primary, fontSize: '0.65rem' }}>View</Link>
                        {['FILED', 'ACKNOWLEDGED', 'PENDING_CLEARANCE'].includes(fp.status) && (
                          <> | <Link to={`/edit-flight-plan/${fp.id}`} style={{ color: T.amber, fontSize: '0.65rem' }}>Edit</Link></>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </>}

          {/* Drone Plans Table — DRONE domain only */}
          {isDrone && <>
          <h2 style={{ color: T.textBright, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Drone Operation Plans ({dplans.length})
          </h2>
          {dplans.length === 0 ? (
            <p style={{ color: T.muted, fontSize: '0.75rem' }}>No drone operation plans filed yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                    <th style={{ padding: '0.4rem' }}>Plan ID</th>
                    <th style={{ padding: '0.4rem' }}>Drone S/N</th>
                    <th style={{ padding: '0.4rem' }}>Area</th>
                    <th style={{ padding: '0.4rem' }}>Purpose</th>
                    <th style={{ padding: '0.4rem' }}>Window</th>
                    <th style={{ padding: '0.4rem' }}>Status</th>
                    <th style={{ padding: '0.4rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dplans.map(dp => (
                    <tr key={dp.id} style={{ borderBottom: `1px solid ${T.border}08` }}>
                      <td style={{ padding: '0.4rem', color: T.amber }}>{dp.planId}</td>
                      <td style={{ padding: '0.4rem' }}>{dp.droneSerialNumber}</td>
                      <td style={{ padding: '0.4rem' }}>{dp.areaType === 'CIRCLE' ? '⊙ Circle' : '▢ Polygon'}</td>
                      <td style={{ padding: '0.4rem' }}>{dp.purpose}</td>
                      <td style={{ padding: '0.4rem', fontSize: '0.6rem' }}>{fmtDate(dp.plannedStartUtc)}</td>
                      <td style={{ padding: '0.4rem' }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: '3px', fontSize: '0.6rem', fontWeight: 700,
                          color: '#fff', background: DOP_STATUS_COLOR[dp.status] ?? T.muted,
                        }}>{dp.status}</span>
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <Link to={`/drone-plan/${dp.id}`} style={{ color: T.amber, fontSize: '0.65rem' }}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </>}
        </>
      )}
    </div>
  )
}
