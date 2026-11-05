package com.watermark.tap.emv

import com.watermark.tap.session.Challenge
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * End-to-end card reading against a fake card that answers the same APDUs, with the same record layout,
 * as our real RuPay cards, but with the synthetic test card's keys (tools/testcard/fixtures/rupay-768.json).
 */
class EmvReaderTest {
    private val fixture = File("../../tools/testcard/fixtures/rupay-768.json").readText()
    private fun field(name: String): String =
        Regex("\"$name\"\\s*:\\s*\"([^\"]*)\"").find(fixture)?.groupValues?.get(1) ?: error("no $name in fixture")

    private val caModulus = field("caModulus").hexToBytes()
    private val sessionNonce = ByteArray(32) { 0x11 } // the fixture's nonce; UN = 02d449a3
    private val un = Challenge.deriveUn(sessionNonce)

    /** Same PDOL, AIP and AFL as the real cards. The record contents come from the fixture. */
    private inner class FakeCard(private val signedUn: String = field("un")) : Transceiver {
        val sent = mutableListOf<String>()
        private val aid = "A0000005241010"
        private val pdol = "9F4005DF3A059F33039F09029F15029A039F21039F3704DF16029F1C08"

        override fun transceive(apdu: ByteArray): ByteArray {
            val hex = apdu.toHex()
            sent += hex
            return when {
                hex.startsWith("00A404000E") -> ok(tlv("6F", tlv("84", "2PAY.SYS.DDF01".toByteArray().toHex()) +
                    tlv("A5", tlv("BF0C", tlv("61", tlv("4F", aid) + tlv("87", "01"))))))
                hex.startsWith("00A4040007$aid") -> ok(tlv("6F", tlv("84", aid) + tlv("A5", tlv("50", "52555041") + tlv("9F38", pdol))))
                hex.startsWith("80A8") -> {
                    // The UN must be in the PDOL data at the 9F37 position (after 5+5+3+2+2+3+3 bytes)
                    val pdolData = hex.substring(14)
                    val sentUn = pdolData.substring(46, 54)
                    if (!sentUn.equals(signedUn, true)) error("fake card can only sign UN $signedUn, got $sentUn")
                    ok(tlv("77", tlv("82", AIP) + tlv("94", "08030301100102001807080020010100")))
                }
                hex == "00B2030C00" -> ok(tlv("70", recordValue()))
                hex == "00B2011400" -> ok(tlv("70", tlv("9F32", "03") + tlv("92", "") + tlv("8F", field("caIndex")) + tlv("9F47", "03")))
                // 9F4A = 82 (AIP is signed) sits outside the ODA records, as tag lists allow
                hex == "00B2021400" -> ok(tlv("70", tlv("9F42", "0356") + tlv("9F4A", "82")))
                hex == "00B2071C00" -> ok(tlv("70", tlv("9F46", field("iccCert"))))
                hex == "00B2081C00" -> ok(tlv("70", tlv("90", field("issuerCert"))))
                hex == "00B2012400" -> ok(tlv("70", tlv("9F4B", field("sdad"))))
                else -> "6A82".hexToBytes()
            }
        }

        /** The ODA record value is the static data without the trailing AIP. 9F4A = 82 is inside it. */
        private fun recordValue(): String {
            val sd = field("staticData")
            return sd.substring(0, sd.length - 4)
        }
    }

    @Test
    fun `reads the same card data the fixture holds and it verifies`() {
        val card = FakeCard()
        val data = EmvReader(card).read(un)
        assertEquals("A0000005241010", data.aid)
        assertEquals(field("issuerCert").uppercase(), data.issuerCert)
        assertEquals(field("iccCert").uppercase(), data.iccCert)
        assertEquals(field("sdad").uppercase(), data.sdad)
        assertEquals("", data.issuerRem)
        assertEquals("03", data.iccExp)
        assertEquals(183, data.staticData.length / 2)
        assertEquals(field("staticData").uppercase(), data.staticData)

        val r = OdaVerifier.verify(data, caModulus)
        assertTrue(r.pan.startsWith("990001"))
        assertEquals(359, r.validThroughMonth)
        // Only offline commands: PPSE, SELECT, GPO and READ RECORDs. No GENERATE AC, nothing for a bank.
        assertTrue(card.sent.none { it.startsWith("80AE") })
        assertEquals(9, card.sent.size)
    }

    @Test
    fun `a replayed signature fails the local check`() {
        val data = EmvReader(FakeCard()).read(un)
        val other = "DEADBEEF"
        val ex = assertThrows(OdaException::class.java) {
            OdaVerifier.verify(data.copy(un = other, termData = other), caModulus)
        }
        assertEquals(OdaFailure.SDAD_HASH, ex.code)
    }

    @Test
    fun `the wrong network key fails`() {
        val data = EmvReader(FakeCard()).read(un)
        val ex = assertThrows(OdaException::class.java) { OdaVerifier.verify(data, CaKeys.find("A000000524", "05")!!.modulus) }
        assertTrue(ex.code in setOf(OdaFailure.ISSUER_HEADER, OdaFailure.ISSUER_HASH, OdaFailure.BAD_LENGTH))
    }

    @Test
    fun `card data never prints`() {
        val data = EmvReader(FakeCard()).read(un)
        assertEquals("CardData(aid=A0000005241010, redacted)", data.toString())
    }

    @Test
    fun `the RuPay production key loads and passes its checksum`() {
        assertNotNull(CaKeys.find("A000000524", "05"))
        assertEquals(248, CaKeys.find("A000000524", "05")!!.modulus.size)
    }

    @Test
    fun `PDOL is filled with the UN at 9F37 and our terminal values`() {
        val entries = Dol.parse("9F66049F02069F37049F1A02".hexToBytes())
        val filled = Dol.fill(entries, "01020304".hexToBytes()).toHex()
        assertEquals("37004000" + "000000000100" + "01020304" + "0356", filled)
    }

    @Test
    fun `TLV handles long lengths and nested templates`() {
        val long = "AB".repeat(200)
        val nodes = TlvParser.parse(tlv("70", tlv("9F46", long) + tlv("5F24", "301231")).hexToBytes())
        assertEquals(long, TlvParser.find(nodes, "9F46")!!.value.toHex())
        assertEquals("301231", TlvParser.find(nodes, "5F24")!!.value.toHex())
    }

    companion object {
        const val AIP = "1900"

        fun ok(hex: String) = (hex + "9000").hexToBytes()

        /** Encode a TLV from hex tag and hex value. */
        fun tlv(tag: String, valueHex: String): String {
            val len = valueHex.length / 2
            val l = when {
                len < 0x80 -> "%02X".format(len)
                len < 0x100 -> "81%02X".format(len)
                else -> "82%04X".format(len)
            }
            return tag + l + valueHex
        }
    }
}
