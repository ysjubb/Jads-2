/**
 * LoginScreen
 *
 * Supports:
 *   1. Civilian OTP-based login (email/mobile → OTP verification)
 *   2. Special unit account login (username + password)
 *
 * Stores JWT in AsyncStorage for subsequent API calls.
 * HUD dark theme matching all JADS portals.
 */

import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { T } from '../theme/theme'

const API_BASE = 'http://localhost:8080/api'
const JADS_VERSION = '4.0'

interface Props {
  onLoginSuccess: () => void
}

export function LoginScreen({ onLoginSuccess }: Props) {
  const [mode, setMode]         = useState<'CIVILIAN' | 'SPECIAL'>('CIVILIAN')
  const [step, setStep]         = useState<'ID' | 'OTP'>('ID')
  const [identifier, setId]     = useState('')
  const [otp, setOtp]           = useState('')
  const [username, setUsername]  = useState('')
  const [password, setPassword] = useState('')
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const headers = {
    'Content-Type':   'application/json',
    'X-JADS-Version': JADS_VERSION,
  }

  const handleCivilianStep1 = async () => {
    if (!identifier.trim()) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/civilian/login/initiate`, {
        method: 'POST', headers, body: JSON.stringify({ emailOrMobile: identifier.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setPendingUserId(data.userId)
      setStep('OTP')
    } catch (e: any) {
      setError(e.message ?? 'Login initiation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCivilianStep2 = async () => {
    if (!pendingUserId || !otp.trim()) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/civilian/login/complete`, {
        method: 'POST', headers, body: JSON.stringify({ userId: pendingUserId, otp: otp.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      await AsyncStorage.setItem('auth:jwt', data.accessToken)
      onLoginSuccess()
    } catch (e: any) {
      setError(e.message ?? 'OTP verification failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSpecialLogin = async () => {
    if (!username.trim() || !password) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`${API_BASE}/auth/special/login`, {
        method: 'POST', headers, body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      await AsyncStorage.setItem('auth:jwt', data.accessToken)
      onLoginSuccess()
    } catch (e: any) {
      setError(e.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>JADS</Text>
        <Text style={styles.subtitle}>Joint Airspace Defence System</Text>

        {/* Mode toggle */}
        <View style={styles.modeRow}>
          {(['CIVILIAN', 'SPECIAL'] as const).map(m => (
            <TouchableOpacity key={m} onPress={() => { setMode(m); setStep('ID'); setError(null) }}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}>
              <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                {m === 'CIVILIAN' ? 'Civilian' : 'Unit Login'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {mode === 'CIVILIAN' ? (
          step === 'ID' ? (
            <>
              <TextInput style={styles.input} placeholder="Email or Mobile" placeholderTextColor={T.muted}
                value={identifier} onChangeText={setId} autoCapitalize="none" keyboardType="email-address" />
              <TouchableOpacity style={styles.btn} onPress={handleCivilianStep1} disabled={loading}>
                {loading ? <ActivityIndicator color={T.bg} /> : <Text style={styles.btnText}>Send OTP</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.otpHint}>OTP sent. Enter it below.</Text>
              <TextInput style={styles.input} placeholder="123456" placeholderTextColor={T.muted}
                value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />
              <TouchableOpacity style={styles.btn} onPress={handleCivilianStep2} disabled={loading}>
                {loading ? <ActivityIndicator color={T.bg} /> : <Text style={styles.btnText}>Verify OTP</Text>}
              </TouchableOpacity>
            </>
          )
        ) : (
          <>
            <TextInput style={styles.input} placeholder="Username" placeholderTextColor={T.muted}
              value={username} onChangeText={setUsername} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Password" placeholderTextColor={T.muted}
              value={password} onChangeText={setPassword} secureTextEntry />
            <TouchableOpacity style={styles.btn} onPress={handleSpecialLogin} disabled={loading}>
              {loading ? <ActivityIndicator color={T.bg} /> : <Text style={styles.btnText}>Login</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 12, padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: T.primary, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 11, color: T.muted, textAlign: 'center', marginBottom: 20 },
  modeRow: { flexDirection: 'row', marginBottom: 16, gap: 4 },
  modeBtn: { flex: 1, padding: 10, borderWidth: 1, borderColor: T.border, borderRadius: 6, alignItems: 'center' },
  modeBtnActive: { backgroundColor: T.primary + '15', borderColor: T.primary + '40' },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: T.muted },
  modeBtnTextActive: { color: T.primary },
  error: { color: T.red, fontSize: 12, marginBottom: 12, textAlign: 'center' },
  input: { backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: 6, padding: 12, color: T.textBright, fontSize: 14, marginBottom: 12 },
  btn: { backgroundColor: T.primary, borderRadius: 6, padding: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: T.bg, fontWeight: '700', fontSize: 15 },
  otpHint: { color: T.primary, fontSize: 12, marginBottom: 12, textAlign: 'center' },
})

export default LoginScreen
