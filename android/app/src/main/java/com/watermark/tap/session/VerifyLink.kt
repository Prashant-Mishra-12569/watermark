package com.watermark.tap.session

import java.math.BigInteger
import java.net.URI
import java.net.URLDecoder

/** Chains a session may target (interfaces F10). */
val SUPPORTED_CHAINS = setOf(1874L, 1337L)

/** A parsed watermark://verify link (interfaces F1). All values are still untrusted until the signature checks out. */
sealed interface VerifyLink {
    data class Full(
        val wallet: String,
        val appId: BigInteger,
        val nonce: ByteArray,
        val expiresAt: Long,
        val validUntilMonth: Int,
        val chainId: Long,
        val registry: String,
        val signature: ByteArray,
        val proverUrl: String,
    ) : VerifyLink {
        val walletLast4: String get() = wallet.takeLast(4)
    }

    /** QR fallback when the full link is too dense: the app fetches the signed session by ID. */
    data class Short(val sessionId: String, val relayerUrl: String) : VerifyLink
}

class VerifyLinkException(message: String) : IllegalArgumentException(message)

private val ADDRESS = Regex("^0x[0-9a-fA-F]{40}$")
private val BYTES32 = Regex("^0x[0-9a-fA-F]{64}$")
private val SIG65 = Regex("^0x[0-9a-fA-F]{130}$")
private val DECIMAL = Regex("^[0-9]{1,78}$")
private val SESSION_ID = Regex("^[A-Za-z0-9_-]{6,64}$")

object VerifyLinkParser {
    fun parse(link: String): VerifyLink {
        val uri = try {
            URI(link)
        } catch (e: Exception) {
            throw VerifyLinkException("not a valid link")
        }
        if (uri.scheme != "watermark" || uri.host != "verify") throw VerifyLinkException("not a Watermark link")
        val q = query(uri.rawQuery ?: "")

        q["id"]?.let { id ->
            if (!SESSION_ID.matches(id)) throw VerifyLinkException("bad session id")
            return VerifyLink.Short(id, httpUrl(q.require("p")))
        }

        val appId = decimal(q.require("app"))
        if (appId.bitLength() > 248) throw VerifyLinkException("appId too large")
        val chainId = decimal(q.require("c")).toLong()
        if (chainId !in SUPPORTED_CHAINS) throw VerifyLinkException("unsupported chain")

        return VerifyLink.Full(
            wallet = q.require("w").also { if (!ADDRESS.matches(it)) throw VerifyLinkException("bad wallet") },
            appId = appId,
            nonce = hex(q.require("n"), BYTES32, "bad nonce"),
            expiresAt = decimal(q.require("e")).toLong(),
            validUntilMonth = decimal(q.require("v")).toInt(),
            chainId = chainId,
            registry = q.require("r").also { if (!ADDRESS.matches(it)) throw VerifyLinkException("bad registry") },
            signature = hex(q.require("sig"), SIG65, "bad signature"),
            proverUrl = httpUrl(q.require("p")),
        )
    }

    private fun query(raw: String): Map<String, String> =
        raw.split("&").filter { it.isNotEmpty() }.associate { part ->
            val i = part.indexOf('=')
            if (i <= 0) throw VerifyLinkException("bad query")
            URLDecoder.decode(part.substring(0, i), "UTF-8") to URLDecoder.decode(part.substring(i + 1), "UTF-8")
        }

    private fun Map<String, String>.require(key: String): String =
        this[key]?.takeIf { it.isNotEmpty() } ?: throw VerifyLinkException("missing $key")

    private fun decimal(s: String): BigInteger {
        if (!DECIMAL.matches(s)) throw VerifyLinkException("bad number")
        return BigInteger(s)
    }

    private fun hex(s: String, pattern: Regex, error: String): ByteArray {
        if (!pattern.matches(s)) throw VerifyLinkException(error)
        return s.substring(2).chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }

    private fun httpUrl(s: String): String {
        val u = try {
            URI(s)
        } catch (e: Exception) {
            throw VerifyLinkException("bad url")
        }
        if (u.scheme != "http" && u.scheme != "https" || u.host.isNullOrEmpty()) throw VerifyLinkException("bad url")
        return s.trimEnd('/')
    }
}
