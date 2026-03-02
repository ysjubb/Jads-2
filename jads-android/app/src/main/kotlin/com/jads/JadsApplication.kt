package com.jads

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class JadsApplication : Application(), AppContainer.Provider {

    override lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()

        // 1. SQLCipher MUST be initialised before any DB open call.
        net.sqlcipher.database.SQLiteDatabase.loadLibs(this)

        // 2. AppContainer — manual singleton wiring.
        appContainer = AppContainer(applicationContext)

        // 3. Notification channel for foreground service.
        createMissionNotificationChannel()
    }

    private fun createMissionNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                getString(R.string.channel_mission_id),
                getString(R.string.channel_mission_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows while a JADS drone mission is actively recording"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }
}
