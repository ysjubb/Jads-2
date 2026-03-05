/**
 * FlightPlanListScreen
 *
 * Lists the pilot's filed flight plans with clearance status indicators.
 * Tapping a plan navigates to FlightPlanClearanceScreen for real-time
 * ADC/FIC tracking.
 *
 * HUD dark theme matching all JADS portals.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { T } from '../theme/theme'
import { fetchMyFlightPlans, type FlightPlanSummary } from '../api/flightPlanApi'

interface Props {
  onSelectPlan: (plan: FlightPlanSummary) => void
}

const STATUS_COLORS: Record<string, string> = {
  PENDING_CLEARANCE:  T.amber,
  ADC_ISSUED:         T.amber,
  FIC_ISSUED:         T.amber,
  FULLY_CLEARED:      T.primary,
  ACKNOWLEDGED:       T.primary,
  FILED:              T.text,
  CLEARANCE_REJECTED: T.red,
  CANCELLED:          T.muted,
}

export function FlightPlanListScreen({ onSelectPlan }: Props) {
  const [plans, setPlans]           = useState<FlightPlanSummary[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchMyFlightPlans()
      setPlans(data)
    } catch (err: any) {
      setError(err.message ?? 'Failed to load flight plans')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    load()
  }, [load])

  const renderItem = useCallback(({ item }: { item: FlightPlanSummary }) => {
    const statusColor = STATUS_COLORS[item.status] ?? T.text
    const hasAdc = !!item.adcNumber
    const hasFic = !!item.ficNumber

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => onSelectPlan(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <Text style={styles.aircraftId}>{item.aircraftId}</Text>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>

        <Text style={styles.route}>{item.adep} → {item.ades}</Text>
        <Text style={styles.eobt}>EOBT {item.eobt}Z</Text>

        <View style={styles.clearanceTags}>
          <View style={[styles.tag, hasAdc ? styles.tagActive : styles.tagPending]}>
            <Text style={[styles.tagText, { color: hasAdc ? T.primary : T.muted }]}>
              ADC {hasAdc ? item.adcNumber : '---'}
            </Text>
          </View>
          <View style={[styles.tag, hasFic ? styles.tagActive : styles.tagPending]}>
            <Text style={[styles.tagText, { color: hasFic ? T.primary : T.muted }]}>
              FIC {hasFic ? 'OK' : '---'}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {formatStatus(item.status)}
          </Text>
          <Text style={styles.filedAt}>
            Filed {formatDate(item.filedAt)}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }, [onSelectPlan])

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={T.primary} />
        <Text style={styles.loadingText}>Loading flight plans...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Flight Plans</Text>
        <Text style={styles.subtitle}>Tap a plan to view clearance status</Text>
      </View>
      <FlatList
        data={plans}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={T.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No flight plans filed</Text>
          </View>
        }
      />
    </View>
  )
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ')
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const dd = d.getUTCDate().toString().padStart(2, '0')
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]
    const hh = d.getUTCHours().toString().padStart(2, '0')
    const mm = d.getUTCMinutes().toString().padStart(2, '0')
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: T.text,
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: T.red,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: T.primary,
    borderRadius: 6,
  },
  retryText: {
    color: T.primary,
    fontWeight: '600',
  },
  emptyText: {
    color: T.muted,
    fontSize: 14,
    marginTop: 40,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: T.primary,
  },
  subtitle: {
    fontSize: 12,
    color: T.muted,
    marginTop: 4,
  },

  list: {
    padding: 16,
  },

  // Plan Card
  card: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aircraftId: {
    fontSize: 18,
    fontWeight: '700',
    color: T.primary,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  route: {
    fontSize: 15,
    color: T.textBright,
    marginTop: 6,
  },
  eobt: {
    fontSize: 12,
    color: T.muted,
    fontFamily: 'monospace',
    marginTop: 2,
  },

  // Clearance Tags
  clearanceTags: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  tagActive: {
    borderColor: T.primary + '40',
    backgroundColor: T.primary + '10',
  },
  tagPending: {
    borderColor: T.border,
    backgroundColor: 'transparent',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'monospace',
  },

  // Card Footer
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    fontFamily: 'monospace',
  },
  filedAt: {
    fontSize: 11,
    color: T.muted,
  },
})

export default FlightPlanListScreen
