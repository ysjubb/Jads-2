package com.jads

import android.content.Context
import com.jads.dji.DjiFlightLogWatcher
import com.jads.dji.DjiLogIngestionService
import com.jads.crypto.KeyStoreSigningProvider
import com.jads.crypto.MlDsaSigner
import com.jads.drone.*
import com.jads.network.JadsApiClient
import com.jads.network.UploadService
import com.jads.storage.AppPreferences
import com.jads.storage.JadsDatabase
import com.jads.storage.SqlCipherMissionStore
import com.jads.time.NtpQuorumAuthority
import com.jads.time.MonotonicClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

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

    // ── ECDSA signing — Keystore + StrongBox preferred, stub fallback ──────
    // Production: key lives in Android Keystore (StrongBox when available).
    // KeyStoreSigningProvider.sign() handles the JCA signing internally.
    // Fallback: raw byte stub for emulator / unit tests where Keystore is unavailable.
    //
    // Nonce flow: fetch server nonce → pass as attestation challenge → generate key.
    // If nonce fetch fails (offline), fall back to static challenge with advisory.
    val keyStoreProvider: KeyStoreSigningProvider? = run {
        val deviceId = android.provider.Settings.Secure.getString(
            context.contentResolver, android.provider.Settings.Secure.ANDROID_ID
        ) ?: "unknown-device"

        val nonceResult = try {
            apiClient.fetchAttestationNonce(deviceId)
        } catch (_: Exception) { null }

        when (nonceResult) {
            is com.jads.network.ApiResult.Success -> {
                val nonceBytes = nonceResult.data.chunked(2)
                    .map { it.toInt(16).toByte() }.toByteArray()
                KeyStoreSigningProvider.create(nonceBytes)
            }
            else -> {
                android.util.Log.w("AppContainer",
                    "WARN: Offline nonce fetch — static challenge used")
                @Suppress("DEPRECATION")
                KeyStoreSigningProvider.create()
            }
        }
    }
    private val stubPrivateKeyBytes = ByteArray(32) { it.toByte() }
    val isStrongBoxBacked: Boolean get() = keyStoreProvider?.isStrongBoxBacked == true
    val isHardwareBacked:  Boolean get() = keyStoreProvider != null

    // ── PQC key pair (ML-DSA-65, FIPS 204) — Phase 1 hybrid signing ─────
    // Generated once at app startup. Software-only (not hardware-backed yet).
    // The public key is sent to the backend at upload time for verification.
    private val pqcKeyPair: Pair<ByteArray, ByteArray> by lazy { MlDsaSigner.generateKeyPair() }
    val pqcPrivateKey: ByteArray get() = pqcKeyPair.first
    val pqcPublicKey:  ByteArray get() = pqcKeyPair.second

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
        // Signing strategy: use Keystore when available (hardware-backed),
        // fall back to Bouncy Castle stub for emulator/test environments.
        val signFn: (ByteArray) -> ByteArray = if (keyStoreProvider != null) {
            { hash32 -> keyStoreProvider.sign(hash32) }
        } else {
            { hash32 -> com.jads.crypto.EcdsaSigner.sign(hash32, stubPrivateKeyBytes) }
        }

        MissionController(
            npntGate         = npntGate,
            ntpAuthority     = ntpAuthority,
            store            = store,
            clock            = clock,
            privateKeyBytes  = stubPrivateKeyBytes,
            signFunction     = signFn,
            strongboxBacked  = isStrongBoxBacked,
            hardwareBacked   = isHardwareBacked,
            onMissionFinalized = { missionDbId ->
                // Upload triggered by WorkManager after finalization
                com.jads.upload.MissionUploadWorker.enqueue(context, missionDbId)
            },
            pqcPrivateKey    = pqcPrivateKey,   // Phase 1 hybrid PQC signing
            pqcPublicKeyHex  = pqcPublicKey.let { com.jads.crypto.HashChainEngine.toHex(it) }
        )
    }

    // ── DJI flight log auto-ingestion ───────────────────────────────────────
    // Watches known DJI directories for new flight logs.
    // When detected: parse → serialize → sign → chain → store → upload.
    // No user interaction required after MANAGE_EXTERNAL_STORAGE is granted.

    private val ingestionScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val djiIngestionService by lazy {
        val signFn: ((ByteArray) -> ByteArray)? = keyStoreProvider?.let { ksp ->
            { hash32: ByteArray -> ksp.sign(hash32) }
        }
        DjiLogIngestionService(
            store            = store,
            clock            = clock,
            privateKeyBytes  = stubPrivateKeyBytes,
            context          = context,
            onMissionIngested = { missionDbId ->
                com.jads.upload.MissionUploadWorker.enqueue(context, missionDbId)
            },
            signFunction     = signFn
        )
    }

    val djiLogWatcher by lazy {
        DjiFlightLogWatcher { file ->
            ingestionScope.launch {
                djiIngestionService.ingest(file)
            }
        }
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
