package com.jads.network

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ─────────────────────────────────────────────────────────────────────────────
// EgcaDataSource — local cache for Permission Artefact (PA) ZIP files.
//
// PA ZIPs are downloaded from eGCA after a flight permission is approved.
// They contain signed XML used for NPNT (No Permission No Takeoff) compliance.
//
// Storage location:
//   {app internal files dir}/permits/PA_{applicationId}_{yyyyMMdd}.zip
//
// The cache is keyed by applicationId. Only the latest PA for each application
// is kept — previous versions are overwritten (a new approval replaces the old).
//
// Thread safety:
//   File I/O is performed on caller's dispatcher (expected: Dispatchers.IO).
//   No internal synchronisation — callers serialise if needed.
//
// SECURITY:
//   - Files are stored in the app's internal files directory (getFilesDir()).
//   - Not accessible to other apps (unless device is rooted).
//   - No sensitive data in filenames (applicationId is a DGCA reference number).
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG         = "EgcaDataSource"
private const val PERMITS_DIR = "permits"

class EgcaDataSource(context: Context) {

    private val permitsDir: File = File(context.filesDir, PERMITS_DIR).also { dir ->
        if (!dir.exists()) {
            val created = dir.mkdirs()
            if (created) {
                Log.d(TAG, "Created permits cache directory: ${dir.absolutePath}")
            } else {
                Log.w(TAG, "Failed to create permits directory: ${dir.absolutePath}")
            }
        }
    }

    private val dateFormat = SimpleDateFormat("yyyyMMdd", Locale.US)

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Cache a PA ZIP file for the given application.
     *
     * Filename: PA_{applicationId}_{yyyyMMdd}.zip
     * Previous PA files for the same applicationId are deleted first.
     *
     * @param applicationId eGCA application reference (e.g. "FP-2026-00123")
     * @param data          raw bytes of the PA ZIP downloaded from eGCA
     */
    fun cachePA(applicationId: String, data: ByteArray) {
        val sanitizedId = sanitizeId(applicationId)
        val dateSuffix  = dateFormat.format(Date())
        val fileName    = "PA_${sanitizedId}_${dateSuffix}.zip"

        // Remove any existing PA files for this application.
        deleteExistingPAs(sanitizedId)

        val file = File(permitsDir, fileName)
        try {
            file.writeBytes(data)
            Log.i(TAG, "Cached PA: $fileName (${data.size} bytes)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cache PA $fileName: ${e.message}", e)
        }
    }

    /**
     * Load a cached PA ZIP for the given application.
     *
     * Returns the most recent cached PA file, or null if none exists.
     *
     * @param applicationId eGCA application reference
     * @return raw bytes of the cached PA ZIP, or null
     */
    fun loadCachedPA(applicationId: String): ByteArray? {
        val sanitizedId = sanitizeId(applicationId)
        val prefix      = "PA_${sanitizedId}_"

        val paFile = permitsDir.listFiles { _, name ->
            name.startsWith(prefix) && name.endsWith(".zip")
        }
            ?.maxByOrNull { it.lastModified() }  // most recent if multiple exist

        return if (paFile != null && paFile.exists()) {
            try {
                val data = paFile.readBytes()
                Log.d(TAG, "Loaded cached PA: ${paFile.name} (${data.size} bytes)")
                data
            } catch (e: Exception) {
                Log.e(TAG, "Failed to read cached PA ${paFile.name}: ${e.message}", e)
                null
            }
        } else {
            Log.d(TAG, "No cached PA found for applicationId=$applicationId")
            null
        }
    }

    /**
     * Check if a cached PA exists for the given application.
     */
    fun hasCachedPA(applicationId: String): Boolean {
        val sanitizedId = sanitizeId(applicationId)
        val prefix      = "PA_${sanitizedId}_"

        return permitsDir.listFiles { _, name ->
            name.startsWith(prefix) && name.endsWith(".zip")
        }?.isNotEmpty() == true
    }

    /**
     * Delete all cached PA files for the given application.
     * Called before caching a new version, or on explicit cleanup.
     */
    fun deleteCachedPA(applicationId: String) {
        deleteExistingPAs(sanitizeId(applicationId))
    }

    /**
     * Delete all cached PA files (e.g. on logout or storage cleanup).
     * Returns the number of files deleted.
     */
    fun clearAllCachedPAs(): Int {
        val files = permitsDir.listFiles { _, name ->
            name.startsWith("PA_") && name.endsWith(".zip")
        } ?: return 0

        var deleted = 0
        for (file in files) {
            if (file.delete()) deleted++
        }
        Log.i(TAG, "Cleared $deleted cached PA files")
        return deleted
    }

    /**
     * Get the file path of the cached PA for the given application, or null.
     * Useful if the caller wants to pass the file to an intent or content provider.
     */
    fun getCachedPAFile(applicationId: String): File? {
        val sanitizedId = sanitizeId(applicationId)
        val prefix      = "PA_${sanitizedId}_"

        return permitsDir.listFiles { _, name ->
            name.startsWith(prefix) && name.endsWith(".zip")
        }?.maxByOrNull { it.lastModified() }
    }

    // ── Private helpers ─────────────────────────────────────────────────────

    /**
     * Delete existing PA files for an application (all date variants).
     */
    private fun deleteExistingPAs(sanitizedId: String) {
        val prefix = "PA_${sanitizedId}_"
        val existing = permitsDir.listFiles { _, name ->
            name.startsWith(prefix) && name.endsWith(".zip")
        } ?: return

        for (file in existing) {
            if (file.delete()) {
                Log.d(TAG, "Deleted previous PA: ${file.name}")
            }
        }
    }

    /**
     * Sanitise the applicationId for use in filenames.
     * Replaces characters that are unsafe in filenames with underscores.
     */
    private fun sanitizeId(applicationId: String): String {
        return applicationId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
    }
}
