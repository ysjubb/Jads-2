package com.jads.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.jads.drone.*
import com.jads.network.MissionUploadService
import com.jads.network.UploadConfig
import com.jads.storage.JadsDatabase
import com.jads.storage.SqlCipherMissionStore
import com.jads.time.MonotonicClock
import com.jads.time.NtpQuorumAuthority
import com.jads.time.SyncStatus
import com.jads.ui.MainActivity
import com.jads.ui.viewmodel.*
import kotlinx.coroutines.*

// ─────────────────────────────────────────────────────────────────────────────
// MissionForegroundService — owns MissionController and the GPS sensor loop.
//
// GPS mode (USE_REAL_GPS flag):
//   true  — registers LocationManager for 1 Hz GPS fixes (physical device / field use)
//   false — runs a simulated 1 Hz flight profile (emulator / demo without hardware)
//
// Set USE_REAL_GPS = true for any demo on physical hardware.
// The service automatically falls back to simulation if GPS_PROVIDER is unavailable.
//
// Intent actions:
//   ACTION_CHECK_NPNT     — evaluate zone + proximity, write to MissionState
//   ACTION_START_MISSION  — start mission and begin sensor loop
//   ACTION_STOP_MISSION   — stop sensor loop, finalize mission
//   ACTION_UPLOAD_MISSION — upload completed mission to backend
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG             = "MissionForegroundSvc"
private const val CHANNEL_ID      = "jads_mission"
private const val NOTIFICATION_ID = 1001

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
// Set true when running on a physical device with GPS hardware.
// Set false for emulator testing or indoor demos.
private const val USE_REAL_GPS = true

// GPS update interval: 1 second, 0 metres minimum displacement.
private const val GPS_INTERVAL_MS = 1000L
private const val GPS_MIN_DIST_M  = 0f

class MissionForegroundService : LifecycleService() {

    companion object {
        const val ACTION_CHECK_NPNT     = "com.jads.CHECK_NPNT"
        const val ACTION_START_MISSION  = "com.jads.START_MISSION"
        const val ACTION_STOP_MISSION   = "com.jads.STOP_MISSION"
        const val ACTION_UPLOAD_MISSION = "com.jads.UPLOAD_MISSION"

        const val EXTRA_LAT           = "lat"
        const val EXTRA_LON           = "lon"
        const val EXTRA_AGL           = "agl"
        const val EXTRA_TOKEN         = "token"
        const val EXTRA_OPERATOR_ID   = "operator_id"
        const val EXTRA_MISSION_DB_ID = "mission_db_id"
    }

    // ── Dependencies ──────────────────────────────────────────────────────────
    private lateinit var db:         JadsDatabase
    private lateinit var store:      SqlCipherMissionStore
    private lateinit var clock:      MonotonicClock
    private lateinit var ntpAuth:    NtpQuorumAuthority
    private lateinit var npntGate:   NpntComplianceGate
    private lateinit var controller: MissionController
    private lateinit var uploader:   MissionUploadService

    // ── GPS ───────────────────────────────────────────────────────────────────
    private var locationManager: LocationManager? = null
    private var locationListener: LocationListener? = null
    private var recordingJob: Job? = null      // used only for simulation mode

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        Log.d(TAG, "Service created (USE_REAL_GPS=$USE_REAL_GPS)")

        db    = JadsDatabase.getInstance(this) {
            // Demo: fixed passphrase. Production: derive from Android Keystore + biometric.
            "JADS_DEMO_PASSPHRASE_CHANGE_IN_PRODUCTION".toByteArray(Charsets.UTF_8)
        }
        store   = SqlCipherMissionStore(db)
        clock   = MonotonicClock()
        ntpAuth = NtpQuorumAuthority()
        uploader = MissionUploadService(db, UploadConfig(
            backendUrl = "https://jads.internal/api"
            // authToken not set here — uploadMission() reads MissionState.jwtToken at call time
        ))

        npntGate = NpntComplianceGate(
            digitalSkyAdapter = HardcodedZoneMapAdapter(),
            proximityChecker  = buildProximityChecker()
        )

        controller = MissionController(
            npntGate           = npntGate,
            ntpAuthority       = ntpAuth,
            store              = store,
            clock              = clock,
            privateKeyBytes    = loadOrGeneratePrivateKey(),
            onMissionFinalized = { dbId ->
                MissionState.setMissionFinished()
                Log.i(TAG, "Mission $dbId finalized — queuing upload")
                lifecycleScope.launch { uploader.uploadMission(dbId) }
            }
        )
        // CC-STOR-05 fix: surface SQLCipher decryption failure to operator.
        // resumeMission() calls this when getRecords() throws MissionStoreDecryptionError.
        // This MUST stop any attempt to restart the mission — the chain cannot be continued
        // safely without the prior records. The operator must investigate and restore backup.
        controller.onDecryptionFailure = { missionId, reason ->
            Log.e(TAG, "STORAGE_DECRYPTION_FAILURE missionId=$missionId reason=$reason")
            MissionState.setDecryptionFailure(reason)
            // Do NOT resume the mission. Surface as a fatal error in the UI.
        }

        // NTP sync on startup (non-blocking)
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val evidence = ntpAuth.syncAndGetEvidence()
                val synced   = evidence.syncStatus == SyncStatus.SYNCED
                clock.updateCorrection(evidence.correctionMs)
                MissionState.setNtpStatus(synced, evidence.correctionMs)
                Log.i(TAG, "NTP sync: status=$synced offset=${evidence.correctionMs}ms")
            } catch (e: Exception) {
                Log.w(TAG, "NTP sync failed on init: ${e.message}")
                MissionState.setNtpStatus(false, 0)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        when (intent?.action) {
            ACTION_CHECK_NPNT -> {
                val lat   = intent.getDoubleExtra(EXTRA_LAT, 0.0)
                val lon   = intent.getDoubleExtra(EXTRA_LON, 0.0)
                val agl   = intent.getDoubleExtra(EXTRA_AGL, 100.0)
                val token = intent.getStringExtra(EXTRA_TOKEN)
                lifecycleScope.launch(Dispatchers.IO) { checkNpnt(lat, lon, agl, token) }
            }
            ACTION_START_MISSION -> {
                val lat   = intent.getDoubleExtra(EXTRA_LAT, 0.0)
                val lon   = intent.getDoubleExtra(EXTRA_LON, 0.0)
                val agl   = intent.getDoubleExtra(EXTRA_AGL, 100.0)
                val token = intent.getStringExtra(EXTRA_TOKEN)
                startMissionAndRecord(lat, lon, agl, token)
            }
            ACTION_STOP_MISSION  -> stopMission()
            ACTION_UPLOAD_MISSION -> {
                val dbId = intent.getLongExtra(EXTRA_MISSION_DB_ID, -1L)
                if (dbId > 0) lifecycleScope.launch { uploader.uploadMission(dbId) }
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopGpsListener()
        recordingJob?.cancel()
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
    }

    // ── NPNT check ────────────────────────────────────────────────────────────

    private suspend fun checkNpnt(lat: Double, lon: Double, agl: Double, token: String?) {
        try {
            val result = npntGate.evaluate(lat, lon, agl, token)
            MissionState.setNpntResult(result)
        } catch (e: Exception) {
            Log.e(TAG, "NPNT check error", e)
        }
    }

    // ── Start mission ─────────────────────────────────────────────────────────

    private fun startMissionAndRecord(lat: Double, lon: Double, agl: Double, token: String?) {
        startForegroundSvc()
        lifecycleScope.launch(Dispatchers.IO) {
            val result = controller.startMission(
                latDeg             = lat,
                lonDeg             = lon,
                plannedAglFt       = agl,
                permissionToken    = token,
                idempotencyKey     = java.util.UUID.randomUUID().toString(),
                deviceCertHash     = "DEMO_CERT_HASH",
                strongboxBacked    = false,
                secureBootVerified = false,
                androidVersion     = Build.VERSION.SDK_INT
            )
            when (result) {
                is MissionStartResult.Started -> {
                    MissionState.setMissionStarted(result.missionDbId, result.missionId)
                    if (USE_REAL_GPS && isGpsAvailable()) {
                        startRealGpsListener(lat, lon)
                    } else {
                        Log.i(TAG, "Real GPS unavailable or disabled — using simulation")
                        startSimulationLoop(lat, lon)
                    }
                }
                is MissionStartResult.Blocked -> {
                    Log.w(TAG, "Mission blocked: ${result.reason} — ${result.details}")
                    MissionState.setMissionFinished()
                    stopForeground(STOP_FOREGROUND_REMOVE)
                }
            }
        }
    }

    // ── REAL GPS ──────────────────────────────────────────────────────────────

    private fun isGpsAvailable(): Boolean {
        val lm = getSystemService(LOCATION_SERVICE) as? LocationManager ?: return false
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
    }

    @SuppressLint("MissingPermission")  // Permission is requested in MainActivity before starting
    private fun startRealGpsListener(fallbackLat: Double, fallbackLon: Double) {
        val lm = getSystemService(LOCATION_SERVICE) as? LocationManager
        if (lm == null) {
            Log.w(TAG, "LocationManager unavailable — falling back to simulation")
            startSimulationLoop(fallbackLat, fallbackLon)
            return
        }
        locationManager = lm

        val listener = object : LocationListener {
            private var recordCount = 0L

            override fun onLocationChanged(location: Location) {
                if (!MissionState.missionActive.value) {
                    stopGpsListener()
                    return
                }
                recordCount++

                val raw = RawSensorFields(
                    latDeg         = location.latitude,
                    lonDeg         = location.longitude,
                    altMeters      = if (location.hasAltitude()) location.altitude else 0.0,
                    hdop           = if (location.hasAccuracy()) location.accuracy / 5f else 2.5f,
                    satelliteCount = location.extras?.getInt("satellites") ?: 0,
                    velNorthMs     = if (location.hasBearing() && location.hasSpeed())
                                         (location.speed * Math.cos(Math.toRadians(location.bearing.toDouble())))
                                     else 0.0,
                    velEastMs      = if (location.hasBearing() && location.hasSpeed())
                                         (location.speed * Math.sin(Math.toRadians(location.bearing.toDouble())))
                                     else 0.0,
                    velDownMs      = 0.0,   // GPS doesn't give vertical velocity directly
                    flightState    = if (location.altitude > 2.0) 0x01 else 0x04  // AIRBORNE : ON_GROUND
                )

                lifecycleScope.launch(Dispatchers.IO) {
                    controller.processReading(raw)
                    MissionState.updateTelemetry(
                        latDeg     = location.latitude,
                        lonDeg     = location.longitude,
                        altFt      = location.altitude * 3.28084,
                        velocityMs = location.speed.toDouble(),
                        records    = recordCount
                    )
                }
            }

            // Required for API < 30 — LocationListener interface
            @Suppress("OVERRIDE_DEPRECATION")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {
                Log.d(TAG, "GPS provider enabled: $provider")
            }
            override fun onProviderDisabled(provider: String) {
                Log.w(TAG, "GPS provider disabled: $provider — mission continues without GPS")
            }
        }

        locationListener = listener
        lm.requestLocationUpdates(
            LocationManager.GPS_PROVIDER,
            GPS_INTERVAL_MS,
            GPS_MIN_DIST_M,
            listener
        )
        Log.i(TAG, "Real GPS listener registered at ${GPS_INTERVAL_MS}ms intervals")
    }

    private fun stopGpsListener() {
        locationListener?.let { locationManager?.removeUpdates(it) }
        locationListener = null
        locationManager  = null
    }

    // ── SIMULATION LOOP (emulator / indoor demo) ───────────────────────────────

    private fun startSimulationLoop(startLat: Double, startLon: Double) {
        Log.i(TAG, "Starting simulated GPS loop")
        recordingJob = lifecycleScope.launch(Dispatchers.IO) {
            var seq       = 0L
            var altFt     = 0.0
            var ascending = true
            var lat       = startLat
            var lon       = startLon
            var records   = 0L

            while (isActive && MissionState.missionActive.value) {
                if (ascending) {
                    altFt += 5.0
                    if (altFt >= 200.0) ascending = false
                } else {
                    altFt -= 2.0
                    if (altFt <= 10.0) ascending = true
                }
                lat += 0.00001 * (if (seq % 2 == 0L) 1 else -1)
                lon += 0.00001

                val raw = RawSensorFields(
                    latDeg         = lat,
                    lonDeg         = lon,
                    altMeters      = altFt / 3.28084,
                    hdop           = 1.2f,
                    satelliteCount = 12,
                    velNorthMs     = 2.0,
                    velEastMs      = 1.5,
                    velDownMs      = 0.1,
                    flightState    = if (altFt > 5.0) 0x01 else 0x04
                )

                controller.processReading(raw)
                records++

                MissionState.updateTelemetry(
                    latDeg     = lat,
                    lonDeg     = lon,
                    altFt      = altFt,
                    velocityMs = Math.sqrt(2.0 * 2.0 + 1.5 * 1.5),
                    records    = records
                )

                if (altFt > 400.0) {
                    MissionState.addViolation(ViolationSummary(
                        sequence      = seq,
                        type          = "AGL_EXCEEDED",
                        severity      = "CRITICAL",
                        timestampMs   = System.currentTimeMillis(),
                        detailMessage = "Altitude ${altFt.toInt()}ft exceeds 400ft NPNT limit"
                    ))
                }

                seq++
                delay(1000L)
            }
        }
    }

    // ── Stop mission ──────────────────────────────────────────────────────────

    private fun stopMission() {
        stopGpsListener()
        recordingJob?.cancel()
        recordingJob = null
        MissionState.setMissionFinished()
        stopForeground(STOP_FOREGROUND_REMOVE)
        Log.i(TAG, "Mission stopped by operator")
    }

    // ── Notification ──────────────────────────────────────────────────────────

    private fun startForegroundSvc() {
        val notification = buildNotification()
        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, notification,
            if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
        )
    }

    private fun buildNotification(): Notification {
        val pi = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("JADS Mission Active")
            .setContentText("Recording — ${MissionState.recordCount.value} records")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pi)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID, "Mission Recording", NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Active while JADS mission is recording"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun loadOrGeneratePrivateKey(): ByteArray {
        // Demo: ephemeral P-256 key generated in-process.
        // Production: load from Android Keystore (never leaves secure hardware).
        val kg = java.security.KeyPairGenerator.getInstance("EC")
        kg.initialize(256)
        return kg.generateKeyPair().private.encoded
    }

    private fun buildProximityChecker(): IAirportProximityChecker {
        return try {
            val json = assets.open("aerodrome_proximity.json").bufferedReader().readText()
            val type = object : com.google.gson.reflect.TypeToken<List<AerodromeProximityEntry>>() {}.type
            AirportProximityChecker(com.google.gson.Gson().fromJson(json, type))
        } catch (e: Exception) {
            Log.w(TAG, "Aerodrome proximity data unavailable: ${e.message}")
            object : IAirportProximityChecker {
                override fun check(lat: Double, lon: Double, agl: Double) = AirportProximityResult(
                    clear = true, restriction = ProximityRestriction.NONE,
                    nearestIcaoCode = "NONE", nearestName = "none",
                    distanceKm = 999.0, message = "Aerodrome data unavailable — proximity check skipped"
                )
            }
        }
    }
}

// StubDigitalSkyAdapter removed — replaced by HardcodedZoneMapAdapter (see HardcodedZoneMapAdapter.kt)
