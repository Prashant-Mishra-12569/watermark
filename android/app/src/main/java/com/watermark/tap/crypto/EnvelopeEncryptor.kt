package com.watermark.tap.crypto

import com.watermark.tap.emv.CardData
import com.watermark.tap.session.SessionVerifier
import com.watermark.tap.session.VerifyLink
import java.security.KeyFactory
import java.security.PublicKey
import java.security.SecureRandom
import java.security.spec.MGF1ParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource
import javax.crypto.spec.SecretKeySpec

/**
 * Builds the F2 envelope (interfaces F2): card data encrypted to the prover's built-in public key.
 * ek = AES-256 key under RSA-OAEP with SHA-256 *and MGF1-SHA-256* (Java defaults MGF1 to SHA-1, which the
 * Node prover would reject), iv = 12 bytes, ct = AES-256-GCM ciphertext || 16-byte tag,
 * AAD = the session's EIP-712 digest, so the ciphertext only opens for this session.
 * A fake prover URL in a QR only ever receives ciphertext.
 */
object EnvelopeEncryptor {
    private val OAEP = OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT)
    private val random = SecureRandom()

    fun publicKeyFromPem(pem: String): PublicKey {
        val body = pem.lines().filterNot { it.startsWith("-----") }.joinToString("").trim()
        require(body.isNotEmpty()) { "empty prover key" }
        return KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(body)))
    }

    /** Returns the envelope JSON for POST /prove. The plaintext buffer is zeroed before returning. */
    fun seal(link: VerifyLink.Full, card: CardData, proverKey: PublicKey): String {
        val plaintext = cardJson(card).toByteArray(Charsets.UTF_8)
        val aesKey = ByteArray(32).also(random::nextBytes)
        val iv = ByteArray(12).also(random::nextBytes)
        try {
            val gcm = Cipher.getInstance("AES/GCM/NoPadding")
            gcm.init(Cipher.ENCRYPT_MODE, SecretKeySpec(aesKey, "AES"), GCMParameterSpec(128, iv))
            gcm.updateAAD(SessionVerifier.sessionDigest(link))
            val ct = gcm.doFinal(plaintext) // Java appends the 16-byte tag, as F2 requires

            val rsa = Cipher.getInstance("RSA/ECB/OAEPPadding")
            rsa.init(Cipher.ENCRYPT_MODE, proverKey, OAEP)
            val ek = rsa.doFinal(aesKey)

            return """{"v":1,"session":${sessionJson(link)},"sig":"0x${hex(link.signature)}",""" +
                """"ek":"0x${hex(ek)}","iv":"0x${hex(iv)}","ct":"0x${hex(ct)}"}"""
        } finally {
            plaintext.fill(0)
            aesKey.fill(0)
        }
    }

    /** The session exactly as the relayer signed it (interfaces F0 encoding). */
    fun sessionJson(l: VerifyLink.Full): String =
        """{"wallet":"${l.wallet}","appId":"${l.appId}","nonce":"0x${hex(l.nonce)}","expiresAt":"${l.expiresAt}",""" +
            """"validUntilMonth":${l.validUntilMonth},"chainId":"${l.chainId}","registry":"${l.registry}"}"""

    /** F2 payload. Every value is hex from the card, so no escaping is needed; we still check. */
    fun cardJson(c: CardData): String {
        val fields = linkedMapOf(
            "aid" to c.aid, "un" to c.un, "caIndex" to c.caIndex,
            "issuerCert" to c.issuerCert, "issuerRem" to c.issuerRem, "issuerExp" to c.issuerExp,
            "iccCert" to c.iccCert, "iccRem" to c.iccRem, "iccExp" to c.iccExp,
            "staticData" to c.staticData, "sdad" to c.sdad, "termData" to c.termData,
        )
        fields.values.forEach { require(it.all { ch -> ch.isDigit() || ch in 'a'..'f' || ch in 'A'..'F' }) { "card field not hex" } }
        val body = fields.entries.joinToString(",") { (k, v) -> "\"$k\":\"$v\"" }
        return "{$body,\"sigPath\":\"${c.sigPath}\"}"
    }

    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
}
