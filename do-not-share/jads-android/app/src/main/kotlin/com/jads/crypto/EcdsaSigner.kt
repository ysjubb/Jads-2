package com.jads.crypto

import org.bouncycastle.asn1.ASN1Integer
import org.bouncycastle.asn1.ASN1Sequence
import org.bouncycastle.asn1.DLSequence
import org.bouncycastle.crypto.params.ECDomainParameters
import org.bouncycastle.crypto.params.ECPrivateKeyParameters
import org.bouncycastle.crypto.params.ECPublicKeyParameters
import org.bouncycastle.crypto.signers.ECDSASigner
import org.bouncycastle.crypto.signers.HMacDSAKCalculator
import org.bouncycastle.crypto.util.DigestFactory
import org.bouncycastle.asn1.x9.ECNamedCurveTable
import java.math.BigInteger
import java.security.MessageDigest

// ECDSA P-256 with RFC 6979 deterministic nonces via Bouncy Castle.
//
// CRITICAL: Do NOT replace with Android JCA (the SHA256withECDSA provider).
// Android JCA is non-deterministic — every call produces a different DER signature
// for the same input. This breaks the forensic test:
//   sign(hash, key) called twice → must produce IDENTICAL DER bytes.
//
// HMacDSAKCalculator enforces RFC 6979 deterministic k-value generation.
// This exact constructor: ECDSASigner(HMacDSAKCalculator(DigestFactory.createSHA256()))
// ECDSASigner() without the calculator is non-deterministic.

object EcdsaSigner {

    private val CURVE_PARAMS = ECNamedCurveTable.getByName("P-256")
        ?: error("P-256 curve not found in Bouncy Castle — check dependency version")

    private val DOMAIN_PARAMS = ECDomainParameters(
        CURVE_PARAMS.curve,
        CURVE_PARAMS.g,
        CURVE_PARAMS.n,
        CURVE_PARAMS.h
    )

    // Sign 32-byte hash. Returns DER-encoded ECDSA signature.
    // RFC 6979: same hash + same key = same DER bytes. Always. Deterministic.
    fun sign(hash32: ByteArray, privateKeyBytes: ByteArray): ByteArray {
        require(hash32.size == 32)         { "Hash must be 32 bytes, got ${hash32.size}" }
        require(privateKeyBytes.size == 32) { "Private key must be 32 bytes, got ${privateKeyBytes.size}" }

        // HMacDSAKCalculator = RFC 6979 deterministic nonce generator
        val signer = ECDSASigner(HMacDSAKCalculator(DigestFactory.createSHA256()))
        val privateKey = ECPrivateKeyParameters(BigInteger(1, privateKeyBytes), DOMAIN_PARAMS)
        signer.init(true, privateKey)

        val (r, s) = signer.generateSignature(hash32)
        return encodeDer(r, s)
    }

    // Verify DER-encoded ECDSA signature.
    fun verify(hash32: ByteArray, derSignature: ByteArray, publicKeyBytes: ByteArray): Boolean {
        require(hash32.size == 32) { "Hash must be 32 bytes" }

        val signer     = ECDSASigner(HMacDSAKCalculator(DigestFactory.createSHA256()))
        val point      = DOMAIN_PARAMS.curve.decodePoint(publicKeyBytes)
        val publicKey  = ECPublicKeyParameters(point, DOMAIN_PARAMS)
        signer.init(false, publicKey)

        val (r, s) = decodeDer(derSignature)
        return signer.verifySignature(hash32, r, s)
    }

    fun sha256(data: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-256").digest(data)

    // DER encode (r, s) as ASN.1 SEQUENCE { INTEGER r, INTEGER s }
    private fun encodeDer(r: BigInteger, s: BigInteger): ByteArray =
        DLSequence(arrayOf(ASN1Integer(r), ASN1Integer(s))).encoded

    private fun decodeDer(der: ByteArray): Pair<BigInteger, BigInteger> {
        val seq = ASN1Sequence.getInstance(der)
        val r   = ASN1Integer.getInstance(seq.getObjectAt(0)).value
        val s   = ASN1Integer.getInstance(seq.getObjectAt(1)).value
        return Pair(r, s)
    }
}
