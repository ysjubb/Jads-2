package com.jads.ui.viewmodel

import android.app.Application
import android.net.Uri
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jads.network.EgcaDataSource
import com.jads.network.EgcaRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// PAManagementViewModel -- drives the PAManagementScreen (P21).
//
// Responsibilities:
//   1. Hold lists of Permission Artefacts grouped by status
//      (APPROVED/ACTIVE, PENDING, COMPLETED)
//   2. Poll PENDING items every 60 seconds via EgcaRepository.getPermissionStatus()
//   3. Download PA ZIPs via EgcaRepository.downloadPermissionArtefact()
//      and cache locally via EgcaDataSource
//   4. Upload signed flight log bundles for COMPLETED missions
//   5. Expose detail bottom sheet state for any selected PA item
//
// Thread safety:
//   All MutableStateFlow writes happen on the main thread.
//   Network calls dispatch to IO via EgcaRepository internally.
//
// Dependencies:
//   EgcaRepository and EgcaDataSource are set externally via setDependencies(),
//   consistent with the codebase pattern (cf. YellowZoneViewModel.setEgcaRepository).
// ---------------------------------------------------------------------------

private const val TAG = "PAManagementVM"

/** Polling interval for PENDING status checks. */
private const val PENDING_POLL_INTERVAL_MS = 60_000L

// -- PA item status ----------------------------------------------------------
enum class PAStatus(val displayLabel: String) {
    PENDING("PENDING"),
    APPROVED("APPROVED"),
    ACTIVE("ACTIVE"),
    DOWNLOADED("DOWNLOADED"),
    EXPIRED("EXPIRED"),
    REJECTED("REJECTED"),
    COMPLETED("COMPLETED")
}

// -- Zone colour for display -------------------------------------------------
enum class ZoneColour { GREEN, YELLOW, RED }

// -- Data model for a single permission artefact item -----------------------
data class PAItem(
    val applicationId:   String,
    val referenceNumber: String?     = null,
    val status:          PAStatus    = PAStatus.PENDING,
    val zone:            ZoneColour  = ZoneColour.GREEN,
    val droneUin:        String      = "",
    val flightWindowStart: String    = "",   // "dd-MM-yyyy HH:mm:ss"
    val flightWindowEnd:   String    = "",
    val altitude:        Int         = 120,  // metres AGL
    val operationType:   String      = "",
    val pilotName:       String      = "",
    val polygon:         List<LatLng> = emptyList(),
    val remarks:         String?     = null,
    val submittedAt:     String      = "",
    val updatedAt:       String?     = null,
    val hasCachedPA:     Boolean     = false
)

// -- Actions on individual items --------------------------------------------
sealed class PAAction {
    data class DownloadPA(val applicationId: String) : PAAction()
    data class ShareToGCS(val applicationId: String) : PAAction()
}

// -- Flight log upload state ------------------------------------------------
sealed class LogUploadState {
    object Idle     : LogUploadState()
    object Loading  : LogUploadState()
    data class Success(val applicationId: String) : LogUploadState()
    data class Error(val message: String)         : LogUploadState()
}

// -- Overall UI state -------------------------------------------------------
data class PAManagementUiState(
    val activeItems:    List<PAItem>    = emptyList(),
    val pendingItems:   List<PAItem>    = emptyList(),
    val completedItems: List<PAItem>    = emptyList(),
    val isLoading:      Boolean         = false,
    val errorMessage:   String?         = null,

    // Detail bottom sheet
    val selectedItem:   PAItem?         = null,
    val showDetail:     Boolean         = false,

    // Download / share feedback
    val downloadingId:  String?         = null,

    // Flight log upload
    val uploadTarget:   PAItem?         = null,
    val logUploadState: LogUploadState  = LogUploadState.Idle
)

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

class PAManagementViewModel(application: Application) : AndroidViewModel(application) {

    private var egcaRepo:  EgcaRepository? = null
    private var egcaCache: EgcaDataSource? = null

    private val _state = MutableStateFlow(PAManagementUiState())
    val state: StateFlow<PAManagementUiState> = _state.asStateFlow()

    private var pollingJob: Job? = null

    // -- Dependency injection ------------------------------------------------

    /** Provide eGCA dependencies (called once from the composable / activity). */
    fun setDependencies(repo: EgcaRepository, cache: EgcaDataSource) {
        egcaRepo  = repo
        egcaCache = cache
    }

    // -- Loading / refresh ---------------------------------------------------

    /**
     * Load PA items. In a production app this would query a local Room table
     * of submitted applications. For now, callers add items via [addItem].
     */
    fun refresh() {
        _state.value = _state.value.copy(isLoading = true, errorMessage = null)
        // Re-check cached PA status for existing items
        val cache = egcaCache
        if (cache != null) {
            val updatedActive = _state.value.activeItems.map { item ->
                item.copy(hasCachedPA = cache.hasCachedPA(item.applicationId))
            }
            _state.value = _state.value.copy(
                activeItems = updatedActive,
                isLoading   = false
            )
        } else {
            _state.value = _state.value.copy(isLoading = false)
        }
    }

    /**
     * Add a newly submitted PA item (e.g. after YellowZoneSubmissionScreen success).
     * The item starts as PENDING and will be polled automatically.
     */
    fun addItem(item: PAItem) {
        val current = _state.value
        when (item.status) {
            PAStatus.PENDING -> {
                _state.value = current.copy(
                    pendingItems = current.pendingItems + item
                )
                startPollingIfNeeded()
            }
            PAStatus.APPROVED, PAStatus.ACTIVE, PAStatus.DOWNLOADED -> {
                val cached = egcaCache?.hasCachedPA(item.applicationId) == true
                _state.value = current.copy(
                    activeItems = current.activeItems + item.copy(
                        status     = if (cached) PAStatus.DOWNLOADED else item.status,
                        hasCachedPA = cached
                    )
                )
            }
            PAStatus.COMPLETED -> {
                _state.value = current.copy(
                    completedItems = current.completedItems + item
                )
            }
            else -> { /* EXPIRED / REJECTED — not added to any list */ }
        }
    }

    // -- Pending status polling ----------------------------------------------

    /** Start a coroutine that polls PENDING items every 60 seconds. */
    fun startPollingIfNeeded() {
        if (_state.value.pendingItems.isEmpty()) return
        if (pollingJob?.isActive == true) return

        pollingJob = viewModelScope.launch {
            while (_state.value.pendingItems.isNotEmpty()) {
                pollPendingItems()
                delay(PENDING_POLL_INTERVAL_MS)
            }
        }
    }

    /** Stop polling (called on screen exit or when no PENDING items remain). */
    fun stopPolling() {
        pollingJob?.cancel()
        pollingJob = null
    }

    private suspend fun pollPendingItems() {
        val repo = egcaRepo ?: return
        val pending = _state.value.pendingItems.toList()
        if (pending.isEmpty()) return

        Log.d(TAG, "Polling ${pending.size} pending PA(s)")

        for (item in pending) {
            val result = repo.getPermissionStatus(item.applicationId)

            result.onSuccess { statusResponse ->
                val newStatus = when (statusResponse.status.uppercase()) {
                    "APPROVED" -> PAStatus.APPROVED
                    "REJECTED" -> PAStatus.REJECTED
                    "EXPIRED"  -> PAStatus.EXPIRED
                    else       -> PAStatus.PENDING
                }

                if (newStatus != PAStatus.PENDING) {
                    val updatedItem = item.copy(
                        status    = newStatus,
                        remarks   = statusResponse.remarks,
                        updatedAt = statusResponse.updatedAt
                    )
                    moveFromPending(item.applicationId, updatedItem)
                    Log.i(TAG, "PA ${item.applicationId} status changed: ${item.status} -> $newStatus")
                }
            }

            result.onFailure { e ->
                Log.w(TAG, "Failed to poll status for ${item.applicationId}: ${e.message}")
            }
        }
    }

    /** Move an item from the PENDING list to the appropriate destination list. */
    private fun moveFromPending(applicationId: String, updatedItem: PAItem) {
        val current = _state.value
        val newPending = current.pendingItems.filter { it.applicationId != applicationId }

        _state.value = when (updatedItem.status) {
            PAStatus.APPROVED, PAStatus.ACTIVE -> current.copy(
                pendingItems = newPending,
                activeItems  = current.activeItems + updatedItem
            )
            PAStatus.COMPLETED -> current.copy(
                pendingItems   = newPending,
                completedItems = current.completedItems + updatedItem
            )
            else -> current.copy(pendingItems = newPending)
        }

        // Stop polling if no more pending items
        if (newPending.isEmpty()) stopPolling()
    }

    // -- PA Download ---------------------------------------------------------

    /** Download the PA ZIP for an APPROVED application. */
    fun downloadPA(applicationId: String) {
        val repo  = egcaRepo  ?: return
        val cache = egcaCache ?: return

        _state.value = _state.value.copy(downloadingId = applicationId)

        viewModelScope.launch {
            Log.d(TAG, "Downloading PA for applicationId=$applicationId")

            val result = repo.downloadPermissionArtefact(applicationId)

            result.onSuccess { bytes ->
                cache.cachePA(applicationId, bytes)
                Log.i(TAG, "PA cached: applicationId=$applicationId, size=${bytes.size} bytes")

                // Update item status to DOWNLOADED
                val updatedActive = _state.value.activeItems.map { item ->
                    if (item.applicationId == applicationId) {
                        item.copy(status = PAStatus.DOWNLOADED, hasCachedPA = true)
                    } else item
                }
                _state.value = _state.value.copy(
                    activeItems   = updatedActive,
                    downloadingId = null
                )
            }

            result.onFailure { e ->
                Log.e(TAG, "PA download failed: ${e.message}")
                _state.value = _state.value.copy(
                    downloadingId = null,
                    errorMessage  = "Download failed: ${e.message}"
                )
            }
        }
    }

    /**
     * Get the cached PA file path for sharing via Android share sheet.
     * Returns null if no cached PA exists.
     */
    fun getCachedPAFile(applicationId: String): java.io.File? {
        return egcaCache?.getCachedPAFile(applicationId)
    }

    // -- Flight log upload ---------------------------------------------------

    /** Set the target item for flight log upload. */
    fun selectUploadTarget(item: PAItem) {
        _state.value = _state.value.copy(
            uploadTarget   = item,
            logUploadState = LogUploadState.Idle
        )
    }

    /** Upload a flight log bundle selected via SAF file picker. */
    fun uploadFlightLog(applicationId: String, logUri: Uri) {
        val repo = egcaRepo ?: return

        _state.value = _state.value.copy(logUploadState = LogUploadState.Loading)

        viewModelScope.launch {
            try {
                val context = getApplication<Application>()
                val bytes = context.contentResolver.openInputStream(logUri)?.use {
                    it.readBytes()
                } ?: throw IllegalStateException("Cannot read log file")

                Log.d(TAG, "Uploading flight log: applicationId=$applicationId, size=${bytes.size}")

                val result = repo.uploadFlightLog(applicationId, bytes)

                result.onSuccess {
                    Log.i(TAG, "Flight log uploaded for $applicationId")
                    _state.value = _state.value.copy(
                        logUploadState = LogUploadState.Success(applicationId)
                    )
                    // Remove from completed list after successful upload
                    val updated = _state.value.completedItems.filter {
                        it.applicationId != applicationId
                    }
                    _state.value = _state.value.copy(completedItems = updated)
                }

                result.onFailure { e ->
                    Log.e(TAG, "Flight log upload failed: ${e.message}")
                    _state.value = _state.value.copy(
                        logUploadState = LogUploadState.Error(
                            e.message ?: "Unknown upload error"
                        )
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to read log file: ${e.message}", e)
                _state.value = _state.value.copy(
                    logUploadState = LogUploadState.Error(
                        "Failed to read file: ${e.message}"
                    )
                )
            }
        }
    }

    /** Reset log upload state after dismissing result. */
    fun resetLogUpload() {
        _state.value = _state.value.copy(
            logUploadState = LogUploadState.Idle,
            uploadTarget   = null
        )
    }

    // -- Detail bottom sheet -------------------------------------------------

    /** Show the detail bottom sheet for a specific PA item. */
    fun showDetail(item: PAItem) {
        _state.value = _state.value.copy(
            selectedItem = item,
            showDetail   = true
        )
    }

    /** Dismiss the detail bottom sheet. */
    fun dismissDetail() {
        _state.value = _state.value.copy(
            showDetail   = false,
            selectedItem = null
        )
    }

    // -- Error dismissal -----------------------------------------------------

    fun clearError() {
        _state.value = _state.value.copy(errorMessage = null)
    }

    // -- Lifecycle -----------------------------------------------------------

    override fun onCleared() {
        super.onCleared()
        stopPolling()
    }
}
