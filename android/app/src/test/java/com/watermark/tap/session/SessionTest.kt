package com.watermark.tap.session

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionTest {
    private val wallet = "0x" + "ab".repeat(20)
    private val registry = "0x" + "cd".repeat(20)
    private val nonce = "0x" + "11".repeat(32)
    private val sig = "0x" + "22".repeat(65)

    private fun link(chain: String = "1874", extra: String = "") =
        "watermark://verify?w=$wallet&app=12345&n=$nonce&e=1893456000&v=325&c=$chain&r=$registry" +
            "&sig=$sig&p=http%3A%2F%2F192.168.1.20%3A8787$extra"

    @Test
    fun `UN is the first 4 bytes of sha256(nonce)`() {
        // Same vectors as sdk/src/session.test.ts and the test card fixture
        assertArrayEquals(hex("66687aad"), Challenge.deriveUn(ByteArray(32)))
        assertArrayEquals(hex("02d449a3"), Challenge.deriveUn(ByteArray(32) { 0x11 }))
    }

    @Test
    fun `month index matches the F1 formula`() {
        assertEquals(322, Challenge.monthIndex(1793923200L)) // 2026-11-06
        assertEquals(324, Challenge.monthIndex(1798761600L)) // 2027-01-01
    }

    @Test
    fun `parses a full link`() {
        val l = VerifyLinkParser.parse(link()) as VerifyLink.Full
        assertEquals("abab", l.walletLast4)
        assertEquals(1874L, l.chainId)
        assertEquals(325, l.validUntilMonth)
        assertEquals("http://192.168.1.20:8787", l.proverUrl)
        assertEquals(32, l.nonce.size)
        assertEquals(65, l.signature.size)
    }

    @Test
    fun `parses the short fallback link`() {
        val l = VerifyLinkParser.parse("watermark://verify?id=abc123XYZ&p=https%3A%2F%2Frelay.example") as VerifyLink.Short
        assertEquals("abc123XYZ", l.sessionId)
    }

    @Test
    fun `rejects bad links`() {
        val bad = listOf(
            "https://verify?w=1",
            "watermark://other?w=1",
            link(chain = "1"),
            link().replace("n=$nonce", "n=0x1234"),
            link().replace("sig=$sig", "sig=0x22"),
            link().replace("w=$wallet", "w=nope"),
            link().replace("app=12345", "app=-1"),
            link().replace("p=http%3A%2F%2F192.168.1.20%3A8787", "p=ftp%3A%2F%2Fx"),
        )
        bad.forEach { b -> assertThrows(VerifyLinkException::class.java) { VerifyLinkParser.parse(b) } }
    }

    @Test
    fun `rejects an appId wider than 248 bits`() {
        val big = java.math.BigInteger.ONE.shiftLeft(249).toString()
        assertTrue(runCatching { VerifyLinkParser.parse(link().replace("app=12345", "app=$big")) }.isFailure)
    }

    private fun hex(s: String) = s.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}
