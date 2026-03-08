/**
 * JADS User App — Main Entry Point
 *
 * React Native app for pilots and drone operators.
 * Supports both Android and iOS from a single codebase.
 *
 * Navigation: simple state-based (no react-navigation dependency yet).
 * Screens: Login → Dashboard (FPL List / Drone Plans) → Detail / Edit
 */

import React, { useState, useCallback } from 'react'
import { View, StatusBar, StyleSheet, TouchableOpacity, Text } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { T } from './src/theme/theme'
import { LoginScreen } from './src/screens/LoginScreen'
import { FlightPlanListScreen } from './src/screens/FlightPlanListScreen'
import { FlightPlanClearanceScreen } from './src/screens/FlightPlanClearanceScreen'
import { DroneOperationPlanScreen } from './src/screens/DroneOperationPlanScreen'
import { EditFlightPlanScreen } from './src/screens/EditFlightPlanScreen'
import type { FlightPlanSummary } from './src/api/flightPlanApi'

type Screen =
  | { name: 'LOGIN' }
  | { name: 'FPL_LIST' }
  | { name: 'FPL_DETAIL'; plan: FlightPlanSummary }
  | { name: 'FPL_EDIT'; planId: string }
  | { name: 'DRONE_PLANS' }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'LOGIN' })
  const [tab, setTab]       = useState<'FPL' | 'DRONE'>('FPL')

  const handleLoginSuccess = () => setScreen({ name: 'FPL_LIST' })

  const handleLogout = useCallback(async () => {
    await AsyncStorage.removeItem('auth:jwt')
    setScreen({ name: 'LOGIN' })
  }, [])

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />

      {screen.name === 'LOGIN' && (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      )}

      {screen.name === 'FPL_LIST' && tab === 'FPL' && (
        <FlightPlanListScreen onSelectPlan={(plan) => setScreen({ name: 'FPL_DETAIL', plan })} />
      )}

      {screen.name === 'FPL_LIST' && tab === 'DRONE' && (
        <DroneOperationPlanScreen />
      )}

      {screen.name === 'FPL_DETAIL' && (
        <View style={{ flex: 1 }}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setScreen({ name: 'FPL_LIST' })}>
            <Text style={styles.backText}>&lt; Back to List</Text>
          </TouchableOpacity>
          <FlightPlanClearanceScreen plan={screen.plan} />
          {['FILED', 'ACKNOWLEDGED', 'PENDING_CLEARANCE'].includes(screen.plan.status) && (
            <TouchableOpacity style={styles.editBtn}
              onPress={() => setScreen({ name: 'FPL_EDIT', planId: screen.plan.id })}>
              <Text style={styles.editBtnText}>Edit Plan</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {screen.name === 'FPL_EDIT' && (
        <EditFlightPlanScreen
          planId={screen.planId}
          onSaved={() => setScreen({ name: 'FPL_LIST' })}
          onCancel={() => setScreen({ name: 'FPL_LIST' })}
        />
      )}

      {/* Bottom Tab Bar — shown on list screens */}
      {(screen.name === 'FPL_LIST') && (
        <View style={styles.tabBar}>
          <TouchableOpacity style={[styles.tab, tab === 'FPL' && styles.tabActive]}
            onPress={() => setTab('FPL')}>
            <Text style={[styles.tabText, tab === 'FPL' && styles.tabTextActive]}>Flight Plans</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'DRONE' && styles.tabActive]}
            onPress={() => setTab('DRONE')}>
            <Text style={[styles.tabText, tab === 'DRONE' && styles.tabTextActive]}>Drone Plans</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={handleLogout}>
            <Text style={[styles.tabText, { color: T.red }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  backBtn: { padding: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  backText: { color: T.muted, fontSize: 13 },
  editBtn: { padding: 14, backgroundColor: T.amber + '20', borderTopWidth: 1, borderTopColor: T.border, alignItems: 'center' },
  editBtnText: { color: T.amber, fontWeight: '700', fontSize: 14 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.surface },
  tab: { flex: 1, padding: 14, alignItems: 'center' },
  tabActive: { borderTopWidth: 2, borderTopColor: T.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: T.muted },
  tabTextActive: { color: T.primary },
})
