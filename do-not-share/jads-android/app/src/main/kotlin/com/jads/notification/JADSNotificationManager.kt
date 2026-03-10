package com.jads.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.jads.R
import com.jads.ui.MainActivity

// ─────────────────────────────────────────────────────────────────────────────
// JADSNotificationManager — manages Android notification channels and sends
// local device notifications for JADS alert categories.
//
// Channels:
//   1. PERMISSIONS — PA lifecycle events (approved, rejected, revoked, downloaded)
//   2. EXPIRY     — licence/UIN/PA expiry countdown alerts
//   3. VIOLATIONS — geofence breaches, compliance warnings, system broadcasts
//
// All channels are created on first use (idempotent on Android O+).
// Each notification includes a PendingIntent to open the NotificationScreen.
// ─────────────────────────────────────────────────────────────────────────────

class JADSNotificationManager(private val context: Context) {

    companion object {
        const val CHANNEL_PERMISSIONS = "jads_permissions"
        const val CHANNEL_EXPIRY      = "jads_expiry"
        const val CHANNEL_VIOLATIONS  = "jads_violations"

        private var nextNotificationId = 1000

        private fun nextId(): Int = nextNotificationId++
    }

    private val notificationManager: NotificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    init {
        createChannels()
    }

    // ── Channel creation (O+) ────────────────────────────────────────────

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channels = listOf(
            NotificationChannel(
                CHANNEL_PERMISSIONS,
                "Permission Artefacts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "PA approval, rejection, download, and revocation events"
            },
            NotificationChannel(
                CHANNEL_EXPIRY,
                "Expiry Reminders",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Licence, UIN, and PA expiry countdown alerts"
            },
            NotificationChannel(
                CHANNEL_VIOLATIONS,
                "Violations & Compliance",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Airspace violations, compliance warnings, and system alerts"
            }
        )

        channels.forEach { notificationManager.createNotificationChannel(it) }
    }

    // ── Resolve channel from notification type ───────────────────────────

    fun resolveChannel(type: String): String = when {
        type.startsWith("PERMISSION") -> CHANNEL_PERMISSIONS
        type.startsWith("EXPIRY")     -> CHANNEL_EXPIRY
        else                          -> CHANNEL_VIOLATIONS
    }

    // ── Send a local notification ────────────────────────────────────────

    fun showNotification(
        title:   String,
        body:    String,
        type:    String,
        notifId: Int = nextId()
    ) {
        val channel = resolveChannel(type)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("navigate_to", "notifications")
        }

        val pendingIntent = PendingIntent.getActivity(
            context, notifId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val icon = when (channel) {
            CHANNEL_PERMISSIONS -> android.R.drawable.ic_lock_idle_lock
            CHANNEL_EXPIRY      -> android.R.drawable.ic_dialog_alert
            CHANNEL_VIOLATIONS  -> android.R.drawable.stat_notify_error
            else                -> android.R.drawable.ic_dialog_info
        }

        val notification = NotificationCompat.Builder(context, channel)
            .setSmallIcon(icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(
                if (channel == CHANNEL_VIOLATIONS || channel == CHANNEL_PERMISSIONS)
                    NotificationCompat.PRIORITY_HIGH
                else
                    NotificationCompat.PRIORITY_DEFAULT
            )
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notify(notifId, notification)
    }

    // ── Convenience methods ──────────────────────────────────────────────

    fun showPermissionNotification(title: String, body: String) {
        showNotification(title, body, "PERMISSION_EVENT")
    }

    fun showExpiryReminder(title: String, body: String) {
        showNotification(title, body, "EXPIRY_REMINDER")
    }

    fun showViolationAlert(title: String, body: String) {
        showNotification(title, body, "VIOLATION_DETECTED")
    }
}
