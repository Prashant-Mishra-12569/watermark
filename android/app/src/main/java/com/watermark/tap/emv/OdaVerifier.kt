package com.watermark.tap.emv

import java.math.BigInteger
import java.security.MessageDigest

/** Why a card failed the local check. Mirrors tools/testcard/src/verify.ts and the circuit. */
enum class OdaFailure {
    BAD_EXPONENT, BAD_LENGTH, ISSUER_HEADER, ISSUER_HASH, ICC_HEADER, ICC_HASH, PAN_MISMATCH, SDAD_HEADER, SDAD_HASH, UN_MISMATCH,
}

class OdaException(val code: OdaFailure) : Exception(code.name)

/** Result of a passing check. Kept in memory only and never displayed. */
class OdaResult(val pan: String, val issuerId: String, val validThroughMonth: Int) {
    override fun toString(): String = "OdaResult(validThroughMonth=$validThroughMonth, redacted)"
}

/**
 * The EMV offline data authentication chain from spec section H, steps 1-4, run on the phone before anything is
 * sent. The circuit proves exactly the same checks; this lets the app refuse a bad or replayed card locally.
 */
object OdaVerifier {

    fun verify(card: CardData, caModulus: ByteArray): OdaResult {
        if (card.issuerExp != "03" || card.iccExp != "03") fail(OdaFailure.BAD_EXPONENT)
        val exp = byteArrayOf(0x03)

        // Step 1 · bank certificate with the network key
        val issuerRem = card.issuerRem.hexToBytes()
        val m = recover(card.issuerCert.hexToBytes(), caModulus)
        val l1 = m.size
        if (m.u(0) != 0x6A || m.u(1) != 0x02 || m.u(l1 - 1) != 0xBC) fail(OdaFailure.ISSUER_HEADER)
        if (!sha1(m.range(1, l1 - 22), issuerRem, exp).contentEquals(m.range(l1 - 21, l1 - 2))) fail(OdaFailure.ISSUER_HASH)
        val ni = m.u(13)
        val nI = (m.range(15, l1 - 22) + issuerRem).copyOfRange(0, minOf(ni, l1 - 36 + issuerRem.size))
        if (nI.size != ni) fail(OdaFailure.BAD_LENGTH)
        val issuerId = bcdDigits(m.range(2, 5))
        val issuerExpiry = m.range(6, 7).toHex()

        // Step 2 · card certificate with the bank key
        val iccRem = card.iccRem.hexToBytes()
        val c = recover(card.iccCert.hexToBytes(), nI)
        val l2 = c.size
        if (c.u(0) != 0x6A || c.u(1) != 0x04 || c.u(l2 - 1) != 0xBC) fail(OdaFailure.ICC_HEADER)
        val staticData = card.staticData.hexToBytes()
        if (!sha1(c.range(1, l2 - 22), iccRem, exp, staticData).contentEquals(c.range(l2 - 21, l2 - 2))) fail(OdaFailure.ICC_HASH)
        val pan = bcdDigits(c.range(2, 11))
        val iccExpiry = c.range(12, 13).toHex()
        val nic = c.u(19)
        if (!pan.startsWith(issuerId)) fail(OdaFailure.PAN_MISMATCH)
        val nC = (c.range(21, l2 - 22) + iccRem).copyOfRange(0, minOf(nic, l2 - 42 + iccRem.size))
        if (nC.size != nic) fail(OdaFailure.BAD_LENGTH)

        // Step 3 · the card's signature with the card key
        val s = recover(card.sdad.hexToBytes(), nC)
        val l3 = s.size
        if (s.u(0) != 0x6A || (s.u(1) != 0x05 && s.u(1) != 0x95) || s.u(l3 - 1) != 0xBC) fail(OdaFailure.SDAD_HEADER)

        // Step 4 · freshness: termData starts with this session's UN, and the signature covers it
        val termData = card.termData.hexToBytes()
        if (card.un.length != 8 || termData.size < 4 || !termData.copyOfRange(0, 4).toHex().equals(card.un, true)) {
            fail(OdaFailure.UN_MISMATCH)
        }
        if (!sha1(s.range(1, l3 - 22), termData).contentEquals(s.range(l3 - 21, l3 - 2))) fail(OdaFailure.SDAD_HASH)

        return OdaResult(pan, issuerId, minOf(mmyyToMonth(issuerExpiry), mmyyToMonth(iccExpiry)))
    }

    /** MMYY → month index (YY * 12 + MM - 1), the same scale as interfaces F1. */
    fun mmyyToMonth(mmyy: String): Int = mmyy.substring(2, 4).toInt() * 12 + mmyy.substring(0, 2).toInt() - 1

    private fun recover(sig: ByteArray, modulus: ByteArray): ByteArray {
        val n = BigInteger(1, modulus)
        val x = BigInteger(1, sig)
        if (sig.size != modulus.size || x >= n) fail(OdaFailure.BAD_LENGTH)
        val raw = x.modPow(BigInteger.valueOf(3), n).toByteArray()
        val trimmed = if (raw.size > modulus.size) raw.copyOfRange(raw.size - modulus.size, raw.size) else raw
        return ByteArray(modulus.size - trimmed.size) + trimmed
    }

    private fun sha1(vararg parts: ByteArray): ByteArray {
        val d = MessageDigest.getInstance("SHA-1")
        parts.forEach { d.update(it) }
        return d.digest()
    }

    private fun bcdDigits(b: ByteArray): String = b.toHex().substringBefore('F')

    /** Inclusive range a..b, as written in spec H. */
    private fun ByteArray.range(a: Int, b: Int) = copyOfRange(a, b + 1)
    private fun ByteArray.u(i: Int) = this[i].toInt() and 0xFF
    private fun fail(code: OdaFailure): Nothing = throw OdaException(code)
}
