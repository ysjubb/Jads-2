package com.jads

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Environment
import android.util.Log

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

        // 4. Start DJI flight log auto-ingestion watcher.
        //    Only starts if MANAGE_EXTERNAL_STORAGE is granted (Android 11+)
        //    or READ_EXTERNAL_STORAGE is granted (Android 10).
        //    If not granted, the watcher is a no-op — MainActivity requests the
        //    permission at runtime and calls startDjiWatcher() afterward.
        startDjiWatcherIfPermitted()
    }

    /**
     * Start the DJI flight log watcher if storage permission is available.
     * Called from onCreate() and again from MainActivity after permission grant.
     */
    fun startDjiWatcherIfPermitted() {
        val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        }

        if (hasPermission) {
            Log.i("JADS", "Starting DJI flight log watcher — storage permission granted")
            appContainer.djiLogWatcher.start()
        } else {
            Log.i("JADS", "DJI watcher deferred — storage permission not yet granted")
        }
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
