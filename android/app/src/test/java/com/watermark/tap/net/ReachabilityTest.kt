package com.watermark.tap.net

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReachabilityTest {
    @Test
    fun `LAN addresses are local, public hosts are not`() {
        assertTrue(Reachability.isLocal("192.168.1.20"))
        assertTrue(Reachability.isLocal("10.0.0.5"))
        assertTrue(Reachability.isLocal("172.20.10.2"))
        assertTrue(Reachability.isLocal("macbook.local"))
        assertFalse(Reachability.isLocal("172.32.0.1"))
        assertFalse(Reachability.isLocal("example.trycloudflare.com"))
    }

    @Test
    fun `the advice matches where the server is`() {
        assertTrue(Reachability.unreachable("prover", "http://192.168.1.20:8787").contains("hotspot"))
        val tunnel = Reachability.unreachable("prover", "https://example.trycloudflare.com")
        assertTrue(tunnel.contains("internet"))
        assertFalse(tunnel.contains("Wi-Fi"))
    }
}
