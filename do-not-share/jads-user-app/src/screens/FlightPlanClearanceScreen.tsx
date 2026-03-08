/**
 * FlightPlanClearanceScreen
 *
 * Shows real-time ADC (Air Defence Clearance) and FIC (Flight Information Centre)
 * clearance status for a filed flight plan.
 *
 * ADC = issued by Indian Air Force via AFMLU — defence clearance number
 * FIC = issued by AAI civil ATC — flight information clearance number
 * Both required before engine start / pushback.
 *
 * This screen connects to the backend SSE stream at:
 *   GET /api/flight-plans/:id/events
 *
 * Events received:
 *   adc_issued         → ADC number appears instantly
 *   fic_issued         → FIC number appears instantly
 *   clearance_rejected → Red rejection banner
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { T } from '../theme/theme'
import { RouteMapWebView } from '../components/RouteMapWebView'
import {
  fetchClearanceStatus,
  type ClearanceStatus,
  type ClearanceRef,
} from '../api/flightPlanApi'
import {
  useClearanceSSE,
  type ClearanceEvent,
} from '../hooks/useClearanceSSE'

interface Props {
  flightPlanId: string
  aircraftId:   string
  adep:         string
  ades:         string
  eobt:         string
}

type OverallStatus =
  | 'PENDING_CLEARANCE'
  | 'ADC_ISSUED'
  | 'FIC_ISSUED'
  | 'FULLY_CLEARED'
  | 'CLEARANCE_REJECTED'
  | 'ACKNOWLEDGED'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  PENDING_CLEARANCE:  { label: 'Awaiting Clearance',       color: T.amber,   icon: '...' },
  ADC_ISSUED:         { label: 'ADC Issued — Awaiting FIC', color: T.amber,   icon: 'ADC' },
  FIC_ISSUED:         { label: 'FIC Issued — Awaiting ADC', color: T.amber,   icon: 'FIC' },
  FULLY_CLEARED:      { label: 'Fully Cleared',             color: T.primary, icon: 'OK'  },
  ACKNOWLEDGED:       { label: 'Acknowledged by ATS',       color: T.primary, icon: 'ACK' },
  CLEARANCE_REJECTED: { label: 'Clearance Rejected',        color: T.red,     icon: 'REJ' },
}

export function FlightPlanClearanceScreen({
  flightPlanId,
  aircraftId,
  adep,
  ades,
  eobt,
}: Props) {
  const [status, setStatus]               = useState<OverallStatus>('PENDING_CLEARANCE')
  const [adcNumber, setAdcNumber]         = useState<string | null>(null)
  const [adcIssuedAt, setAdcIssuedAt]     = useState<string | null>(null)
  const [adcAfmluId, setAdcAfmluId]       = useState<number | null>(null)
  const [ficRefs, setFicRefs]             = useState<ClearanceRef[]>([])
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [loading, setLoading]             = useState(true)
  const [refreshing, setRefreshing]       = useState(false)

  // Load initial clearance state from REST endpoint
  const loadClearance = useCallback(async () => {
    try {
      const cs = await fetchClearanceStatus(flightPlanId)
      setStatus(cs.status as OverallStatus)
      if (cs.adcRefs.length > 0) {
        const latest = cs.adcRefs[cs.adcRefs.length - 1]
        setAdcNumber(latest.adcNumber ?? null)
        setAdcIssuedAt(latest.issuedAt)
        setAdcAfmluId(latest.afmluId ?? null)
      }
      if (cs.ficRefs.length > 0) {
        setFicRefs(cs.ficRefs)
      }
    } catch {
      // Will retry via SSE or pull-to-refresh
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [flightPlanId])

  useEffect(() => { loadClearance() }, [loadClearance])

  // Handle SSE events — updates appear instantly
  const handleSSEEvent = useCallback((event: ClearanceEvent) => {
    switch (event.type) {
      case 'adc_issued':
        setAdcNumber(event.data.adcNumber)
        setAdcIssuedAt(event.data.issuedAt)
        setAdcAfmluId(event.data.afmluId)
        setStatus(event.data.status as OverallStatus)
        break
      case 'fic_issued':
        setFicRefs(event.data.allFicRefs ?? [])
        setStatus(event.data.status as OverallStatus)
        break
      case 'clearance_rejected':
        setRejectionReason(event.data.reason)
        setStatus('CLEARANCE_REJECTED')
        break
    }
  }, [])

  const { connected } = useClearanceSSE({
    flightPlanId,
    onEvent: handleSSEEvent,
  })

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadClearance()
  }, [loadClearance])

  const statusInfo = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING_CLEARANCE

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={T.primary} />
        <Text style={styles.loadingText}>Loading clearance status...</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={T.primary}
        />
      }
    >
      {/* Flight Header */}
      <View style={styles.header}>
        <Text style={styles.aircraftId}>{aircraftId}</Text>
        <Text style={styles.route}>{adep} → {ades}</Text>
        <Text style={styles.eobt}>EOBT {eobt}Z</Text>
      </View>

      {/* Overall Status Banner */}
      <View style={[styles.statusBanner, { borderColor: statusInfo.color }]}>
        <Text style={[styles.statusIcon, { color: statusInfo.color }]}>
          {statusInfo.icon}
        </Text>
        <Text style={[styles.statusLabel, { color: statusInfo.color }]}>
          {statusInfo.label}
        </Text>
        {connected && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      {/* Route Map */}
      <RouteMapWebView
        flightPlanId={flightPlanId}
        adep={adep}
        ades={ades}
        height={220}
      />

      {/* Rejection Banner */}
      {status === 'CLEARANCE_REJECTED' && rejectionReason && (
        <View style={styles.rejectionBanner}>
          <Text style={styles.rejectionTitle}>CLEARANCE REJECTED</Text>
          <Text style={styles.rejectionReason}>{rejectionReason}</Text>
        </View>
      )}

      {/* ADC Card — Air Defence Clearance (IAF / AFMLU) */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>ADC — Air Defence Clearance</Text>
          <Text style={styles.cardSubtitle}>Issued by IAF via AFMLU</Text>
        </View>
        <View style={styles.cardBody}>
          {adcNumber ? (
            <>
              <Text style={styles.clearanceNumber}>{adcNumber}</Text>
              {adcAfmluId && (
                <Text style={styles.clearanceDetail}>AFMLU {adcAfmluId}</Text>
              )}
              {adcIssuedAt && (
                <Text style={styles.clearanceDetail}>
                  Issued: {formatTimestamp(adcIssuedAt)}
                </Text>
              )}
              <View style={[styles.badge, { backgroundColor: T.primary + '20' }]}>
                <Text style={[styles.badgeText, { color: T.primary }]}>RECEIVED</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.pendingText}>Awaiting ADC from AFMLU</Text>
              <View style={styles.pulseContainer}>
                <ActivityIndicator size="small" color={T.amber} />
                <Text style={styles.pulseText}>
                  IAF reviews flight plan at AFMLU office
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* FIC Card — Flight Information Centre (AAI) */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>FIC — Flight Information Centre</Text>
          <Text style={styles.cardSubtitle}>Issued by AAI (Civil ATC)</Text>
        </View>
        <View style={styles.cardBody}>
          {ficRefs.length > 0 ? (
            ficRefs.map((ref, i) => (
              <View key={ref.ficNumber ?? i} style={styles.ficEntry}>
                <Text style={styles.clearanceNumber}>{ref.ficNumber}</Text>
                {ref.firCode && (
                  <Text style={styles.clearanceDetail}>FIR: {ref.firCode}</Text>
                )}
                {ref.subject && (
                  <Text style={styles.clearanceDetail}>{ref.subject}</Text>
                )}
                <Text style={styles.clearanceDetail}>
                  Issued: {formatTimestamp(ref.issuedAt)}
                </Text>
                <View style={[styles.badge, { backgroundColor: T.primary + '20' }]}>
                  <Text style={[styles.badgeText, { color: T.primary }]}>RECEIVED</Text>
                </View>
              </View>
            ))
          ) : (
            <>
              <Text style={styles.pendingText}>Awaiting FIC from ATC</Text>
              <View style={styles.pulseContainer}>
                <ActivityIndicator size="small" color={T.amber} />
                <Text style={styles.pulseText}>
                  Civil ATC reviews and authenticates flight plan
                </Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Clearance Process Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Clearance Process</Text>
        <View style={styles.step}>
          <Text style={[styles.stepNum, ficRefs.length > 0 ? styles.stepDone : styles.stepActive]}>1</Text>
          <Text style={styles.stepText}>FIC from civil ATC (AAI)</Text>
        </View>
        <View style={styles.step}>
          <Text style={[styles.stepNum, adcNumber ? styles.stepDone : (ficRefs.length > 0 ? styles.stepActive : styles.stepPending)]}>2</Text>
          <Text style={styles.stepText}>ADC from IAF (AFMLU)</Text>
        </View>
        <View style={styles.step}>
          <Text style={[styles.stepNum, status === 'FULLY_CLEARED' || status === 'ACKNOWLEDGED' ? styles.stepDone : styles.stepPending]}>3</Text>
          <Text style={styles.stepText}>Both reconfirmed — engine start approved</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Ref: {flightPlanId.slice(0, 8).toUpperCase()}
        </Text>
        <Text style={styles.footerText}>
          {connected ? 'Connected — updates appear instantly' : 'Reconnecting...'}
        </Text>
      </View>
    </ScrollView>
  )
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    const hh = d.getUTCHours().toString().padStart(2, '0')
    const mm = d.getUTCMinutes().toString().padStart(2, '0')
    const dd = d.getUTCDate().toString().padStart(2, '0')
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]
    return `${dd} ${mon} ${hh}:${mm}Z`
  } catch {
    return iso
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: T.text,
    marginTop: 12,
    fontSize: 14,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  aircraftId: {
    fontSize: 28,
    fontWeight: '700',
    color: T.primary,
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  route: {
    fontSize: 18,
    color: T.textBright,
    marginTop: 4,
  },
  eobt: {
    fontSize: 14,
    color: T.muted,
    marginTop: 2,
    fontFamily: 'monospace',
  },

  // Status Banner
  statusBanner: {
    margin: 16,
    padding: 16,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: T.surface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginRight: 12,
    width: 32,
    textAlign: 'center',
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: T.primary,
    marginRight: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: T.primary,
    fontFamily: 'monospace',
  },

  // Rejection Banner
  rejectionBanner: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: T.red + '15',
    borderWidth: 1,
    borderColor: T.red,
    borderRadius: 8,
  },
  rejectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: T.red,
    marginBottom: 4,
  },
  rejectionReason: {
    fontSize: 13,
    color: T.textBright,
    lineHeight: 18,
  },

  // Cards
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    backgroundColor: T.surface,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textBright,
  },
  cardSubtitle: {
    fontSize: 11,
    color: T.muted,
    marginTop: 2,
  },
  cardBody: {
    padding: 16,
  },
  clearanceNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: T.primary,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  clearanceDetail: {
    fontSize: 12,
    color: T.text,
    marginTop: 4,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginTop: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  ficEntry: {
    marginBottom: 12,
  },
  pendingText: {
    fontSize: 14,
    color: T.amber,
    fontWeight: '600',
  },
  pulseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  pulseText: {
    fontSize: 12,
    color: T.muted,
    marginLeft: 8,
  },

  // Info card (clearance process)
  infoCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    backgroundColor: T.surface,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textBright,
    marginBottom: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 10,
    overflow: 'hidden',
  },
  stepDone: {
    backgroundColor: T.primary + '30',
    color: T.primary,
  },
  stepActive: {
    backgroundColor: T.amber + '30',
    color: T.amber,
  },
  stepPending: {
    backgroundColor: T.border,
    color: T.muted,
  },
  stepText: {
    fontSize: 13,
    color: T.text,
  },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: T.muted,
    marginBottom: 4,
  },
})

export default FlightPlanClearanceScreen
