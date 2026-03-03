package com.jads.storage

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

// AppPreferences — encrypted persistent storage for session data.
//
// Uses EncryptedSharedPreferences backed by AES-256-GCM + AES-256-SIV.
// The MasterKey lives in Android Keystore (hardware-backed on supported devices).
//
// Stores:
//   - JWT access token (operator session)
//   - operatorId + operatorType (for display and upload requests)
//   - backendBaseUrl (configurable — different for staging/prod)
//
// NEVER stores: passwords, private keys, mission data.
// Private keys live in Android Keystore (hardware-backed StrongBox when available).

class AppPreferences(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "jads_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    // ── JWT ────────────────────────────────────────────────────────────────
    var jwtToken: String?
        get()      = prefs.getString(KEY_JWT, null)
        set(value) = if (value == null) prefs.edit().remove(KEY_JWT).apply()
                     else prefs.edit().putString(KEY_JWT, value).apply()

    // ── Operator identity ──────────────────────────────────────────────────
    var operatorId: String?
        get()      = prefs.getString(KEY_OPERATOR_ID, null)
        set(value) { prefs.edit().putString(KEY_OPERATOR_ID, value).apply() }

    var operatorType: String                     // "CIVILIAN" or "SPECIAL"
        get()      = prefs.getString(KEY_OPERATOR_TYPE, "CIVILIAN") ?: "CIVILIAN"
        set(value) { prefs.edit().putString(KEY_OPERATOR_TYPE, value).apply() }

    // ── Backend URL (default: local dev server) ────────────────────────────
    var backendBaseUrl: String
        get()      = prefs.getString(KEY_BACKEND_URL, DEFAULT_BACKEND_URL) ?: DEFAULT_BACKEND_URL
        set(value) { prefs.edit().putString(KEY_BACKEND_URL, value.trimEnd('/')).apply() }

    // ── Device cert hash (set at first launch, read by MissionController) ─
    var deviceCertHash: String
        get()      = prefs.getString(KEY_DEVICE_CERT_HASH, "UNCONFIGURED") ?: "UNCONFIGURED"
        set(value) { prefs.edit().putString(KEY_DEVICE_CERT_HASH, value).apply() }

    fun isLoggedIn(): Boolean = jwtToken != null && operatorId != null

    fun clearSession() {
        prefs.edit()
            .remove(KEY_JWT)
            .remove(KEY_OPERATOR_ID)
            .remove(KEY_OPERATOR_TYPE)
            .apply()
    }

    companion object {
        private const val KEY_JWT              = "jwt_token"
        private const val KEY_OPERATOR_ID      = "operator_id"
        private const val KEY_OPERATOR_TYPE    = "operator_type"
        private const val KEY_BACKEND_URL      = "backend_base_url"
        private const val KEY_DEVICE_CERT_HASH = "device_cert_hash"
        private const val DEFAULT_BACKEND_URL  = "http://10.0.2.2:3000"  // Android emulator → host localhost
    }
}
