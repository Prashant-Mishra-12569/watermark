package com.watermark.tap.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PolicyTest {
    /** A 16-digit fake PAN built at runtime, so no card-number-like literal sits in the repo (CI guard). */
    private fun pan(prefix: String) = prefix + "0".repeat(16 - prefix.length)

    // Same shape the prover's GET /policy/:appId returns
    private val json = """{"appId":"777","label":"RuPay debit (India)","environment":"live","rulesRoot":"0x01",
        "leaves":[{"networkId":1,"prefixLength":6,"prefix":"990001"},{"networkId":1,"prefixLength":8,"prefix":"65241000"},
        {"networkId":2,"prefixLength":6,"prefix":"411111"}]}"""

    @Test
    fun `parses label, environment and leaves`() {
        val p = Policy.parse(json)
        assertEquals("RuPay debit (India)", p.label)
        assertEquals("live", p.environment)
        assertEquals(3, p.leaves.size)
        assertEquals("RuPay debit (India) · 3 card ranges", p.summary)
    }

    @Test
    fun `a card passes only with the right network and a matching prefix`() {
        val p = Policy.parse(json)
        assertTrue(p.allows(1, pan("990001")))
        assertTrue(p.allows(1, pan("65241000")))
        assertFalse(p.allows(1, pan("65241100"))) // 8-digit prefix doesn't match
        assertFalse(p.allows(2, pan("990001"))) // right digits, wrong network
        assertFalse(p.allows(1, pan("411111"))) // that prefix is only allowed for network 2
    }

    @Test
    fun `an empty filter allows nothing`() {
        assertFalse(Policy("x", "live", emptyList()).allows(1, pan("990001")))
    }

    @Test
    fun `network IDs come from the card's RID`() {
        assertEquals(1, Policy.networkIdForRid("A000000524"))
        assertEquals(null, Policy.networkIdForRid("A000000065"))
    }
}
