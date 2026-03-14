package com.jads.crypto

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.cert.Certificate

// KeyStoreSigningProvider — production signing via Android Keystore + StrongBox.
//
// Design decisions:
//   1. Keys are generated IN the Keystore — private key never leaves hardware.
//   2. StrongBox is PREFERRED but not REQUIRED. If the device has no StrongBox
//      (pre-Pie, or a chip without it), keys fall back to TEE-backed Keystore.
//      Both are hardware-backed; StrongBox is simply a dedicated SE chip vs.
//      the main TEE.
//   3. Signing uses Android JCA (SHA256withECDSA). This is NON-DETERMINISTIC,
//      unlike the Bouncy Castle RFC 6979 signer in EcdsaSigner.kt.
//      That is acceptable for production: ECDSA verification does not require
//      deterministic nonces — only that (r,s) validate against the public key.
//      RFC 6979 determinism is a safety net against nonce reuse, not a
//      verification requirement. Android Keystore uses /dev/urandom inside the
//      TEE/SE, which is equally safe.
//   4. The public key is exported (X.509 SubjectPublicKeyInfo DER) and sent
//      to the backend for verification.
//   5. Key attestation certificate chain is available for DeviceAttestationService
//      to verify hardware backing.
//
// Migration path from stub key:
//   - AppContainer replaces `stubPrivateKeyBytes` with this provider.
//   - MissionController gains a `sign(hash32)` lambda instead of raw key bytes.
//   - EcdsaSigner.kt remains unchanged — used only for offline/test scenarios.

class KeyStoreSigningProvider private constructor(
    val isStrongBoxBacked: Boolean,
    val publicKeyBytes: ByteArray,
    val attestationChain: List<Certificate>
) {

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "jads_ecdsa_p256_mission"

        // Thread-safe StrongBox tracking.  Written exactly once during
        // generateKey() inside the synchronized createInternal() block,
        // then read once to construct the instance.  @Volatile prevents
        // stale reads if a second thread enters after the lock is released.
        @Volatile
        private var generatedWithStrongBox = false

        /**
         * Initialise the signing provider with a server-issued attestation nonce.
         *
         * If a key already exists under [KEY_ALIAS], it is reused.
         * Otherwise a new P-256 key pair is generated in the Keystore with the
         * server nonce as the attestation challenge (replay protection).
         *
         * @param nonce Server-issued nonce bytes (32 bytes from GET /api/drone/devices/:id/attestation-nonce)
         * @return [KeyStoreSigningProvider] ready for signing, or null if
         *         the device does not support EC key generation in Keystore.
         */
        fun create(nonce: ByteArray): KeyStoreSigningProvider? {
            return createInternal(nonce)
        }

        /**
         * Initialise the signing provider with static challenge (offline/test fallback).
         *
         * @return [KeyStoreSigningProvider] ready for signing, or null.
         */
        @Deprecated("Use create(nonce) for production — static challenge has no replay protection")
        fun create(): KeyStoreSigningProvider? {
            return createInternal("jads-attestation".toByteArray())
        }

        @Synchronized
        private fun createInternal(challenge: ByteArray): KeyStoreSigningProvider? {
            return try {
                val ks = KeyStore.getInstance(KEYSTORE_PROVIDER)
                ks.load(null)

                // Attempt StrongBox first (API 28+), fall back to TEE
                val strongBoxAvailable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P

                if (!ks.containsAlias(KEY_ALIAS)) {
                    generateKey(strongBoxAvailable, challenge)
                }

                val entry = ks.getEntry(KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
                    ?: return null

                val cert = entry.certificate
                val pubKeyBytes = cert.publicKey.encoded  // X.509 SubjectPublicKeyInfo DER

                // Attestation chain — empty list if not available
                val chain = try {
                    ks.getCertificateChain(KEY_ALIAS)?.toList() ?: emptyList()
                } catch (_: Exception) {
                    emptyList()
                }

                // Determine actual StrongBox backing by checking if the key was
                // generated with StrongBox. On devices where StrongBox generation
                // failed and fell back, we mark it as TEE-backed.
                val actualStrongBox = generatedWithStrongBox

                KeyStoreSigningProvider(
                    isStrongBoxBacked = actualStrongBox,
                    publicKeyBytes    = pubKeyBytes,
                    attestationChain  = chain
                )
            } catch (_: Exception) {
                null
            }
        }

        private fun generateKey(tryStrongBox: Boolean, challenge: ByteArray) {
            val specBuilder = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            )

                .setDigests(KeyProperties.DIGEST_SHA256)
                .setKeySize(256)
                .setAttestationChallenge(challenge)
                .setUserAuthenticationRequired(false)   // mission must proceed without biometric

            if (tryStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                specBuilder.setIsStrongBoxBacked(true)
            }

            try {
                val kpg = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC, KEYSTORE_PROVIDER
                )
                kpg.initialize(specBuilder.build())
                kpg.generateKeyPair()
                generatedWithStrongBox = tryStrongBox
            } catch (e: Exception) {
                // StrongBox generation failed — retry without StrongBox (TEE fallback)
                if (tryStrongBox) {
                    val fallbackSpec = KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                    )

                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .setKeySize(256)
                        .setAttestationChallenge(challenge)
                        .setUserAuthenticationRequired(false)
                        .build()

                    val kpg = KeyPairGenerator.getInstance(
                        KeyProperties.KEY_ALGORITHM_EC, KEYSTORE_PROVIDER
                    )
                    kpg.initialize(fallbackSpec)
                    kpg.generateKeyPair()
                    generatedWithStrongBox = false
                } else {
                    throw e
                }
            }
        }

    }

    /**
     * Sign a 32-byte SHA-256 hash using the Keystore-held private key.
     *
     * Returns DER-encoded ECDSA signature.
     *
     * NOTE: This uses Android JCA (non-deterministic nonces). The signature
     * will differ on each call for the same input. Verification still works —
     * ECDSA verify is nonce-independent.
     */
    fun sign(hash32: ByteArray): ByteArray {
        require(hash32.size == 32) { "Hash must be 32 bytes, got ${hash32.size}" }

        val ks = KeyStore.getInstance(KEYSTORE_PROVIDER)
        ks.load(null)
        val entry = ks.getEntry(KEY_ALIAS, null) as KeyStore.PrivateKeyEntry

        // NOIDwithECDSA: we pass the pre-computed SHA-256 hash, so we use
        // the "NONEwithECDSA" algorithm to avoid double-hashing.
        val sig = Signature.getInstance("NONEwithECDSA")
        sig.initSign(entry.privateKey)
        sig.update(hash32)
        return sig.sign()
    }
}
