package com.watermark.tap.session

import org.bouncycastle.asn1.x9.X9IntegerConverter
import org.bouncycastle.crypto.digests.KeccakDigest
import org.bouncycastle.crypto.ec.CustomNamedCurves
import org.bouncycastle.math.ec.ECAlgorithms
import java.math.BigInteger

/**
 * Checks that a watermark://verify session was signed by the app's session signer (interfaces F1).
 * EIP-712 domain: name "Watermark", version "1", chainId, verifyingContract = registry.
 * Must produce the same digest as sdk/src/session.ts hashSession() and the registry contract.
 */
object SessionVerifier {

    fun isSignedBy(link: VerifyLink.Full, allowedSigner: String): Boolean {
        val signer = Secp256k1.recoverAddress(sessionDigest(link), link.signature) ?: return false
        return signer.equals(allowedSigner, ignoreCase = true)
    }

    fun sessionDigest(link: VerifyLink.Full): ByteArray {
        val structHash = keccak(
            SESSION_TYPEHASH,
            address(link.wallet),
            word(link.appId),
            link.nonce,
            word(BigInteger.valueOf(link.expiresAt)),
            word(BigInteger.valueOf(link.validUntilMonth.toLong())),
            word(BigInteger.valueOf(link.chainId)),
            address(link.registry),
        )
        return keccak(byteArrayOf(0x19, 0x01), domainSeparator(link.chainId, link.registry), structHash)
    }

    fun domainSeparator(chainId: Long, registry: String): ByteArray = keccak(
        DOMAIN_TYPEHASH,
        keccak("Watermark".toByteArray()),
        keccak("1".toByteArray()),
        word(BigInteger.valueOf(chainId)),
        address(registry),
    )

    private val DOMAIN_TYPEHASH =
        keccak("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)".toByteArray())
    private val SESSION_TYPEHASH = keccak(
        ("Session(address wallet,uint256 appId,bytes32 nonce,uint64 expiresAt,uint32 validUntilMonth," +
            "uint256 chainId,address registry)").toByteArray(),
    )
}

fun keccak(vararg parts: ByteArray): ByteArray {
    val d = KeccakDigest(256)
    parts.forEach { d.update(it, 0, it.size) }
    return ByteArray(32).also { d.doFinal(it, 0) }
}

/** ABI-encode an unsigned integer as one 32-byte big-endian word. */
fun word(x: BigInteger): ByteArray {
    require(x.signum() >= 0 && x.bitLength() <= 256) { "uint256 out of range" }
    val raw = x.toByteArray().let { if (it.size > 32) it.copyOfRange(it.size - 32, it.size) else it }
    return ByteArray(32 - raw.size) + raw
}

/** ABI-encode an address (0x + 40 hex) as a 32-byte word. */
fun address(hex: String): ByteArray {
    require(hex.length == 42 && hex.startsWith("0x")) { "bad address" }
    return ByteArray(12) + hex.substring(2).chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}

object Secp256k1 {
    private val params = CustomNamedCurves.getByName("secp256k1")
    private val n: BigInteger = params.n
    private val halfN: BigInteger = n.shiftRight(1)

    /**
     * ecrecover: the 0x address that produced a 65-byte (r, s, v) signature over a 32-byte digest,
     * or null if the signature is malformed. High-s signatures are rejected, as OpenZeppelin's ECDSA does.
     */
    fun recoverAddress(digest: ByteArray, sig: ByteArray): String? {
        if (digest.size != 32 || sig.size != 65) return null
        val r = BigInteger(1, sig.copyOfRange(0, 32))
        val s = BigInteger(1, sig.copyOfRange(32, 64))
        val v = sig[64].toInt() and 0xff
        val recId = if (v >= 27) v - 27 else v
        if (recId !in 0..1) return null
        if (r.signum() <= 0 || r >= n || s.signum() <= 0 || s > halfN) return null

        val conv = X9IntegerConverter()
        val enc = conv.integerToBytes(r, 1 + conv.getByteLength(params.curve))
        enc[0] = if (recId == 1) 0x03 else 0x02
        val bigR = try {
            params.curve.decodePoint(enc)
        } catch (e: IllegalArgumentException) {
            return null
        }

        val e = BigInteger(1, digest)
        val rInv = r.modInverse(n)
        val q = ECAlgorithms.sumOfTwoMultiplies(
            params.g, e.negate().mod(n).multiply(rInv).mod(n),
            bigR, s.multiply(rInv).mod(n),
        ).normalize()
        if (q.isInfinity) return null

        val pub = q.getEncoded(false).copyOfRange(1, 65)
        val addr = keccak(pub).copyOfRange(12, 32)
        return "0x" + addr.joinToString("") { "%02x".format(it) }
    }
}
