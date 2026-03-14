package com.jads.ui.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jads.network.ApiResult
import com.jads.network.JadsApiClient
import com.jads.network.ValidationCheck
import com.jads.network.ValidationResult
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// ─────────────────────────────────────────────────────────────────────────────
// ValidationViewModel — drives the ValidationChecklistScreen (P35).
//
// Responsibilities:
//   1. Call POST /api/drone/validate-flight-plan via JadsApiClient
//   2. Group validation checks into REQUIRED, ADVISORY, INFO sections
//   3. Track user acknowledgement of warnings (ADVISORY items)
//   4. Compute readiness for eGCA submission
//   5. Trigger eGCA submission when all required checks pass
//
// Thread safety:
//   All MutableStateFlow writes happen on the main thread.
//   Network calls dispatch to Dispatchers.IO.
//
// Dependencies:
//   JadsApiClient is set externally via setApiClient() — called once
//   from the composable / MainActivity, consistent with the codebase pattern
//   (cf. AirspaceMapViewModel.setApiClient).
// ─────────────────────────────────────────────────────────────────────────────

private const val TAG = "ValidationVM"

// ── Submission lifecycle ─────────────────────────────────────────────────────
sealed class SubmitToEgcaState {
    object Idle    : SubmitToEgcaState()
    object Loading : SubmitToEgcaState()
    data class Success(val applicationId: String) : SubmitToEgcaState()
    data class Error(val message: String) : SubmitToEgcaState()
}

// ── UI State ────────────────────────────────────────────────────────────────
data class ValidationUiState(
    // ── Validation results grouped by severity ─────────────────────────────
    val requiredChecks:  List<ValidationCheck> = emptyList(),
    val advisoryChecks:  List<ValidationCheck> = emptyList(),
    val infoChecks:      List<ValidationCheck> = emptyList(),

    // ── User acknowledgement of advisory items ─────────────────────────────
    val acknowledgedWarnings: Set<String> = emptySet(),

    // ── Loading / error states ─────────────────────────────────────────────
    val isLoading:       Boolean = false,
    val errorMessage:    String? = null,

    // ── Overall readiness ──────────────────────────────────────────────────
    val backendReady:    Boolean = false,

    // ── Submission state ───────────────────────────────────────────────────
    val submitState:     SubmitToEgcaState = SubmitToEgcaState.Idle
) {
    /** Total checks across all sections. */
    val totalChecks: Int get() = requiredChecks.size + advisoryChecks.size + infoChecks.size

    /** Number of checks that are passed or acknowledged. */
    val passedChecks: Int get() {
        val requiredPassed = requiredChecks.count { it.passed }
        val advisoryPassed = advisoryChecks.count { it.passed || it.code in acknowledgedWarnings }
        val infoPassed     = infoChecks.size  // info items always count as passed
        return requiredPassed + advisoryPassed + infoPassed
    }

    /** Whether all REQUIRED checks passed and all ADVISORY warnings are acknowledged. */
    val isReadyToSubmit: Boolean get() {
        val allRequiredPassed = requiredChecks.all { it.passed }
        val allWarningsHandled = advisoryChecks.all { it.passed || it.code in acknowledgedWarnings }
        return allRequiredPassed && allWarningsHandled && totalChecks > 0
                && submitState !is SubmitToEgcaState.Loading
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ViewModel
// ─────────────────────────────────────────────────────────────────────────────

class ValidationViewModel(application: Application) : AndroidViewModel(application) {

    private var apiClient: JadsApiClient? = null
    private val gson = Gson()

    private val _state = MutableStateFlow(ValidationUiState())
    val state: StateFlow<ValidationUiState> = _state.asStateFlow()

    // ── Dependency injection ──────────────────────────────────────────────────

    /** Provide the JadsApiClient instance (called once from the composable). */
    fun setApiClient(client: JadsApiClient) {
        apiClient = client
    }

    // ── Validation ───────────────────────────────────────────────────────────

    /**
     * Run pre-submission validation for a flight plan.
     *
     * Sends the flight plan payload to POST /api/drone/validate-flight-plan
     * and populates the 3 checklist sections from the response.
     *
     * @param flightPlanJson JSON string of the flight plan payload.
     */
    fun runValidation(flightPlanJson: String) {
        val client = apiClient
        if (client == null) {
            Log.e(TAG, "JadsApiClient not set — cannot validate")
            _state.value = _state.value.copy(
                errorMessage = "API client not configured"
            )
            return
        }

        _state.value = _state.value.copy(
            isLoading    = true,
            errorMessage = null
        )

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                client.validateFlightPlan(flightPlanJson)
            }

            when (result) {
                is ApiResult.Success -> {
                    val data = result.data
                    Log.d(TAG, "Validation complete: ${data.checks.size} checks, ready=${data.ready}")

                    _state.value = _state.value.copy(
                        requiredChecks  = data.checks.filter { it.severity == "REQUIRED" },
                        advisoryChecks  = data.checks.filter { it.severity == "ADVISORY" },
                        infoChecks      = data.checks.filter { it.severity == "INFO" },
                        backendReady    = data.ready,
                        isLoading       = false,
                        errorMessage    = null
                    )
                }
                is ApiResult.Error -> {
                    Log.e(TAG, "Validation failed: ${result.code} ${result.message}")
                    _state.value = _state.value.copy(
                        isLoading    = false,
                        errorMessage = "Validation failed: ${result.message} (${result.code})"
                    )
                }
                is ApiResult.NetworkError -> {
                    Log.e(TAG, "Validation network error: ${result.message}")
                    _state.value = _state.value.copy(
                        isLoading    = false,
                        errorMessage = "Network error: ${result.message}"
                    )
                }
            }
        }
    }

    // ── Warning acknowledgement ──────────────────────────────────────────────

    /**
     * Toggle acknowledgement for an advisory warning.
     *
     * @param code The check code to acknowledge or un-acknowledge.
     */
    fun toggleAcknowledgement(code: String) {
        val current = _state.value.acknowledgedWarnings
        val updated = if (code in current) current - code else current + code
        _state.value = _state.value.copy(acknowledgedWarnings = updated)
    }

    // ── eGCA Submission ──────────────────────────────────────────────────────

    /**
     * Submit the validated flight plan to eGCA.
     *
     * Only callable when [ValidationUiState.isReadyToSubmit] is true.
     *
     * @param flightPlanJson JSON string of the flight plan payload.
     */
    fun submitToEgca(flightPlanJson: String) {
        if (!_state.value.isReadyToSubmit) {
            _state.value = _state.value.copy(
                submitState = SubmitToEgcaState.Error("Not all checks are satisfied")
            )
            return
        }

        val client = apiClient
        if (client == null) {
            _state.value = _state.value.copy(
                submitState = SubmitToEgcaState.Error("API client not configured")
            )
            return
        }

        _state.value = _state.value.copy(submitState = SubmitToEgcaState.Loading)

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                client.uploadMission(flightPlanJson)
            }

            when (result) {
                is ApiResult.Success -> {
                    Log.i(TAG, "eGCA submission accepted: ${result.data.status}")
                    _state.value = _state.value.copy(
                        submitState = SubmitToEgcaState.Success(
                            applicationId = result.data.missionDbId ?: result.data.status
                        )
                    )
                }
                is ApiResult.Error -> {
                    Log.e(TAG, "eGCA submission failed: ${result.code} ${result.message}")
                    _state.value = _state.value.copy(
                        submitState = SubmitToEgcaState.Error(
                            "Submission failed: ${result.message} (${result.code})"
                        )
                    )
                }
                is ApiResult.NetworkError -> {
                    Log.e(TAG, "eGCA submission network error: ${result.message}")
                    _state.value = _state.value.copy(
                        submitState = SubmitToEgcaState.Error(
                            "Network error: ${result.message}"
                        )
                    )
                }
            }
        }
    }

    /** Reset submission state (e.g. after dismissing error or navigating away). */
    fun resetSubmitState() {
        _state.value = _state.value.copy(submitState = SubmitToEgcaState.Idle)
    }

    /** Clear all validation state (e.g. on back navigation). */
    fun reset() {
        _state.value = ValidationUiState()
    }
}
