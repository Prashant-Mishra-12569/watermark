package com.watermark.tap.net

import com.watermark.tap.session.VerifyLink
import com.watermark.tap.session.VerifyLinkException
import com.watermark.tap.session.VerifyLinkParser
import java.net.URLEncoder

/** Relayer calls the app makes (interfaces F6). */
class RelayerClient(private val baseUrl: String) {

    /**
     * QR fallback: GET /session/:id returns { session, sig, proverUrl }. The result is rebuilt into a full
     * watermark:// link and parsed by the same validator as a scanned QR, so nothing is trusted unchecked.
     * The signature is still verified against the built-in signer afterwards.
     */
    fun fetchSession(short: VerifyLink.Short): VerifyLink.Full {
        val r = Http.get("$baseUrl/session/${short.sessionId}")
        if (r.code != 200) throw VerifyLinkException(if (r.code == 404) "session not found or expired" else "relayer error ${r.code}")
        val b = r.body
        fun s(name: String) = Http.field(b, name) ?: throw VerifyLinkException("relayer response missing $name")
        val month = Regex("\"validUntilMonth\"\\s*:\\s*(\\d+)").find(b)?.groupValues?.get(1)
            ?: throw VerifyLinkException("relayer response missing validUntilMonth")
        val prover = Http.field(b, "proverUrl") ?: throw VerifyLinkException("relayer response missing proverUrl")
        fun enc(v: String) = URLEncoder.encode(v, "UTF-8")
        val link = "watermark://verify?w=${s("wallet")}&app=${s("appId")}&n=${s("nonce")}&e=${s("expiresAt")}" +
            "&v=$month&c=${s("chainId")}&r=${s("registry")}&sig=${s("sig")}&p=${enc(prover)}"
        return VerifyLinkParser.parse(link) as? VerifyLink.Full ?: throw VerifyLinkException("bad session")
    }
}
