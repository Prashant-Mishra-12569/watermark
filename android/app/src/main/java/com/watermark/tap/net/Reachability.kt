package com.watermark.tap.net

import java.net.URI

/** The message shown when a server can't be reached. The advice depends on where the server is. */
object Reachability {

    fun unreachable(what: String, url: String): String {
        val host = try { URI(url).host } catch (e: Exception) { null } ?: return "Can't reach the $what. The link looks broken; scan a new QR."
        return if (isLocal(host)) {
            "Can't reach the $what at $host. Put the phone on the same Wi-Fi or hotspot as the $what, then try again."
        } else {
            "Can't reach the $what at $host. Check the phone's internet connection, then try again."
        }
    }

    /** Private IPv4 ranges, localhost and mDNS names: reachable only on the same network. */
    fun isLocal(host: String): Boolean {
        val h = host.lowercase()
        if (h == "localhost" || h.endsWith(".local")) return true
        val p = h.split('.').mapNotNull { it.toIntOrNull() }
        if (p.size != 4) return false
        return p[0] == 10 || p[0] == 127 ||
            (p[0] == 192 && p[1] == 168) ||
            (p[0] == 172 && p[1] in 16..31) ||
            (p[0] == 169 && p[1] == 254)
    }
}
