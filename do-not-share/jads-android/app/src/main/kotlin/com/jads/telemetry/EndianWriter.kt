package com.jads.telemetry

// Big-endian reader/writer using ONLY explicit bit-shifting.
// NO ByteBuffer. NO DataOutputStream. NO configurable-endian APIs.
// ByteBuffer.putLong() endianness depends on JVM configuration — forbidden.
// Every method is a pure function of its inputs.

object EndianWriter {

    fun writeUint64Be(out: ByteArray, offset: Int, value: Long) {
        out[offset + 0] = (value ushr 56).toByte()
        out[offset + 1] = (value ushr 48).toByte()
        out[offset + 2] = (value ushr 40).toByte()
        out[offset + 3] = (value ushr 32).toByte()
        out[offset + 4] = (value ushr 24).toByte()
        out[offset + 5] = (value ushr 16).toByte()
        out[offset + 6] = (value ushr  8).toByte()
        out[offset + 7] = (value        ).toByte()
    }

    fun writeUint32Be(out: ByteArray, offset: Int, value: Int) {
        out[offset + 0] = (value ushr 24).toByte()
        out[offset + 1] = (value ushr 16).toByte()
        out[offset + 2] = (value ushr  8).toByte()
        out[offset + 3] = (value        ).toByte()
    }

    fun readUint64Be(src: ByteArray, offset: Int): Long {
        var v = 0L
        for (i in 0..7) v = (v shl 8) or (src[offset + i].toLong() and 0xFF)
        return v
    }

    fun readUint32Be(src: ByteArray, offset: Int): Int {
        var v = 0
        for (i in 0..3) v = (v shl 8) or (src[offset + i].toInt() and 0xFF)
        return v
    }
}
