package com.jads.dji

import android.os.Environment
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File

// DjiFlightLogWatcher — monitors known DJI flight log directories for new files.
//
// DJI stores flight records at different paths depending on the app:
//
//   DJI Pilot 2 (enterprise):
//     /sdcard/DJI/com.dji.industry.pilot/FlightRecord/
//     This is SHARED external storage — accessible with MANAGE_EXTERNAL_STORAGE.
//     FileObserver works here. Auto-ingestion fully automatic.
//
//   DJI Fly (consumer):
//     /sdcard/Android/data/dji.go.v5/files/FlightRecord/
//     This is APP-SPECIFIC external storage — blocked on Android 13+.
//     Android 11-12: accessible via SAF (user grants folder access).
//     Android 13+: NOT accessible by any means except root or adb.
//     For consumer drones, use ingestFile() with a user-shared file instead.
//
//   Older DJI apps:
//     /sdcard/DJI/dji.go.v4/FlightRecord/    — DJI GO 4
//     /sdcard/DJI/dji.pilot/FlightRecord/     — DJI Pilot v1
//     These are shared storage — accessible with MANAGE_EXTERNAL_STORAGE.
//
// Detection strategy: FileObserver (real-time) + periodic poll (fallback every 60s).
// FileObserver is unreliable on some Android OEMs (Samsung, Xiaomi) —
// the periodic poll catches anything FileObserver misses.
//
// For consumer DJI Fly logs on Android 13+, the operator must either:
//   (a) Manually share the flight log file from DJI Fly to JADS (share intent)
//   (b) Copy the file via USB to a watched directory
//   (c) Use DJI MSDK integration for real-time telemetry instead
//
// Flight log format: binary .txt (v12-v14, AES-encrypted on v13+),
//                    CSV (user export), or JSON (FlightRecord API).
// The parser handles all three formats automatically.

class DjiFlightLogWatcher(
    private val onNewFlightLog: (file: File) -> Unit
) {
    companion object {
        private const val TAG = "DjiLogWatcher"
        private const val POLL_INTERVAL_MS = 60_000L  // 60 seconds

        // Directories on SHARED external storage — accessible with MANAGE_EXTERNAL_STORAGE.
        // These work for DJI Pilot 2 (enterprise) and older DJI GO 4 apps.
        private val SHARED_STORAGE_DIRS = listOf(
            "DJI/com.dji.industry.pilot/FlightRecord",   // DJI Pilot 2 (Matrice, M30, M300, etc.)
            "DJI/dji.go.v4/FlightRecord",                 // DJI GO 4 (Phantom 4, Mavic Pro, etc.)
            "DJI/dji.pilot/FlightRecord",                  // DJI Pilot v1
            "DJI/dji.pilot.pad/FlightRecord",              // DJI Pilot Pad
        )

        // Directories under Android/data/ — APP-SPECIFIC storage.
        // Only accessible on Android 10-12 with requestLegacyExternalStorage or SAF.
        // Blocked on Android 13+.
        private val APP_SPECIFIC_DIRS = listOf(
            "Android/data/dji.go.v5/files/FlightRecord",  // DJI Fly v5 (consumer)
            "Android/data/dji.go.v5/files/Flight Records", // DJI Fly (some versions)
        )

        // Flight log file extensions we can ingest
        private val LOG_EXTENSIONS = setOf("txt", "csv", "json")
    }

    private val observers = mutableListOf<FileObserver>()
    private val handler = Handler(Looper.getMainLooper())
    private val processedFiles = mutableSetOf<String>()  // absolute paths already ingested
    private var running = false

    // Track the latest modification time per directory — only ingest files newer than this.
    // Set to "now" at startup so we only ingest flights that happen AFTER JADS starts watching.
    // To ingest historical logs, call ingestHistorical() explicitly.
    private var watchStartTimeMs = System.currentTimeMillis()

    // ── Public API ───────────────────────────────────────────────────────────

    fun start() {
        if (running) return
        running = true
        watchStartTimeMs = System.currentTimeMillis()

        Log.i(TAG, "Starting DJI flight log watcher")

        val extDir = Environment.getExternalStorageDirectory()

        // Watch shared storage directories (always accessible with MANAGE_EXTERNAL_STORAGE)
        for (relPath in SHARED_STORAGE_DIRS) {
            watchDirectory(File(extDir, relPath))
        }

        // Try app-specific directories (may fail on Android 13+ — that's expected)
        for (relPath in APP_SPECIFIC_DIRS) {
            val dir = File(extDir, relPath)
            if (dir.exists() && dir.canRead()) {
                watchDirectory(dir)
            } else {
                Log.d(TAG, "App-specific dir not accessible (expected on Android 13+): ${dir.absolutePath}")
            }
        }

        // Start periodic poll as a fallback
        handler.postDelayed(pollRunnable, POLL_INTERVAL_MS)
        Log.i(TAG, "Periodic poll scheduled every ${POLL_INTERVAL_MS / 1000}s")
    }

    fun stop() {
        running = false
        for (obs in observers) {
            obs.stopWatching()
        }
        observers.clear()
        handler.removeCallbacks(pollRunnable)
        Log.i(TAG, "DJI flight log watcher stopped")
    }

    /**
     * Manually ingest a specific file. Use this when:
     *   - User shares a flight log from DJI Fly via Android share intent
     *   - User picks a file via SAF document picker
     *   - User copies a file via USB to the device
     *
     * This bypasses the directory watcher entirely — works on all Android versions.
     */
    fun ingestFile(file: File) {
        val absPath = file.absolutePath
        if (absPath in processedFiles) {
            Log.i(TAG, "File already ingested: ${file.name}")
            return
        }
        processedFiles.add(absPath)
        Log.i(TAG, "Manual ingest: ${file.name} (${file.length()} bytes)")
        onNewFlightLog(file)
    }

    /**
     * Ingest all existing flight logs in watched directories, regardless of timestamp.
     * Call this manually if you want to import historical flights.
     */
    fun ingestHistorical() {
        Log.i(TAG, "Ingesting historical flight logs")
        val originalWatchStart = watchStartTimeMs
        watchStartTimeMs = 0L  // temporarily allow all timestamps
        pollDirectories()
        watchStartTimeMs = originalWatchStart
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    private fun watchDirectory(dir: File) {
        if (!dir.exists()) {
            dir.mkdirs()
            Log.d(TAG, "Created watched directory: ${dir.absolutePath}")
        }

        // FileObserver watches for CLOSE_WRITE — the file is fully written and closed.
        // We do NOT react to CREATE (file may still be open/partially written).
        val observer = object : FileObserver(dir, CLOSE_WRITE) {
            override fun onEvent(event: Int, path: String?) {
                if (path == null) return
                val file = File(dir, path)
                handleCandidate(file)
            }
        }
        observer.startWatching()
        observers.add(observer)
        Log.i(TAG, "FileObserver watching: ${dir.absolutePath}")
    }

    private val pollRunnable = object : Runnable {
        override fun run() {
            if (!running) return
            pollDirectories()
            handler.postDelayed(this, POLL_INTERVAL_MS)
        }
    }

    private fun pollDirectories() {
        val extDir = Environment.getExternalStorageDirectory()

        val allDirs = SHARED_STORAGE_DIRS + APP_SPECIFIC_DIRS
        for (relPath in allDirs) {
            val dir = File(extDir, relPath)
            if (!dir.exists() || !dir.isDirectory || !dir.canRead()) continue

            val files = dir.listFiles() ?: continue
            for (file in files) {
                handleCandidate(file)
            }

            // Also check one level of subdirectories — DJI sometimes nests by date
            for (sub in files.filter { it.isDirectory }) {
                val subFiles = sub.listFiles() ?: continue
                for (file in subFiles) {
                    handleCandidate(file)
                }
            }
        }
    }

    private fun handleCandidate(file: File) {
        if (!file.isFile) return
        if (file.length() == 0L) return

        val ext = file.extension.lowercase()
        if (ext !in LOG_EXTENSIONS) return

        // Skip already-processed files
        val absPath = file.absolutePath
        if (absPath in processedFiles) return

        // Skip files older than when we started watching (unless ingestHistorical was called)
        if (file.lastModified() < watchStartTimeMs) return

        // Skip files still being written (modified within last 5 seconds)
        if (System.currentTimeMillis() - file.lastModified() < 5_000) {
            // File may still be open — we'll pick it up on the next poll
            return
        }

        Log.i(TAG, "New DJI flight log detected: ${file.name} (${file.length()} bytes)")
        processedFiles.add(absPath)
        onNewFlightLog(file)
    }
}
