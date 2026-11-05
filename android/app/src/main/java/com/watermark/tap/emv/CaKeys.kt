package com.watermark.tap.emv

import java.security.MessageDigest

/**
 * Public network CA keys: the same keys every payment terminal stores. Each is checked against its published
 * SHA-1 checksum (RID || index || modulus || exponent) when loaded, so a typo can't slip in.
 *
 * RuPay production key 05: 1984-bit, exponent 3, expires 2029-12-31. Its checksum was verified on 2026-11-06.
 * Source: the public CAPK list in github.com/mmors-1/nfc10 (EmvDemo-20241017/app/src/main/assets/capk.xml).
 * Visa and Mastercard keys are not included because they are untested on real cards.
 */
data class CaKey(val rid: String, val index: String, val modulus: ByteArray, val exponent: ByteArray)

object CaKeys {
    private val RUPAY_05 = load(
        rid = "A000000524",
        index = "05",
        modulus = "C04E80180369898AAEF6EE7741EDED25239D765301614B5B41A008CA3009358D626D828BC5F1B1E04A2DC1367101266905D2" +
            "62003BE747FD231C9B0011F2F2B21BA8E4C0F4CA5E93ED9DBB2E92ABC450576A4EB59AD00DCA59C8BF3230E4B19D43452871C621" +
            "5D837663310DF43CAEA1B9B08C1F500AF1B550F62E18D70EEE9E9475321BCD1799AB193E0BC849DACE892A0E6A1F42FE0786DB30" +
            "345AE1A0E7E4C4B71640E03BFD2832C491A7D83F3B4EF4D388CDDBB748C2FD1D9D4A9BF52FC856CBA088D4B274846002C23CDA72" +
            "2C5CFF3B1F8218A1843B0426474BDC92F2F5E31FBF321CC17480AD069DF55381F2E601D5CBA7B871253F",
        exponent = "03",
        checksum = "7081DF2A0C36360F24C122C574F0AD2E57893DD2",
    )

    private val keys = listOf(RUPAY_05)

    fun find(rid: String, index: String): CaKey? =
        keys.firstOrNull { it.rid.equals(rid, true) && it.index.equals(index, true) }

    private fun load(rid: String, index: String, modulus: String, exponent: String, checksum: String): CaKey {
        val key = CaKey(rid, index, modulus.hexToBytes(), exponent.hexToBytes())
        val sha1 = MessageDigest.getInstance("SHA-1")
            .digest(rid.hexToBytes() + index.hexToBytes() + key.modulus + key.exponent)
        check(sha1.toHex() == checksum) { "CA key $rid/$index checksum mismatch" }
        return key
    }
}
