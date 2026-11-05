package com.watermark.tap.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Cross-language vector: the same session signed in sdk/src/session.test.ts with the public dev signer.
 * If this fails, the app and the relayer disagree about the EIP-712 encoding.
 */
class SessionVerifierTest {
    private val devSigner = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    private val digest = "ad459948c1493e63c5709c092c042ac294970240dd0c96310a0932cc293b1cf4"
    private val sig = "0x292c55891ad5057fb844b0905c5d05d302ee7b22074f7fb01afb15686ec5cb12" +
        "31c47253b8148b9e2e3285abf6005f0d0c6afa39b7414f96878dfa5e73901feb1c"

    private fun link(wallet: String = "0x00000000000000000000000000000000000ab1e5", s: String = sig) =
        VerifyLinkParser.parse(
            "watermark://verify?w=$wallet&app=12345&n=0x${"11".repeat(32)}&e=1893456000&v=325&c=1874" +
                "&r=0x0000000000000000000000000000000000000001&sig=$s&p=http%3A%2F%2F10.0.0.2%3A8787",
        ) as VerifyLink.Full

    @Test
    fun `digest matches the sdk`() {
        assertEquals(digest, SessionVerifier.sessionDigest(link()).toHex())
    }

    @Test
    fun `recovers the dev signer`() {
        assertTrue(SessionVerifier.isSignedBy(link(), devSigner))
    }

    @Test
    fun `a different wallet in the link breaks the signature`() {
        assertFalse(SessionVerifier.isSignedBy(link(wallet = "0x00000000000000000000000000000000000bad00"), devSigner))
    }

    @Test
    fun `a signature from another signer is refused`() {
        assertFalse(SessionVerifier.isSignedBy(link(), "0x0000000000000000000000000000000000000002"))
    }

    @Test
    fun `garbage and high-s signatures don't recover`() {
        assertNull(Secp256k1.recoverAddress(ByteArray(32), ByteArray(65)))
        val highS = ByteArray(65).also { it[0] = 1; it.fill(0xff.toByte(), 32, 64); it[64] = 27 }
        assertNull(Secp256k1.recoverAddress(ByteArray(32), highS))
    }

    private fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }
}
