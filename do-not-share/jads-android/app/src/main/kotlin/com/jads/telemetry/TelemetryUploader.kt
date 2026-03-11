// T04 — Queues telemetry points and batch-uploads to JADS backend
package com.jads.telemetry

import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.LinkedBlockingQueue

class TelemetryUploader(
    private val backendUrl: String,
    private val missionId: String,
    private val authToken: String
) {
    private val queue = LinkedBlockingQueue<TelemetryPointDto>(500)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var running = false

    fun start() {
        running = true
        scope.launch {
            while (isActive && running) {
                val batch = mutableListOf<TelemetryPointDto>()
                // Drain up to 5 points per upload cycle
                repeat(5) { queue.poll()?.let { batch.add(it) } }
                if (batch.isNotEmpty()) uploadBatch(batch)
                delay(1000) // upload every 1 second
            }
        }
    }

    fun stop() {
        running = false
        scope.cancel()
    }

    fun enqueue(point: TelemetryPointDto) {
        queue.offer(point)
    }

    private fun uploadBatch(batch: List<TelemetryPointDto>) {
        try {
            val url = URL("$backendUrl/api/missions/$missionId/telemetry")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $authToken")
            conn.setRequestProperty("X-JADS-Version", "4.0")
            conn.connectTimeout = 10000
            conn.readTimeout = 10000
            conn.doOutput = true
            val body = Json.encodeToString(mapOf("points" to batch))
            conn.outputStream.write(body.toByteArray())
            conn.responseCode // trigger send
            conn.disconnect()
        } catch (e: Exception) {
            // Silently re-queue for retry — field may have intermittent connectivity
            batch.forEach { queue.offer(it) }
        }
    }
}
