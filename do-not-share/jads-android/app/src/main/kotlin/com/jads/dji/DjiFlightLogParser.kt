package com.jads.dji

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.reflect.TypeToken
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

// DjiFlightLogParser — extracts GPS telemetry from DJI flight log files.
//
// DJI drones produce flight logs in multiple formats depending on the app
// (DJI Fly, DJI Pilot 2) and drone generation:
//
//   Format 1: Binary .txt (v12-v14 encryption) — newest drones
//     - AES-encrypted binary with plaintext header containing metadata
//     - Header has: model, serial, GPS home point, timestamps
//     - Encrypted body requires drone-specific decryption key
//     - We extract what we can from the plaintext header + GPS records
//
//   Format 2: CSV export — user-exported from DJI Fly
//     - Plain CSV with lat, lon, altitude, speed, battery, timestamp columns
//     - Most reliable and complete data source
//
//   Format 3: JSON flight record — DJI FlightRecord API format
//     - JSON with flight path coordinates, timestamps, drone info
//     - Written by some DJI apps alongside the binary log
//
// Strategy: try each parser in order (CSV → JSON → binary header).
// Return whatever telemetry we can extract.

data class DjiTelemetryRecord(
    val timestampMs:    Long,       // UTC milliseconds
    val latitudeDeg:    Double,     // WGS84 decimal degrees
    val longitudeDeg:   Double,     // WGS84 decimal degrees
    val altitudeM:      Double,     // meters above takeoff point (relative)
    val speedMs:        Double,     // ground speed in m/s
    val headingDeg:     Double,     // compass heading 0-360
    val batteryPercent: Int,        // 0-100
    val satelliteCount: Int,        // GPS satellite count
    val velNorthMs:     Double,     // northward velocity m/s (0 if unavailable)
    val velEastMs:      Double,     // eastward velocity m/s (0 if unavailable)
    val velDownMs:      Double,     // downward velocity m/s (0 if unavailable — positive = descending)
)

data class DjiFlightMetadata(
    val droneModel:     String,
    val serialNumber:   String,
    val homeLatDeg:     Double,
    val homeLonDeg:     Double,
    val flightStartMs:  Long,       // UTC ms
    val flightEndMs:    Long,       // UTC ms
    val sourceFormat:   String,     // "CSV", "JSON", "BINARY_HEADER"
    val sourceFile:     String,     // original file name
)

data class DjiFlightLog(
    val metadata:  DjiFlightMetadata,
    val records:   List<DjiTelemetryRecord>,
)

object DjiFlightLogParser {

    private const val TAG = "DjiLogParser"

    /**
     * Parse a DJI flight log file. Tries all formats automatically.
     * Returns null if the file cannot be parsed.
     */
    fun parse(file: File): DjiFlightLog? {
        Log.i(TAG, "Attempting to parse: ${file.name} (${file.length()} bytes)")

        // Try CSV first (most reliable)
        if (file.extension.equals("csv", ignoreCase = true)) {
            return parseCsv(file)
        }

        // Try JSON
        if (file.extension.equals("json", ignoreCase = true)) {
            return parseJson(file)
        }

        // For .txt files: try as CSV first (some exports use .txt extension),
        // then try JSON, then try binary header extraction.
        return parseCsv(file)
            ?: parseJson(file)
            ?: parseBinaryHeader(file)
    }

    // ── CSV Parser ───────────────────────────────────────────────────────────
    // Handles both DJI Fly CSV export and third-party converted logs.
    //
    // Expected columns (case-insensitive, flexible matching):
    //   datetime/time/timestamp, latitude/lat, longitude/lon/lng,
    //   altitude/height/alt, speed, heading/compass, battery,
    //   satellites/gps_num, velocity_x/vx, velocity_y/vy, velocity_z/vz

    private fun parseCsv(file: File): DjiFlightLog? {
        return try {
            val lines = file.readLines()
            if (lines.size < 2) return null

            val header = lines[0].lowercase()
            val columns = header.split(",").map { it.trim() }

            // Find column indices by fuzzy name matching
            val iLat      = findColumn(columns, "latitude", "lat", "gps.lat", "osd.latitude")
            val iLon      = findColumn(columns, "longitude", "lon", "lng", "gps.lon", "gps.lng", "osd.longitude")
            val iAlt      = findColumn(columns, "altitude", "height", "alt", "osd.altitude", "gps.altitude")
            val iTime     = findColumn(columns, "datetime", "time", "timestamp", "offsettime", "clock.time")
            val iSpeed    = findColumn(columns, "speed", "groundspeed", "osd.hspeed")
            val iHeading  = findColumn(columns, "heading", "compass", "yaw", "osd.yaw")
            val iBattery  = findColumn(columns, "battery", "bat", "capacitypercent", "osd.capacitypercent", "battery.capacitypercent")
            val iSats     = findColumn(columns, "satellites", "gps_num", "gpsnum", "osd.gpsnum")
            val iVx       = findColumn(columns, "velocity_x", "vx", "xspeed", "osd.xspeed")
            val iVy       = findColumn(columns, "velocity_y", "vy", "yspeed", "osd.yspeed")
            val iVz       = findColumn(columns, "velocity_z", "vz", "zspeed", "osd.zspeed")

            if (iLat == -1 || iLon == -1) {
                Log.d(TAG, "CSV missing lat/lon columns. Header: $header")
                return null
            }

            val records = mutableListOf<DjiTelemetryRecord>()
            var firstTimestamp = Long.MAX_VALUE
            var lastTimestamp = 0L

            for (i in 1 until lines.size) {
                val cols = lines[i].split(",").map { it.trim() }
                if (cols.size <= maxOf(iLat, iLon)) continue

                val lat = cols.getOrNull(iLat)?.toDoubleOrNull() ?: continue
                val lon = cols.getOrNull(iLon)?.toDoubleOrNull() ?: continue

                // Skip zero coordinates (no GPS fix)
                if (lat == 0.0 && lon == 0.0) continue
                // Skip clearly invalid coordinates
                if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue

                val alt     = if (iAlt != -1)     cols.getOrNull(iAlt)?.toDoubleOrNull() ?: 0.0     else 0.0
                val speed   = if (iSpeed != -1)   cols.getOrNull(iSpeed)?.toDoubleOrNull() ?: 0.0   else 0.0
                val heading = if (iHeading != -1)  cols.getOrNull(iHeading)?.toDoubleOrNull() ?: 0.0 else 0.0
                val battery = if (iBattery != -1) cols.getOrNull(iBattery)?.toIntOrNull() ?: 100     else 100
                val sats    = if (iSats != -1)    cols.getOrNull(iSats)?.toIntOrNull() ?: 12         else 12
                val vx      = if (iVx != -1)      cols.getOrNull(iVx)?.toDoubleOrNull() ?: 0.0      else 0.0
                val vy      = if (iVy != -1)      cols.getOrNull(iVy)?.toDoubleOrNull() ?: 0.0      else 0.0
                val vz      = if (iVz != -1)      cols.getOrNull(iVz)?.toDoubleOrNull() ?: 0.0      else 0.0

                // Parse timestamp — try multiple formats
                val ts = if (iTime != -1) parseTimestamp(cols.getOrNull(iTime)) else null
                val timestamp = ts ?: (file.lastModified() + (i * 100L))  // fallback: 100ms intervals

                if (timestamp < firstTimestamp) firstTimestamp = timestamp
                if (timestamp > lastTimestamp) lastTimestamp = timestamp

                records.add(DjiTelemetryRecord(
                    timestampMs    = timestamp,
                    latitudeDeg    = lat,
                    longitudeDeg   = lon,
                    altitudeM      = alt,
                    speedMs        = speed,
                    headingDeg     = heading,
                    batteryPercent = battery,
                    satelliteCount = sats,
                    velNorthMs     = vx,    // DJI CSV: x = north in NED frame
                    velEastMs      = vy,    // y = east
                    velDownMs      = vz,    // z = down
                ))
            }

            if (records.isEmpty()) {
                Log.d(TAG, "CSV parsed but no valid GPS records found")
                return null
            }

            if (firstTimestamp == Long.MAX_VALUE) firstTimestamp = file.lastModified()
            if (lastTimestamp == 0L) lastTimestamp = firstTimestamp + (records.size * 100L)

            Log.i(TAG, "CSV parsed: ${records.size} records, ${(lastTimestamp - firstTimestamp) / 1000}s duration")

            DjiFlightLog(
                metadata = DjiFlightMetadata(
                    droneModel    = "DJI (CSV import)",
                    serialNumber  = "CSV_${file.nameWithoutExtension}",
                    homeLatDeg    = records.first().latitudeDeg,
                    homeLonDeg    = records.first().longitudeDeg,
                    flightStartMs = firstTimestamp,
                    flightEndMs   = lastTimestamp,
                    sourceFormat  = "CSV",
                    sourceFile    = file.name,
                ),
                records = records,
            )
        } catch (e: Exception) {
            Log.w(TAG, "CSV parse failed: ${e.message}")
            null
        }
    }

    // ── JSON Parser ──────────────────────────────────────────────────────────
    // Handles DJI FlightRecord JSON format and DJI Cloud API OSD JSON.
    //
    // DJI FlightRecord JSON typically looks like:
    // {
    //   "droneType": "...",
    //   "serialNumber": "...",
    //   "flightRecords": [
    //     { "latitude": 28.6, "longitude": 77.2, "altitude": 50, "timestamp": 1709..., ... }
    //   ]
    // }

    private fun parseJson(file: File): DjiFlightLog? {
        return try {
            val text = file.readText()
            if (!text.trimStart().startsWith("{") && !text.trimStart().startsWith("[")) {
                return null  // Not JSON
            }

            val root = JsonParser.parseString(text)

            // Case 1: Array of coordinate objects (simplest format)
            if (root.isJsonArray) {
                return parseJsonArray(root.asJsonArray.map { it.asJsonObject }, file)
            }

            val obj = root.asJsonObject

            // Case 2: Object with a "flightRecords" or "records" or "data" array
            val recordsKey = listOf("flightRecords", "records", "data", "flightPath", "points", "trajectory")
                .firstOrNull { obj.has(it) && obj.get(it).isJsonArray }

            if (recordsKey != null) {
                val arr = obj.getAsJsonArray(recordsKey).map { it.asJsonObject }
                val model  = obj.getStr("droneType", "droneModel", "model", "aircraft") ?: "DJI (JSON)"
                val serial = obj.getStr("serialNumber", "sn", "serial") ?: "JSON_${file.nameWithoutExtension}"
                return parseJsonArray(arr, file, model, serial)
            }

            // Case 3: Single OSD-style object (Cloud API format)
            if (obj.has("latitude") && obj.has("longitude")) {
                val rec = parseJsonRecord(obj) ?: return null
                return DjiFlightLog(
                    metadata = DjiFlightMetadata(
                        droneModel    = "DJI (OSD)",
                        serialNumber  = obj.getStr("sn", "serial") ?: "OSD_${file.nameWithoutExtension}",
                        homeLatDeg    = rec.latitudeDeg,
                        homeLonDeg    = rec.longitudeDeg,
                        flightStartMs = rec.timestampMs,
                        flightEndMs   = rec.timestampMs,
                        sourceFormat  = "JSON",
                        sourceFile    = file.name,
                    ),
                    records = listOf(rec),
                )
            }

            Log.d(TAG, "JSON file does not match any known DJI format")
            null
        } catch (e: Exception) {
            Log.w(TAG, "JSON parse failed: ${e.message}")
            null
        }
    }

    private fun parseJsonArray(
        arr: List<JsonObject>,
        file: File,
        model: String = "DJI (JSON)",
        serial: String = "JSON_${file.nameWithoutExtension}"
    ): DjiFlightLog? {
        val records = arr.mapNotNull { parseJsonRecord(it) }
        if (records.isEmpty()) return null

        Log.i(TAG, "JSON parsed: ${records.size} records")

        return DjiFlightLog(
            metadata = DjiFlightMetadata(
                droneModel    = model,
                serialNumber  = serial,
                homeLatDeg    = records.first().latitudeDeg,
                homeLonDeg    = records.first().longitudeDeg,
                flightStartMs = records.first().timestampMs,
                flightEndMs   = records.last().timestampMs,
                sourceFormat  = "JSON",
                sourceFile    = file.name,
            ),
            records = records,
        )
    }

    private fun parseJsonRecord(obj: JsonObject): DjiTelemetryRecord? {
        val lat = obj.getNum("latitude", "lat", "gps_lat") ?: return null
        val lon = obj.getNum("longitude", "lon", "lng", "gps_lon", "gps_lng") ?: return null
        if (lat == 0.0 && lon == 0.0) return null

        return DjiTelemetryRecord(
            timestampMs    = obj.getNum("timestamp", "time", "timestampMs", "ts")?.toLong()
                ?: System.currentTimeMillis(),
            latitudeDeg    = lat,
            longitudeDeg   = lon,
            altitudeM      = obj.getNum("altitude", "height", "alt", "elevation") ?: 0.0,
            speedMs        = obj.getNum("speed", "horizontal_speed", "groundSpeed") ?: 0.0,
            headingDeg     = obj.getNum("heading", "yaw", "compass") ?: 0.0,
            batteryPercent = obj.getNum("battery", "batteryPercent", "capacity_percent")?.toInt() ?: 100,
            satelliteCount = obj.getNum("satellites", "gps_number", "gpsNum")?.toInt() ?: 12,
            velNorthMs     = obj.getNum("vx", "velocity_x", "xSpeed") ?: 0.0,
            velEastMs      = obj.getNum("vy", "velocity_y", "ySpeed") ?: 0.0,
            velDownMs      = obj.getNum("vz", "velocity_z", "zSpeed") ?: 0.0,
        )
    }

    // ── Binary Header Parser ─────────────────────────────────────────────────
    // DJI .txt flight logs (v12-v14) are encrypted binary.
    // The file header (~100-400 bytes) is plaintext and contains:
    //   - Magic bytes identifying the format version
    //   - Drone model identifier
    //   - Start time / end time
    //   - Home GPS coordinates (lat/lon)
    //   - City name
    //   - Sometimes: total distance, max altitude, max speed
    //
    // We extract metadata from the header even when we can't decrypt the body.
    // If the header contains a home GPS coordinate, we create a single-record
    // "mission" representing the takeoff/landing location. This is minimal but
    // still proves the DJI integration pipeline works.
    //
    // For full decryption of the binary body, use the dji-log-parser Rust crate
    // or the TXTlogToCSVtool Python script to pre-convert to CSV.

    private fun parseBinaryHeader(file: File): DjiFlightLog? {
        return try {
            val raf = RandomAccessFile(file, "r")
            if (raf.length() < 100) {
                raf.close()
                return null
            }

            // Read first 1024 bytes for header inspection
            val headerSize = minOf(1024, raf.length().toInt())
            val header = ByteArray(headerSize)
            raf.readFully(header)
            raf.close()

            // Detect format version from magic bytes
            val version = detectVersion(header)
            if (version == 0) {
                Log.d(TAG, "Unknown binary format — not a recognized DJI flight log")
                return null
            }

            Log.i(TAG, "DJI binary log detected, format version: $version")

            // Extract what we can from the plaintext header.
            // DJI v13+ logs have a JSON-like header section before the encrypted body.
            // Look for the JSON fragment in the header bytes.
            val headerText = extractPrintableStrings(header)
            var model = "DJI (binary v$version)"
            var serial = "BIN_${file.nameWithoutExtension}"
            var homeLat = 0.0
            var homeLon = 0.0
            var startTime = file.lastModified()

            // Try to find JSON fragment in header
            val jsonStart = headerText.indexOf('{')
            val jsonEnd = headerText.lastIndexOf('}')
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                try {
                    val jsonFragment = headerText.substring(jsonStart, jsonEnd + 1)
                    val obj = JsonParser.parseString(jsonFragment).asJsonObject
                    model = obj.getStr("droneType", "aircraftName", "model") ?: model
                    serial = obj.getStr("aircraftSn", "serialNumber", "sn") ?: serial
                    homeLat = obj.getNum("latitude", "homeLat", "homeLatitude") ?: homeLat
                    homeLon = obj.getNum("longitude", "homeLon", "homeLongitude") ?: homeLon
                    val ts = obj.getNum("startTime", "timestamp")?.toLong()
                    if (ts != null) startTime = ts
                } catch (_: Exception) {
                    // JSON extraction failed — continue with defaults
                }
            }

            // Also try reading doubles at known offsets (DJI v12 format)
            // In v12, home lat/lon are little-endian doubles at offset ~32-48
            if (homeLat == 0.0 && homeLon == 0.0 && header.size >= 48) {
                val buf = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN)
                val candidateLat = buf.getDouble(32)
                val candidateLon = buf.getDouble(40)
                // Sanity check — must be plausible coordinates
                if (candidateLat in -90.0..90.0 && candidateLon in -180.0..180.0 &&
                    (candidateLat != 0.0 || candidateLon != 0.0)) {
                    homeLat = candidateLat
                    homeLon = candidateLon
                }
            }

            if (homeLat == 0.0 && homeLon == 0.0) {
                Log.w(TAG, "Binary header parsed but no GPS coordinates found. " +
                        "Convert to CSV using TXTlogToCSVtool or dji-log-parser for full data extraction.")
                return null
            }

            Log.i(TAG, "Binary header: model=$model, serial=$serial, home=($homeLat, $homeLon)")

            // Create a minimal single-record flight log from the header data.
            // This proves the pipeline works. For full data, convert to CSV first.
            val record = DjiTelemetryRecord(
                timestampMs    = startTime,
                latitudeDeg    = homeLat,
                longitudeDeg   = homeLon,
                altitudeM      = 0.0,
                speedMs        = 0.0,
                headingDeg     = 0.0,
                batteryPercent = 100,
                satelliteCount = 12,
                velNorthMs     = 0.0,
                velEastMs      = 0.0,
                velDownMs      = 0.0,
            )

            DjiFlightLog(
                metadata = DjiFlightMetadata(
                    droneModel    = model,
                    serialNumber  = serial,
                    homeLatDeg    = homeLat,
                    homeLonDeg    = homeLon,
                    flightStartMs = startTime,
                    flightEndMs   = startTime + 60_000,  // assume 1 minute if unknown
                    sourceFormat  = "BINARY_HEADER",
                    sourceFile    = file.name,
                ),
                records = listOf(record),
            )
        } catch (e: Exception) {
            Log.w(TAG, "Binary header parse failed: ${e.message}")
            null
        }
    }

    // DJI log format detection based on file header magic bytes
    private fun detectVersion(header: ByteArray): Int {
        if (header.size < 4) return 0

        // v14 (DJI Fly 1.9+): starts with bytes 0x00 0x0E ...
        if (header[0] == 0x00.toByte() && header[1] == 0x0E.toByte()) return 14

        // v13 (DJI Fly 1.5+): starts with 0x00 0x0D ...
        if (header[0] == 0x00.toByte() && header[1] == 0x0D.toByte()) return 13

        // v12 (DJI GO 4 era): starts with specific magic
        if (header[0] == 0x00.toByte() && header[1] == 0x0C.toByte()) return 12

        // Older formats: check for "BUILD" or "FW" string in first 32 bytes
        val headerStr = String(header, 0, minOf(32, header.size), Charsets.US_ASCII)
        if (headerStr.contains("BUILD") || headerStr.contains("FW")) return 11

        return 0
    }

    // Extract printable ASCII/UTF-8 strings from binary data
    private fun extractPrintableStrings(data: ByteArray): String {
        val sb = StringBuilder()
        for (b in data) {
            val c = b.toInt() and 0xFF
            if (c in 0x20..0x7E || c == 0x0A || c == 0x0D) {
                sb.append(c.toChar())
            }
        }
        return sb.toString()
    }

    // ── Utility: timestamp parsing ───────────────────────────────────────────

    private fun parseTimestamp(value: String?): Long? {
        if (value == null) return null
        val trimmed = value.trim()

        // Try as epoch milliseconds
        trimmed.toLongOrNull()?.let { if (it > 1_000_000_000_000L) return it }

        // Try as epoch seconds
        trimmed.toDoubleOrNull()?.let {
            if (it > 1_000_000_000 && it < 2_000_000_000) return (it * 1000).toLong()
        }

        // Try ISO 8601 format: 2024-03-05T10:30:00Z or 2024-03-05 10:30:00
        try {
            val format = if (trimmed.contains('T'))
                java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
            else
                java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
            format.timeZone = java.util.TimeZone.getTimeZone("UTC")
            return format.parse(trimmed)?.time
        } catch (_: Exception) {}

        // Try DJI offset format: "123.4" seconds from start
        trimmed.toDoubleOrNull()?.let {
            if (it >= 0 && it < 86400) return null  // Relative offset — caller needs base time
        }

        return null
    }

    // ── Utility: JsonObject helpers ──────────────────────────────────────────

    private fun JsonObject.getStr(vararg keys: String): String? =
        keys.firstNotNullOfOrNull { key ->
            if (has(key) && get(key).isJsonPrimitive) get(key).asString else null
        }

    private fun JsonObject.getNum(vararg keys: String): Double? =
        keys.firstNotNullOfOrNull { key ->
            if (has(key) && get(key).isJsonPrimitive) {
                try { get(key).asDouble } catch (_: Exception) { null }
            } else null
        }

    // ── Utility: column finder for CSV ───────────────────────────────────────

    private fun findColumn(columns: List<String>, vararg candidates: String): Int {
        for (candidate in candidates) {
            val idx = columns.indexOfFirst { col ->
                col == candidate || col.replace(".", "").replace("_", "") ==
                    candidate.replace(".", "").replace("_", "")
            }
            if (idx >= 0) return idx
        }
        return -1
    }
}
