package com.jads.notification

import android.content.Context
import android.util.Log
import androidx.work.*
import com.jads.network.ApiResult
import com.jads.network.JadsApiClient
import java.util.concurrent.TimeUnit

// ─────────────────────────────────────────────────────────────────────────────
// ExpiryReminderWorker — WorkManager periodic task that polls the backend
// for new notifications and shows local Android notifications for any unread
// items since the last check.
//
// Scheduling:
//   - Runs every 6 hours (configurable)
//   - Requires network connectivity
//   - Battery-optimised (no device wake for idle)
//   - Registered via ExpiryReminderWorker.schedule(context) on app startup
//
// Algorithm:
//   1. Fetch latest notifications from /api/drone/notifications?unread=true
//   2. For each unread notification, show a local Android notification
//   3. Device notification channels are managed by JADSNotificationManager
//
// Dependencies:
//   - JadsApiClient — uses stored base URL + JWT token from SharedPreferences
//   - JADSNotificationManager — creates OS-level notifications
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG = "ExpiryReminderWorker"
private const val WORK_NAME = "jads_expiry_reminder"

class ExpiryReminderWorker(
    context:       Context,
    workerParams:  WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        Log.d(TAG, "ExpiryReminderWorker starting")

        try {
            val prefs   = applicationContext.getSharedPreferences("jads_prefs", Context.MODE_PRIVATE)
            val baseUrl = prefs.getString("base_url", null)
            val token   = prefs.getString("jwt_token", null)

            if (baseUrl.isNullOrBlank() || token.isNullOrBlank()) {
                Log.d(TAG, "No credentials stored — skipping notification poll")
                return Result.success()
            }

            val client = JadsApiClient(baseUrl, token)
            val notifManager = JADSNotificationManager(applicationContext)

            // Fetch unread notifications
            val result = client.getNotifications(unreadOnly = true, limit = 10)

            when (result) {
                is ApiResult.Success -> {
                    val notifications = result.data.notifications
                    Log.d(TAG, "Fetched ${notifications.size} unread notifications")

                    // Show local notifications for each unread item
                    // (limit to 5 per cycle to avoid notification flood)
                    notifications.take(5).forEach { notif ->
                        notifManager.showNotification(
                            title = notif.title,
                            body  = notif.body,
                            type  = notif.type
                        )
                    }

                    return Result.success()
                }
                is ApiResult.Error -> {
                    Log.w(TAG, "API error: ${result.code} ${result.message}")
                    return if (result.code == 401) Result.failure() else Result.retry()
                }
                is ApiResult.NetworkError -> {
                    Log.w(TAG, "Network error: ${result.message}")
                    return Result.retry()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "ExpiryReminderWorker failed", e)
            return Result.retry()
        }
    }

    companion object {
        /**
         * Schedule the periodic expiry reminder worker.
         * Call this once on app startup (e.g., in Application.onCreate or MainActivity.onCreate).
         * WorkManager will de-duplicate — multiple calls are safe.
         */
        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<ExpiryReminderWorker>(
                6, TimeUnit.HOURS     // repeat interval
            )
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    PeriodicWorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .build()

            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(
                    WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,  // keep existing schedule if already enqueued
                    request
                )

            Log.d(TAG, "ExpiryReminderWorker scheduled (6h interval)")
        }

        /**
         * Cancel the periodic worker. Call on sign-out.
         */
        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            Log.d(TAG, "ExpiryReminderWorker cancelled")
        }
    }
}
