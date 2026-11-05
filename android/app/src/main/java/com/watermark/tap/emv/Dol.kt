package com.watermark.tap.emv

import java.time.LocalDateTime
import java.time.ZoneOffset

/** One entry of a Data Object List (tag + expected length), e.g. the card's PDOL (tag 9F38). */
data class DolEntry(val tag: String, val length: Int)

object Dol {
    fun parse(dol: ByteArray): List<DolEntry> {
        val out = mutableListOf<DolEntry>()
        var i = 0
        while (i < dol.size) {
            val start = i
            val first = dol[i++].toInt() and 0xFF
            if ((first and 0x1F) == 0x1F) {
                while (i < dol.size && (dol[i].toInt() and 0x80) != 0) i++
                i++
            }
            if (i >= dol.size) throw TlvException("truncated DOL")
            val tag = dol.copyOfRange(start, i).toHex()
            out += DolEntry(tag, dol[i++].toInt() and 0xFF)
        }
        return out
    }

    /**
     * Fills a DOL with our terminal values (spec section G) and the session UN in 9F37.
     * The amount in 9F02 is a terminal value only: nothing is ever sent to a bank, so nothing is charged.
     * Unknown tags are zeros. Values are left-truncated or zero-padded to the length the card asks for.
     */
    fun fill(entries: List<DolEntry>, un: ByteArray, ttq: ByteArray = TTQ, now: LocalDateTime = nowUtc()): ByteArray {
        require(un.size == 4) { "UN must be 4 bytes" }
        val values = terminalValues(un, ttq, now)
        val out = java.io.ByteArrayOutputStream()
        for (e in entries) out.write(fit(values[e.tag] ?: ByteArray(0), e.length))
        return out.toByteArray()
    }

    /** Terminal Transaction Qualifiers: first choice, then the spec's fallbacks if the card refuses. */
    val TTQ = "37004000".hexToBytes()
    val TTQ_FALLBACKS = listOf("36000000".hexToBytes(), "3E004000".hexToBytes())

    private fun terminalValues(un: ByteArray, ttq: ByteArray, now: LocalDateTime): Map<String, ByteArray> = mapOf(
        "9F66" to ttq,
        "9F02" to "000000000100".hexToBytes(), // amount 1.00, terminal value only
        "9F03" to ByteArray(6),
        "9F1A" to "0356".hexToBytes(), // terminal country: India
        "5F2A" to "0356".hexToBytes(), // currency: INR
        "9F33" to "E0F0C8".hexToBytes(), // terminal capabilities
        "9F40" to "6000F0A001".hexToBytes(), // additional terminal capabilities
        "9F35" to "22".hexToBytes(), // terminal type
        "9F1C" to "WMTEST01".toByteArray(Charsets.US_ASCII), // terminal ID
        "9F09" to "0002".hexToBytes(), // application version number
        "9F15" to "5999".hexToBytes(), // merchant category code
        "9C" to "00".hexToBytes(),
        "95" to ByteArray(5),
        "9A" to bcd("%02d%02d%02d".format(now.year % 100, now.monthValue, now.dayOfMonth)),
        "9F21" to bcd("%02d%02d%02d".format(now.hour, now.minute, now.second)),
        "9F37" to un,
    )

    private fun fit(v: ByteArray, len: Int): ByteArray = when {
        v.size == len -> v
        v.size > len -> v.copyOfRange(v.size - len, v.size)
        else -> ByteArray(len - v.size) + v
    }

    private fun bcd(digits: String): ByteArray = digits.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    private fun nowUtc(): LocalDateTime = LocalDateTime.now(ZoneOffset.UTC)
}
