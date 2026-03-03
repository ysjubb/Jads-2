package com.jads.ui.viewmodel

import android.app.Application
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

private val Application.loginDataStore by preferencesDataStore(name = "jads_login")
private val KEY_OPERATOR_ID   = stringPreferencesKey("operator_id")
private val KEY_OPERATOR_ROLE = stringPreferencesKey("operator_role")

enum class OperatorRole(val displayName: String, val apiValue: String) {
    CIVILIAN("Civilian Operator",     "CIVILIAN"),
    IAF_PILOT("IAF Pilot",           "IAF_PILOT"),
    IAF_ATC("IAF ATC",               "IAF_ATC"),
    DGCA_INSPECTOR("DGCA Inspector",  "DGCA_INSPECTOR"),
}

data class LoginUiState(
    val operatorIdInput:  String        = "",
    val selectedRole:     OperatorRole  = OperatorRole.CIVILIAN,
    val isLoading:        Boolean       = false,
    val loginError:       String?       = null,
    val isLoggedIn:       Boolean       = false,
    val savedOperatorId:  String        = ""
)

class LoginViewModel(application: Application) : AndroidViewModel(application) {

    private val dataStore = application.loginDataStore

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            dataStore.data.map { prefs ->
                Pair(
                    prefs[KEY_OPERATOR_ID]   ?: "",
                    prefs[KEY_OPERATOR_ROLE] ?: OperatorRole.CIVILIAN.apiValue
                )
            }.collect { (id, roleStr) ->
                val role = OperatorRole.values().firstOrNull { it.apiValue == roleStr }
                    ?: OperatorRole.CIVILIAN
                _state.value = _state.value.copy(
                    operatorIdInput = id,
                    savedOperatorId = id,
                    selectedRole    = role
                )
            }
        }
    }

    fun onOperatorIdChanged(v: String) {
        _state.value = _state.value.copy(operatorIdInput = v, loginError = null)
    }

    fun onRoleSelected(role: OperatorRole) {
        _state.value = _state.value.copy(selectedRole = role)
    }

    fun login() {
        val st = _state.value
        val id = st.operatorIdInput.trim()

        if (id.length < 4) {
            _state.value = _state.value.copy(loginError = "Operator ID must be at least 4 characters")
            return
        }
        if (!id.matches(Regex("[A-Za-z0-9_\\-]+"))) {
            _state.value = _state.value.copy(loginError = "Operator ID may only contain letters, digits, _ and -")
            return
        }

        _state.value = _state.value.copy(isLoading = true, loginError = null)

        viewModelScope.launch {
            dataStore.edit { prefs ->
                prefs[KEY_OPERATOR_ID]   = id
                prefs[KEY_OPERATOR_ROLE] = st.selectedRole.apiValue
            }
            MissionState.setOperator(id, st.selectedRole.apiValue)
            _state.value = _state.value.copy(isLoading = false, isLoggedIn = true)
        }
    }

    fun logout() {
        MissionState.reset()
        viewModelScope.launch { dataStore.edit { it.clear() } }
        _state.value = LoginUiState()
    }
}
