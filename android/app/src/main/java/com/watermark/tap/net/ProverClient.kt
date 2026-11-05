package com.watermark.tap.net

/** Prover API (interfaces F3). Responses never contain card data. */
sealed interface ProveOutcome {
    data class Stamped(val txHash: String) : ProveOutcome
    /** The proof verified, but no relayer is connected yet to put it on-chain (dev setup). */
    data object ProvedNotStamped : ProveOutcome
    /** A refusal code from F3, e.g. NOT_IN_POLICY, SESSION_USED, BAD_SESSION_SIG. */
    data class Refused(val code: String) : ProveOutcome
    data object TimedOut : ProveOutcome
}

class ProverClient(private val baseUrl: String) {

    /** POST /prove. Returns the jobId, or a refusal code. */
    fun submit(envelopeJson: String): Pair<String?, String?> {
        val r = Http.postJson("$baseUrl/prove", envelopeJson)
        return if (r.code == 202) Http.field(r.body, "jobId") to null else null to (Http.field(r.body, "error") ?: "HTTP_${r.code}")
    }

    /** Polls GET /prove/:jobId until done or error. `onStatus` sees "queued" / "running". */
    fun await(jobId: String, onStatus: (String) -> Unit, timeoutMs: Long = 180_000): ProveOutcome {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val r = Http.get("$baseUrl/prove/$jobId")
            val status = Http.field(r.body, "status")
            when (status) {
                "done" -> {
                    val tx = Http.field(r.body, "txHash")
                    return if (tx != null && tx.length == 66) ProveOutcome.Stamped(tx) else ProveOutcome.ProvedNotStamped
                }
                "error" -> return ProveOutcome.Refused(Http.field(r.body, "error") ?: "BAD_CARD")
                null -> return ProveOutcome.Refused("HTTP_${r.code}")
                else -> onStatus(status)
            }
            Thread.sleep(1_000)
        }
        return ProveOutcome.TimedOut
    }
}
