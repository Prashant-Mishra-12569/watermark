package com.watermark.tap.policy

import com.watermark.tap.net.Http

/** One filter leaf (interfaces F8): network + the first 6 or 8 PAN digits. */
data class PolicyLeaf(val networkId: Int, val prefixLength: Int, val prefix: String)

/** An app's public filter, as served by GET /policy/:appId. */
data class Policy(val label: String, val environment: String, val leaves: List<PolicyLeaf>) {

    /**
     * Spec M step 6: refuse locally, so a card outside the filter never leaves the phone.
     * `pan` comes from the SIGNED card certificate (OdaVerifier), never from an unsigned tag.
     * The circuit and the contract enforce the real rulesRoot, so a wrong list here can't produce a false stamp.
     */
    fun allows(networkId: Int, pan: String): Boolean =
        leaves.any { it.networkId == networkId && it.prefix.length == it.prefixLength && pan.startsWith(it.prefix) }

    /** Short text for the consent screen, e.g. "RuPay debit (India) · 6,258 card ranges". */
    val summary: String
        get() {
            val n = leaves.size
            val ranges = if (n == 1) "1 card range" else "%,d card ranges".format(n)
            val env = if (environment == "test") " · TEST" else ""
            return "${label.ifBlank { "This app's filter" }} · $ranges$env"
        }

    companion object {
        private val LEAF = Regex("""\{\s*"networkId"\s*:\s*(\d+)\s*,\s*"prefixLength"\s*:\s*(\d+)\s*,\s*"prefix"\s*:\s*"(\d{6,8})"\s*}""")

        /** Parses the prover's /policy response. Unknown fields are ignored. */
        fun parse(json: String): Policy = Policy(
            label = Http.field(json, "label") ?: "",
            environment = Http.field(json, "environment") ?: "test",
            leaves = LEAF.findAll(json).map {
                PolicyLeaf(it.groupValues[1].toInt(), it.groupValues[2].toInt(), it.groupValues[3])
            }.toList(),
        )

        /** Network IDs (interfaces F8) by the card's RID. */
        fun networkIdForRid(rid: String): Int? = when (rid.uppercase()) {
            "A000000524" -> 1 // RuPay
            "A000000003" -> 2 // Visa
            "A000000004" -> 3 // Mastercard
            else -> null
        }
    }
}
