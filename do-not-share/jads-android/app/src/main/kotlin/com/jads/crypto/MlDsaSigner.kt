package com.jads.crypto

import org.bouncycastle.pqc.crypto.mldsa.MLDSAKeyGenerationParameters
import org.bouncycastle.pqc.crypto.mldsa.MLDSAKeyPairGenerator
import org.bouncycastle.pqc.crypto.mldsa.MLDSAParameters
import org.bouncycastle.pqc.crypto.mldsa.MLDSAPrivateKeyParameters
import org.bouncycastle.pqc.crypto.mldsa.MLDSAPublicKeyParameters
import org.bouncycastle.pqc.crypto.mldsa.MLDSASigner
import java.security.SecureRandom

// ML-DSA-65 (FIPS 204) — Post-Quantum Digital Signature Algorithm.
//
// PHASE 1 (Hybrid): This signer runs IN PARALLEL with EcdsaSigner.
//   - Every telemetry record is signed by BOTH ECDSA P-256 and ML-DSA-65.
//   - signatureHex stores the ECDSA signature (unchanged).
//   - pqcSignatureHex stores the ML-DSA-65 signature (new field).
//   - ForensicVerifier on the backend verifies BOTH when present.
//
// ML-DSA-65 properties:
//   - NIST Security Level 3 (128-bit quantum security)
//   - Public key:  1,952 bytes
//   - Signature:   3,293 bytes
//   - Based on CRYSTALS-Dilithium (FIPS 204, finalized August 2024)
//
// IMPORTANT: This is SOFTWARE-ONLY signing. ML-DSA is not yet supported in
// Android Keystore / StrongBox. Phase 2 will migrate to hardware-backed
// PQC keys when Android Keystore adds FIPS 204 support.

object MlDsaSigner {

    private val PARAMS = MLDSAParameters.ml_dsa_65

    /**
     * Generate a new ML-DSA-65 key pair.
     * Returns Pair(privateKeyEncoded, publicKeyEncoded).
     *
     * The encoded forms are the raw byte representations from BouncyCastle.
     * Store the private key securely; send the public key to the backend at upload.
     */
    fun generateKeyPair(): Pair<ByteArray, ByteArray> {
        val kpg = MLDSAKeyPairGenerator()
        kpg.init(MLDSAKeyGenerationParameters(SecureRandom(), PARAMS))
        val kp = kpg.generateKeyPair()

        val privParams = kp.private as MLDSAPrivateKeyParameters
        val pubParams  = kp.public  as MLDSAPublicKeyParameters

        return Pair(privParams.encoded, pubParams.encoded)
    }

    /**
     * Sign a message (arbitrary length) with ML-DSA-65.
     * Unlike ECDSA, ML-DSA signs the message directly — no pre-hashing needed.
     *
     * @param message     The data to sign (e.g., the 96-byte canonical payload)
     * @param privateKey  Encoded private key bytes from generateKeyPair()
     * @return            ML-DSA-65 signature (~3,293 bytes)
     */
    fun sign(message: ByteArray, privateKey: ByteArray): ByteArray {
        val privParams = MLDSAPrivateKeyParameters(PARAMS, privateKey)
        val signer = MLDSASigner()
        signer.init(true, privParams)
        return signer.generateSignature(message)
    }

    /**
     * Verify an ML-DSA-65 signature.
     *
     * @param message    The original signed data
     * @param signature  The ML-DSA-65 signature bytes
     * @param publicKey  Encoded public key bytes
     * @return           true if signature is valid
     */
    fun verify(message: ByteArray, signature: ByteArray, publicKey: ByteArray): Boolean {
        val pubParams = MLDSAPublicKeyParameters(PARAMS, publicKey)
        val signer = MLDSASigner()
        signer.init(false, pubParams)
        return signer.verifySignature(message, signature)
    }
}
