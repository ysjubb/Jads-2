package com.jads.upload

import android.content.Context
import androidx.work.*
import com.jads.network.UploadResult

// MissionUploadWorker — WorkManager worker for background mission upload.
//
// Enqueued by MissionForegroundService after mission finalization.
// WorkManager handles retry, backoff, and network availability automatically.
//
// Constraints: requires network. No battery constraint — pilots need the upload
// to complete even on degraded battery (mission data must not be lost).
//
// On AUTH_EXPIRED: worker returns FAILURE (no retry) — operator must re-login.
// On NETWORK_FAILURE: returns RETRY — WorkManager retries with exponential backoff.
// On FAILURE (server error): returns FAILURE after max attempts.

class MissionUploadWorker(
    context: Context,
    params:  WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val missionDbId = inputData.getLong(KEY_MISSION_DB_ID, -1L)
        if (missionDbId == -1L) return Result.failure()

        val container = (applicationContext as? com.jads.AppContainer.Provider)
            ?.appContainer ?: return Result.failure()

        return when (val result = container.uploadService.uploadMission(missionDbId)) {
            is UploadResult.Accepted      -> Result.success()
            is UploadResult.AlreadyUploaded -> Result.success()
            is UploadResult.AuthExpired   -> Result.failure()    // operator must re-login
            is UploadResult.NetworkFailure -> Result.retry()
            is UploadResult.Failure       -> {
                if (runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.failure()
            }
        }
    }

    companion object {
        const val KEY_MISSION_DB_ID = "mission_db_id"
        const val MAX_ATTEMPTS      = 5
        const val UNIQUE_TAG        = "jads_mission_upload"

        fun enqueue(context: Context, missionDbId: Long) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val inputData = workDataOf(KEY_MISSION_DB_ID to missionDbId)

            val request = OneTimeWorkRequestBuilder<MissionUploadWorker>()
                .setConstraints(constraints)
                .setInputData(inputData)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, java.util.concurrent.TimeUnit.SECONDS)
                .addTag("$UNIQUE_TAG:$missionDbId")
                .build()

            WorkManager.getInstance(context).enqueue(request)
        }
    }
}
