package com.watermark.tap.crypto

import com.watermark.tap.emv.CardData
import com.watermark.tap.emv.hexToBytes
import com.watermark.tap.session.SessionVerifier
import com.watermark.tap.session.VerifyLink
import com.watermark.tap.session.VerifyLinkParser
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.security.KeyPairGenerator
import java.security.spec.MGF1ParameterSpec
import java.util.Base64
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource
import javax.crypto.spec.SecretKeySpec

class EnvelopeEncryptorTest {
    private val fixture = File("../../tools/testcard/fixtures/rupay-768.json").readText()
    private fun field(name: String) = Regex("\"$name\"\\s*:\\s*\"([^\"]*)\"").find(fixture)!!.groupValues[1]

    // The same session as SessionVerifierTest / sdk session.test.ts, signed by the public dev signer.
    private val link = VerifyLinkParser.parse(
        "watermark://verify?w=0x00000000000000000000000000000000000ab1e5&app=12345&n=0x${"11".repeat(32)}" +
            "&e=1893456000&v=325&c=1874&r=0x0000000000000000000000000000000000000001" +
            "&sig=0x292c55891ad5057fb844b0905c5d05d302ee7b22074f7fb01afb15686ec5cb12" +
            "31c47253b8148b9e2e3285abf6005f0d0c6afa39b7414f96878dfa5e73901feb1c&p=http%3A%2F%2F127.0.0.1%3A8787",
    ) as VerifyLink.Full

    private val card = CardData(
        aid = "A0000005241010", un = field("un").uppercase(), caIndex = field("caIndex"),
        issuerCert = field("issuerCert").uppercase(), issuerRem = "", issuerExp = "03",
        iccCert = field("iccCert").uppercase(), iccRem = "", iccExp = "03",
        staticData = field("staticData").uppercase(), sdad = field("sdad").uppercase(),
        sigPath = "GPO_FDDA", termData = field("termData").uppercase(),
    )

    private val keys = KeyPairGenerator.getInstance("RSA").apply { initialize(3072) }.generateKeyPair()

    private fun part(json: String, name: String) = Regex("\"$name\":\"0x([0-9a-f]*)\"").find(json)!!.groupValues[1].hexToBytes()

    private fun open(json: String, aad: ByteArray): String {
        val rsa = Cipher.getInstance("RSA/ECB/OAEPPadding")
        rsa.init(Cipher.DECRYPT_MODE, keys.private, OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT))
        val aes = rsa.doFinal(part(json, "ek"))
        val gcm = Cipher.getInstance("AES/GCM/NoPadding")
        gcm.init(Cipher.DECRYPT_MODE, SecretKeySpec(aes, "AES"), GCMParameterSpec(128, part(json, "iv")))
        gcm.updateAAD(aad)
        return String(gcm.doFinal(part(json, "ct")), Charsets.UTF_8)
    }

    @Test
    fun `round trip opens with the session digest as AAD`() {
        val env = EnvelopeEncryptor.seal(link, card, keys.public)
        val plain = open(env, SessionVerifier.sessionDigest(link))
        assertTrue(plain.contains("\"sdad\":\"${card.sdad}\""))
        assertEquals(12, part(env, "iv").size)
        assertEquals(384, part(env, "ek").size) // RSA-3072
    }

    @Test
    fun `a different session's AAD fails`() {
        val env = EnvelopeEncryptor.seal(link, card, keys.public)
        assertThrows(AEADBadTagException::class.java) { open(env, ByteArray(32)) }
    }

    @Test
    fun `the PEM loader reads an SPKI public key`() {
        val pem = "-----BEGIN PUBLIC KEY-----\n" + Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(keys.public.encoded) +
            "\n-----END PUBLIC KEY-----\n"
        assertArrayEquals(keys.public.encoded, EnvelopeEncryptor.publicKeyFromPem(pem).encoded)
    }

    /** Writes an envelope + its private key for the Node prover to open (interop check, see prover tests). */
    @Test
    fun `writes an interop envelope for the node prover`() {
        val dir = File("build/interop").apply { mkdirs() }
        File(dir, "envelope.json").writeText(EnvelopeEncryptor.seal(link, card, keys.public))
        File(dir, "key.pem").writeText(
            "-----BEGIN PRIVATE KEY-----\n" + Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(keys.private.encoded) +
                "\n-----END PRIVATE KEY-----\n",
        )
    }
}
