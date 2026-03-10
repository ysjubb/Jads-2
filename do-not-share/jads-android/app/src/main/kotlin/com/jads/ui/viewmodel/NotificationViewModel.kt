package com.jads.ui.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jads.network.ApiResult
import com.jads.network.JadsApiClient
import com.jads.network.NotificationDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ─────────────────────────────────────────────────────────────────────────────
// NotificationViewModel — drives the NotificationScreen.
//
// Responsibilities:
//   1. Fetch notifications from /api/drone/notifications
//   2. Mark single / all notifications read
//   3. Category tab filtering
//   4. Auto-poll every 30 seconds for new notifications
//   5. Expose unread count for badge display
//
// Thread safety:
//   All MutableStateFlow writes on main thread.
//   Network calls dispatched to Dispatchers.IO.
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG = "NotificationVM"
private const val POLL_INTERVAL_MS = 30_000L

// ── Data types ───────────────────────────────────────────────────────────────

enum class NotificationCategory {
    EXPIRY, PERMISSION, COMPLIANCE, SYSTEM
}

data class NotificationItem(
    val id:        String,
    val type:      String,
    val title:     String,
    val body:      String,
    val read:      Boolean,
    val createdAt: String,
    val timeAgo:   String,
    val category:  NotificationCategory,
)

data class NotificationUiState(
    val notifications: List<NotificationItem> = emptyList(),
    val isLoading:     Boolean                = false,
    val unreadCount:   Int                    = 0,
    val selectedTab:   String                 = "ALL",
    val errorMessage:  String?                = null,
)

// ── ViewModel ────────────────────────────────────────────────────────────────

class NotificationViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(NotificationUiState())
    val state: StateFlow<NotificationUiState> = _state.asStateFlow()

    private var pollJob: Job? = null
    private var apiClient: JadsApiClient? = null

    fun setApiClient(client: JadsApiClient) {
        apiClient = client
        startPolling()
    }

    // ── Public actions ────────────────────────────────────────────────────

    fun refresh() {
        fetchNotifications()
    }

    fun selectTab(tab: String) {
        _state.value = _state.value.copy(selectedTab = tab)
        fetchNotifications()
    }

    fun markRead(notificationId: String) {
        viewModelScope.launch {
            try {
                // Optimistic update
                _state.value = _state.value.copy(
                    notifications = _state.value.notifications.map { n ->
                        if (n.id == notificationId) n.copy(read = true) else n
                    },
                    unreadCount = maxOf(0, _state.value.unreadCount - 1)
                )

                withContext(Dispatchers.IO) {
                    apiClient?.markNotificationRead(notificationId)
                }
            } catch (e: Exception) {
                Log.w(TAG, "markRead failed: ${e.message}")
            }
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            try {
                // Optimistic update
                _state.value = _state.value.copy(
                    notifications = _state.value.notifications.map { it.copy(read = true) },
                    unreadCount   = 0
                )

                withContext(Dispatchers.IO) {
                    apiClient?.markAllNotificationsRead()
                }
            } catch (e: Exception) {
                Log.w(TAG, "markAllRead failed: ${e.message}")
            }
        }
    }

    // ── Internal ──────────────────────────────────────────────────────────

    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (true) {
                fetchNotifications()
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    private fun fetchNotifications() {
        val client = apiClient ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, errorMessage = null)

            try {
                val tab = _state.value.selectedTab
                val category = if (tab == "ALL") null else tab

                val result = withContext(Dispatchers.IO) {
                    client.getNotifications(category = category, limit = 50)
                }

                when (result) {
                    is ApiResult.Success -> {
                        _state.value = _state.value.copy(
                            notifications = result.data.notifications.map { it.toUiItem() },
                            unreadCount   = result.data.unreadCount,
                            isLoading     = false
                        )
                    }
                    is ApiResult.Error -> {
                        _state.value = _state.value.copy(
                            isLoading    = false,
                            errorMessage = "Failed to load notifications (${result.code})"
                        )
                    }
                    is ApiResult.NetworkError -> {
                        _state.value = _state.value.copy(
                            isLoading    = false,
                            errorMessage = "Network error: ${result.message}"
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "fetchNotifications error", e)
                _state.value = _state.value.copy(
                    isLoading    = false,
                    errorMessage = e.message
                )
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollJob?.cancel()
    }
}

// ── DTO → UI mapping ────────────────────────────────────────────────────────

private fun NotificationDto.toUiItem(): NotificationItem {
    val category = when {
        type.startsWith("EXPIRY")                                        -> NotificationCategory.EXPIRY
        type.startsWith("PERMISSION")                                    -> NotificationCategory.PERMISSION
        type == "VIOLATION_DETECTED" || type == "COMPLIANCE_WARNING"      -> NotificationCategory.COMPLIANCE
        else                                                              -> NotificationCategory.SYSTEM
    }

    val timeAgo = try {
        val millis = System.currentTimeMillis() -
            java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
                .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                .parse(createdAt.take(19))!!.time
        val mins = (millis / 60_000).toInt()
        when {
            mins < 1  -> "just now"
            mins < 60 -> "${mins}m ago"
            mins < 1440 -> "${mins / 60}h ago"
            else        -> "${mins / 1440}d ago"
        }
    } catch (_: Exception) {
        createdAt.take(10)
    }

    return NotificationItem(
        id        = id,
        type      = type,
        title     = title,
        body      = body,
        read      = read,
        createdAt = createdAt,
        timeAgo   = timeAgo,
        category  = category
    )
}
