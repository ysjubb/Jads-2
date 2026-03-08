/**
 * EditFlightPlanScreen
 *
 * Allows editing a filed flight plan before clearance (ADC/FIC).
 * Only editable fields are shown. Status guard prevents post-clearance edits.
 */

import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { T } from '../theme/theme'
import { editFlightPlan } from '../api/droneOperationPlanApi'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_BASE = 'http://localhost:8080/api'
const JADS_VERSION = '4.0'

const EDITABLE_STATUSES = ['FILED', 'ACKNOWLEDGED', 'PENDING_CLEARANCE']

interface Props {
  planId: string
  onSaved: () => void
  onCancel: () => void
}

export function EditFlightPlanScreen({ planId, onSaved, onCancel }: Props) {
  const [plan, setPlan]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [form, setForm]       = useState<Record<string, string>>({})

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('auth:jwt')
        const res = await fetch(`${API_BASE}/flight-plans/${planId}`, {
          headers: {
            'Content-Type':   'application/json',
            'X-JADS-Version': JADS_VERSION,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        const data = await res.json()
        const p = data.plan
        setPlan(p)
        setForm({
          route:          p.route ?? '',
          cruisingLevel:  p.cruisingLevel ?? '',
          cruisingSpeed:  p.cruisingSpeed ?? '',
          altn1:          p.altn1 ?? '',
          altn2:          p.altn2 ?? '',
          eet:            p.eet ?? '',
          endurance:      p.endurance ?? '',
          personsOnBoard: String(p.personsOnBoard ?? ''),
          notifyEmail:    p.notifyEmail ?? '',
          notifyMobile:   p.notifyMobile ?? '',
          remarks:        p.remarks ?? '',
        })
      } catch (e: any) {
        Alert.alert('Error', e.message ?? 'Failed to load plan')
      }
      setLoading(false)
    })()
  }, [planId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(form)) {
        if (k === 'personsOnBoard') payload[k] = parseInt(v) || null
        else if (v !== '') payload[k] = v
      }
      await editFlightPlan(planId, payload)
      onSaved()
    } catch (e: any) {
      Alert.alert('Edit Failed', e.message ?? 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={T.primary} />
      </View>
    )
  }

  if (!plan || !EDITABLE_STATUSES.includes(plan.status)) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.error}>
          {plan ? `Cannot edit — plan is ${plan.status}` : 'Plan not found'}
        </Text>
        <TouchableOpacity onPress={onCancel} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Edit Flight Plan</Text>
      <Text style={styles.subtitle}>{plan.adep} → {plan.ades} · Amendment #{(plan.amendmentCount ?? 0) + 1}</Text>

      <Text style={styles.label}>Route</Text>
      <TextInput style={styles.input} value={form.route} onChangeText={v => setForm(f => ({ ...f, route: v }))} placeholderTextColor={T.muted} />

      <Text style={styles.label}>Cruising Level</Text>
      <TextInput style={styles.input} value={form.cruisingLevel} onChangeText={v => setForm(f => ({ ...f, cruisingLevel: v }))} placeholderTextColor={T.muted} />

      <Text style={styles.label}>Cruising Speed</Text>
      <TextInput style={styles.input} value={form.cruisingSpeed} onChangeText={v => setForm(f => ({ ...f, cruisingSpeed: v }))} placeholderTextColor={T.muted} />

      <Text style={styles.label}>Alternate 1</Text>
      <TextInput style={styles.input} value={form.altn1} onChangeText={v => setForm(f => ({ ...f, altn1: v }))} placeholderTextColor={T.muted} />

      <Text style={styles.label}>EET</Text>
      <TextInput style={styles.input} value={form.eet} onChangeText={v => setForm(f => ({ ...f, eet: v }))} placeholderTextColor={T.muted} />

      <Text style={styles.label}>Persons On Board</Text>
      <TextInput style={styles.input} value={form.personsOnBoard} onChangeText={v => setForm(f => ({ ...f, personsOnBoard: v }))} keyboardType="numeric" placeholderTextColor={T.muted} />

      <Text style={styles.label}>Notify Email</Text>
      <TextInput style={styles.input} value={form.notifyEmail} onChangeText={v => setForm(f => ({ ...f, notifyEmail: v }))} keyboardType="email-address" placeholderTextColor={T.muted} />

      <Text style={styles.label}>Notify Mobile</Text>
      <TextInput style={styles.input} value={form.notifyMobile} onChangeText={v => setForm(f => ({ ...f, notifyMobile: v }))} keyboardType="phone-pad" placeholderTextColor={T.muted} />

      <Text style={styles.label}>Remarks</Text>
      <TextInput style={styles.input} value={form.remarks} onChangeText={v => setForm(f => ({ ...f, remarks: v }))} placeholderTextColor={T.muted} />

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, marginBottom: 40 }}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={T.bg} /> : <Text style={styles.saveBtnText}>SAVE AMENDMENT</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelFormBtn} onPress={onCancel}>
          <Text style={styles.cancelFormBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  center: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: '700', color: T.amber, marginBottom: 4 },
  subtitle: { fontSize: 12, color: T.muted, marginBottom: 16 },
  label: { fontSize: 12, color: T.muted, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 6, padding: 12, color: T.textBright, fontSize: 14 },
  error: { color: T.red, fontSize: 14, marginBottom: 12 },
  backBtn: { padding: 12, borderWidth: 1, borderColor: T.primary, borderRadius: 6 },
  backBtnText: { color: T.primary, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: T.amber, borderRadius: 6, padding: 14, alignItems: 'center' },
  saveBtnText: { color: T.bg, fontWeight: '700', fontSize: 14 },
  cancelFormBtn: { flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 6, padding: 14, alignItems: 'center' },
  cancelFormBtnText: { color: T.muted, fontWeight: '600', fontSize: 14 },
})

export default EditFlightPlanScreen
