/**
 * DroneOperationPlanScreen
 *
 * Lists the user's drone operation plans and allows filing new ones.
 * Area selection uses a WebView-based Leaflet map for touch-based
 * polygon/circle drawing (AreaPickerWebView component).
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, ScrollView, Alert,
} from 'react-native'
import { T } from '../theme/theme'
import {
  fetchMyDronePlans, createDronePlan, submitDronePlan,
  type DroneOperationPlan,
} from '../api/droneOperationPlanApi'

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     T.muted,
  SUBMITTED: T.amber,
  APPROVED:  T.primary,
  REJECTED:  T.red,
  CANCELLED: '#888',
}

export function DroneOperationPlanScreen() {
  const [plans, setPlans]           = useState<DroneOperationPlan[]>([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)

  // Form state
  const [form, setForm] = useState({
    droneSerialNumber: '',
    uinNumber: '',
    areaType: 'CIRCLE' as 'CIRCLE' | 'POLYGON',
    centerLatDeg: '',
    centerLonDeg: '',
    radiusM: '500',
    maxAltitudeAglM: '120',
    minAltitudeAglM: '0',
    plannedStartUtc: '',
    plannedEndUtc: '',
    purpose: 'SURVEY',
    remarks: '',
    notifyEmail: '',
    notifyMobile: '',
  })

  const load = useCallback(async () => {
    try {
      const data = await fetchMyDronePlans()
      setPlans(data)
    } catch { /* ignore */ }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const onRefresh = () => { setRefreshing(true); load() }

  const handleCreate = async () => {
    if (!form.droneSerialNumber || !form.plannedStartUtc || !form.plannedEndUtc) {
      Alert.alert('Missing Fields', 'Please fill all required fields.')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        droneSerialNumber: form.droneSerialNumber,
        uinNumber: form.uinNumber || undefined,
        areaType: form.areaType,
        maxAltitudeAglM: parseFloat(form.maxAltitudeAglM),
        minAltitudeAglM: parseFloat(form.minAltitudeAglM),
        plannedStartUtc: new Date(form.plannedStartUtc).toISOString(),
        plannedEndUtc: new Date(form.plannedEndUtc).toISOString(),
        purpose: form.purpose,
        remarks: form.remarks || undefined,
        notifyEmail: form.notifyEmail || undefined,
        notifyMobile: form.notifyMobile || undefined,
      }

      if (form.areaType === 'CIRCLE') {
        payload.centerLatDeg = parseFloat(form.centerLatDeg)
        payload.centerLonDeg = parseFloat(form.centerLonDeg)
        payload.radiusM = parseFloat(form.radiusM)
      }

      await createDronePlan(payload)
      setShowForm(false)
      load()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to create plan')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (planId: string) => {
    try {
      await submitDronePlan(planId)
      load()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Submit failed')
    }
  }

  const renderItem = ({ item }: { item: DroneOperationPlan }) => {
    const color = STATUS_COLORS[item.status] ?? T.text
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.planId}>{item.planId}</Text>
          <View style={[styles.statusBadge, { backgroundColor: color }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.detail}>Drone: {item.droneSerialNumber}</Text>
        <Text style={styles.detail}>Area: {item.areaType} | {item.minAltitudeAglM}-{item.maxAltitudeAglM}m AGL</Text>
        <Text style={styles.detail}>Purpose: {item.purpose}</Text>
        <Text style={styles.dateText}>
          {new Date(item.plannedStartUtc).toLocaleDateString()} → {new Date(item.plannedEndUtc).toLocaleDateString()}
        </Text>
        {item.rejectionReason && (
          <Text style={styles.rejectionText}>Rejected: {item.rejectionReason}</Text>
        )}
        {item.status === 'DRAFT' && (
          <TouchableOpacity style={styles.submitBtn} onPress={() => handleSubmit(item.id)}>
            <Text style={styles.submitBtnText}>SUBMIT FOR APPROVAL</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  if (showForm) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.title}>New Drone Operation Plan</Text>

        <Text style={styles.label}>Drone Serial Number *</Text>
        <TextInput style={styles.input} value={form.droneSerialNumber}
          onChangeText={v => setForm(f => ({ ...f, droneSerialNumber: v }))}
          placeholder="DJI-M3E-001" placeholderTextColor={T.muted} />

        <Text style={styles.label}>UIN (optional)</Text>
        <TextInput style={styles.input} value={form.uinNumber}
          onChangeText={v => setForm(f => ({ ...f, uinNumber: v }))}
          placeholder="UA-2025-00123" placeholderTextColor={T.muted} />

        <Text style={styles.label}>Area Type</Text>
        <View style={styles.modeRow}>
          {(['CIRCLE', 'POLYGON'] as const).map(t => (
            <TouchableOpacity key={t} onPress={() => setForm(f => ({ ...f, areaType: t }))}
              style={[styles.modeBtn, form.areaType === t && styles.modeBtnActive]}>
              <Text style={[styles.modeBtnText, form.areaType === t && styles.modeBtnTextActive]}>
                {t === 'CIRCLE' ? 'Circle' : 'Polygon'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {form.areaType === 'CIRCLE' && (
          <>
            <Text style={styles.label}>Center Latitude *</Text>
            <TextInput style={styles.input} value={form.centerLatDeg}
              onChangeText={v => setForm(f => ({ ...f, centerLatDeg: v }))}
              placeholder="28.5562" placeholderTextColor={T.muted} keyboardType="numeric" />

            <Text style={styles.label}>Center Longitude *</Text>
            <TextInput style={styles.input} value={form.centerLonDeg}
              onChangeText={v => setForm(f => ({ ...f, centerLonDeg: v }))}
              placeholder="77.1000" placeholderTextColor={T.muted} keyboardType="numeric" />

            <Text style={styles.label}>Radius (meters) *</Text>
            <TextInput style={styles.input} value={form.radiusM}
              onChangeText={v => setForm(f => ({ ...f, radiusM: v }))}
              placeholder="500" placeholderTextColor={T.muted} keyboardType="numeric" />
          </>
        )}

        <Text style={styles.label}>Max Altitude AGL (m) *</Text>
        <TextInput style={styles.input} value={form.maxAltitudeAglM}
          onChangeText={v => setForm(f => ({ ...f, maxAltitudeAglM: v }))}
          placeholder="120" placeholderTextColor={T.muted} keyboardType="numeric" />

        <Text style={styles.label}>Planned Start (ISO) *</Text>
        <TextInput style={styles.input} value={form.plannedStartUtc}
          onChangeText={v => setForm(f => ({ ...f, plannedStartUtc: v }))}
          placeholder="2026-03-10T08:00:00" placeholderTextColor={T.muted} />

        <Text style={styles.label}>Planned End (ISO) *</Text>
        <TextInput style={styles.input} value={form.plannedEndUtc}
          onChangeText={v => setForm(f => ({ ...f, plannedEndUtc: v }))}
          placeholder="2026-03-10T12:00:00" placeholderTextColor={T.muted} />

        <Text style={styles.label}>Purpose</Text>
        <TextInput style={styles.input} value={form.purpose}
          onChangeText={v => setForm(f => ({ ...f, purpose: v }))}
          placeholder="SURVEY" placeholderTextColor={T.muted} />

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
          <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={saving}>
            {saving ? <ActivityIndicator color={T.bg} /> : <Text style={styles.createBtnText}>CREATE DRAFT</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Drone Operation Plans</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.newBtnText}>+ New Plan</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No drone plans filed yet</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: T.border },
  title: { fontSize: 20, fontWeight: '700', color: T.primary },
  newBtn: { backgroundColor: T.amber + '20', borderWidth: 1, borderColor: T.amber + '40', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { color: T.amber, fontWeight: '700', fontSize: 13 },
  emptyText: { color: T.muted, fontSize: 14 },

  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  planId: { fontSize: 16, fontWeight: '700', color: T.amber, fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
  detail: { fontSize: 12, color: T.text, marginTop: 2 },
  dateText: { fontSize: 11, color: T.muted, marginTop: 4 },
  rejectionText: { fontSize: 11, color: T.red, marginTop: 4 },
  submitBtn: { marginTop: 10, backgroundColor: T.primary, borderRadius: 6, padding: 10, alignItems: 'center' },
  submitBtnText: { color: T.bg, fontWeight: '700', fontSize: 13 },

  // Form
  label: { fontSize: 12, color: T.muted, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 6, padding: 12, color: T.textBright, fontSize: 14 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  modeBtn: { flex: 1, padding: 10, borderWidth: 1, borderColor: T.border, borderRadius: 6, alignItems: 'center' },
  modeBtnActive: { backgroundColor: T.amber + '15', borderColor: T.amber + '40' },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: T.muted },
  modeBtnTextActive: { color: T.amber },
  createBtn: { flex: 1, backgroundColor: T.primary, borderRadius: 6, padding: 14, alignItems: 'center' },
  createBtnText: { color: T.bg, fontWeight: '700', fontSize: 14 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 6, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: T.muted, fontWeight: '600', fontSize: 14 },
})

export default DroneOperationPlanScreen
