package com.jads.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jads.storage.JadsDatabase
import com.jads.storage.MissionEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class MissionHistoryItem(
    val dbId:             Long,
    val missionId:        Long,
    val state:            String,
    val npntClass:        String,
    val recordCount:      Long,
    val startUtcMs:       Long,
    val endUtcMs:         Long?,
    val uploadedAt:       Long?,
    val integrityOk:      Boolean,
    val strongboxBacked:  Boolean?
)

sealed class HistoryLoadState {
    object Loading  : HistoryLoadState()
    object Empty    : HistoryLoadState()
    data class Loaded(val items: List<MissionHistoryItem>) : HistoryLoadState()
    data class Error(val message: String) : HistoryLoadState()
}

class HistoryViewModel(application: Application) : AndroidViewModel(application) {

    private val _loadState = MutableStateFlow<HistoryLoadState>(HistoryLoadState.Loading)
    val loadState: StateFlow<HistoryLoadState> = _loadState.asStateFlow()

    init { refresh() }

    fun refresh() {
        _loadState.value = HistoryLoadState.Loading
        viewModelScope.launch {
            try {
                val db = JadsDatabase.getInstance(getApplication()) {
                    "JADS_DEMO_PASSPHRASE_CHANGE_IN_PRODUCTION".toByteArray(Charsets.UTF_8)
                }
                val entities: List<MissionEntity> = withContext(Dispatchers.IO) {
                    db.missionDao().getAllMissions()
                }
                val items = entities.map { e ->
                    MissionHistoryItem(
                        dbId            = e.id,
                        missionId       = e.missionId,
                        state           = e.state,
                        npntClass       = e.npntClassification,
                        recordCount     = e.recordCount,
                        startUtcMs      = e.missionStartUtcMs,
                        endUtcMs        = e.missionEndUtcMs,
                        uploadedAt      = e.uploadedAt,
                        integrityOk     = e.localIntegrityCheckOk,
                        strongboxBacked = e.strongboxBacked
                    )
                }.sortedByDescending { it.startUtcMs }

                _loadState.value = if (items.isEmpty()) HistoryLoadState.Empty
                                   else                 HistoryLoadState.Loaded(items)
            } catch (e: Exception) {
                _loadState.value = HistoryLoadState.Error(e.message ?: "Unknown error loading mission history")
            }
        }
    }
}
