package com.jads.dji

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream

// DjiShareReceiverActivity — zero-UI activity that receives files shared from DJI Fly.
//
// When the user taps "Share" in DJI Fly → Flight Records and picks JADS,
// Android launches this activity with ACTION_SEND or ACTION_SEND_MULTIPLE.
// We copy the shared file to our private storage and feed it to the ingestion pipeline.
//
// No UI is shown — just a toast confirmation. The activity finishes immediately.
//
// This is the KEY path for Android 13+ where auto-detection of DJI Fly's
// app-specific storage is blocked. The user's one-time action is:
//   DJI Fly → Flight Records → (long press) → Share → JADS
// Everything after that is automatic.

class DjiShareReceiverActivity : ComponentActivity() {

    companion object {
        private const val TAG = "DjiShareReceiver"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        when (intent?.action) {
            Intent.ACTION_SEND -> handleSingleFile(intent)
            Intent.ACTION_SEND_MULTIPLE -> handleMultipleFiles(intent)
            else -> {
                Log.w(TAG, "Unexpected intent action: ${intent?.action}")
                finish()
            }
        }
    }

    private fun handleSingleFile(intent: Intent) {
        val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        if (uri == null) {
            Toast.makeText(this, "No file received", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        processUri(uri)
        finish()
    }

    private fun handleMultipleFiles(intent: Intent) {
        val uris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
        if (uris.isNullOrEmpty()) {
            Toast.makeText(this, "No files received", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        for (uri in uris) {
            processUri(uri)
        }
        finish()
    }

    private fun processUri(uri: Uri) {
        try {
            // Copy the shared file to our private cache directory.
            // We can't pass content:// URIs to FileObserver or File-based parsers.
            val inputStream = contentResolver.openInputStream(uri)
            if (inputStream == null) {
                Log.w(TAG, "Cannot open input stream for: $uri")
                return
            }

            // Derive a filename from the URI
            val fileName = getFileName(uri) ?: "dji_flight_log_${System.currentTimeMillis()}.txt"
            val cacheDir = File(cacheDir, "dji_imports")
            cacheDir.mkdirs()
            val localFile = File(cacheDir, fileName)

            FileOutputStream(localFile).use { output ->
                inputStream.copyTo(output)
            }
            inputStream.close()

            Log.i(TAG, "File copied to: ${localFile.absolutePath} (${localFile.length()} bytes)")
            Toast.makeText(this, "JADS: Ingesting flight log...", Toast.LENGTH_SHORT).show()

            // Feed to ingestion pipeline
            val app = application as com.jads.JadsApplication
            app.appContainer.djiLogWatcher.ingestFile(localFile)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to process shared file: $uri", e)
            Toast.makeText(this, "JADS: Failed to read flight log", Toast.LENGTH_SHORT).show()
        }
    }

    private fun getFileName(uri: Uri): String? {
        // Try content resolver query first
        try {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0 && cursor.moveToFirst()) {
                    return cursor.getString(nameIndex)
                }
            }
        } catch (_: Exception) {}

        // Fall back to URI path segment
        return uri.lastPathSegment
    }
}
