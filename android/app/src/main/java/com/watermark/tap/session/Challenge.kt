package com.watermark.tap.session

import java.security.MessageDigest

object Challenge {
    /** UN (EMV tag 9F37) = first 4 bytes of SHA-256 over the 32 raw nonce bytes (interfaces F1). */
    fun deriveUn(nonce: ByteArray): ByteArray {
        require(nonce.size == 32) { "nonce must be 32 bytes" }
        return MessageDigest.getInstance("SHA-256").digest(nonce).copyOf(4)
    }

    /** Month index = (YYYY - 2000) * 12 + (MM - 1), in UTC. */
    fun monthIndex(epochSeconds: Long): Int {
        val date = java.time.Instant.ofEpochSecond(epochSeconds).atZone(java.time.ZoneOffset.UTC)
        return (date.year - 2000) * 12 + (date.monthValue - 1)
    }
}
