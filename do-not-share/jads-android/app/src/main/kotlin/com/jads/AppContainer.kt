package com.jads

import android.content.Context
import com.jads.drone.*
import com.jads.network.JadsApiClient
import com.jads.network.UploadService
import com.jads.storage.AppPreferences
import com.jads.storage.JadsDatabase
import com.jads.storage.SqlCipherMissionStore
import com.jads.time.NtpQuorumAuthority
import com.jads.time.MonotonicClock

// AppContainer — manual dependency injection container.
//
// No Hilt/Koin — keeps the project buildable without annotation processors
// beyond KSP (which is already configured for Room).
// For a production hardened version, migrate to Hilt.
//
// Lifecycle: created once in JadsApplication.onCreate().
// All contained objects are singletons for the process lifetime.
//
// SQLCipher passphrase: for the demo the passphrase is derived from the
// device Android ID. Production must use Android Keystore biometric-unlocked key.

class AppContainer(context: Context) {

    val prefs         = AppPreferences(context)

    // ── DB passphrase (demo: fixed — production: Keystore-backed) ──────────
    // TODO production: replace with BiometricPrompt → KeyStore AES key → derived passphrase
    private val passphraseBytes: ByteArray
        get() = "JADS_DEMO_PASSPHRASE_REPLACE_IN_PROD".toByteArray(Charsets.UTF_8)

    val db    = JadsDatabase.getInstance(context) { passphraseBytes }
    val store = SqlCipherMissionStore(db)

    // ── Network ────────────────────────────────────────────────────────────
    val apiClient = JadsApiClient(
        baseUrl  = prefs.backendBaseUrl,
        jwtToken = prefs.jwtToken
    )

    val uploadService = UploadService(apiClient, db)

    // ── Drone mission core ─────────────────────────────────────────────────
    val ntpAuthority  = NtpQuorumAuthority()
    val clock         = MonotonicClock()

    // Private key bytes — STUB for demo.
    // Production: key lives in Android Keystore. EcdsaSigner.sign() uses a
    // KeyStore.PrivateKey reference, not raw bytes.
    private val stubPrivateKeyBytes = ByteArray(32) { it.toByte() }

    // Digital Sky adapter — STUB for demo (returns GREEN for all locations).
    // Production: replace with HTTP call to Digital Sky India API.
    private val digitalSkyAdapter = object : IDigitalSkyAdapter {
        override suspend fun classifyLocation(latDeg: Double, lonDeg: Double, altFt: Double) =
            ZoneResult(ZoneType.GREEN, "DEMO_ZONE_001", maxAglFt = 400)
        override suspend fun validatePermissionToken(token: String) =
            TokenValidationResult(valid = true, reason = null)
    }

    private val aerodromes: List<AerodromeProximityEntry> by lazy {
        loadAerodromes(context)
    }

    private val proximityChecker by lazy { AirportProximityChecker(aerodromes) }
    val npntGate by lazy { NpntComplianceGate(digitalSkyAdapter, proximityChecker) }

    val missionController by lazy {
        MissionController(
            npntGate         = npntGate,
            ntpAuthority     = ntpAuthority,
            store            = store,
            clock            = clock,
            privateKeyBytes  = stubPrivateKeyBytes,
            onMissionFinalized = { missionDbId ->
                // Upload triggered by WorkManager after finalization
                com.jads.upload.MissionUploadWorker.enqueue(context, missionDbId)
            }
        )
    }

    // ── Update auth after login ────────────────────────────────────────────
    fun onLoginSuccess(token: String, operatorId: String, operatorType: String) {
        prefs.jwtToken      = token
        prefs.operatorId    = operatorId
        prefs.operatorType  = operatorType
        apiClient.updateAuth(token)
    }

    fun onLogout() {
        prefs.clearSession()
    }

    // ── Aerodrome data ─────────────────────────────────────────────────────
    private fun loadAerodromes(context: Context): List<AerodromeProximityEntry> {
        return try {
            val json = context.assets.open("aerodrome_proximity.json")
                .bufferedReader().use { it.readText() }
            com.google.gson.Gson().fromJson(
                json, Array<AerodromeProximityEntry>::class.java
            ).toList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    // ── Provider interface — used by WorkManager ───────────────────────────
    interface Provider {
        val appContainer: AppContainer
    }
}
