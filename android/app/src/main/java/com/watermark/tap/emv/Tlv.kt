package com.watermark.tap.emv

/** One BER-TLV node. Tags are kept as upper-case hex (e.g. "9F4B"). */
class Tlv(val tag: String, val value: ByteArray, val children: List<Tlv>) {
    val isConstructed: Boolean get() = (tag.substring(0, 2).toInt(16) and 0x20) != 0
}

class TlvException(message: String) : Exception(message)

object TlvParser {
    fun parse(data: ByteArray): List<Tlv> {
        val out = mutableListOf<Tlv>()
        var i = 0
        while (i < data.size) {
            // Skip padding bytes between objects (00 or FF), as EMV allows
            if (data[i] == 0x00.toByte() || data[i] == 0xFF.toByte()) {
                i++
                continue
            }
            val tagStart = i
            val first = data[i++].toInt() and 0xFF
            if ((first and 0x1F) == 0x1F) {
                do {
                    if (i >= data.size) throw TlvException("truncated tag")
                } while ((data[i++].toInt() and 0x80) != 0)
            }
            val tag = data.copyOfRange(tagStart, i).toHex()

            if (i >= data.size) throw TlvException("missing length")
            var len = data[i++].toInt() and 0xFF
            if (len > 0x80) {
                val n = len - 0x80
                if (n > 3 || i + n > data.size) throw TlvException("bad length")
                len = 0
                repeat(n) { len = (len shl 8) or (data[i++].toInt() and 0xFF) }
            } else if (len == 0x80) {
                throw TlvException("indefinite length")
            }
            if (i + len > data.size) throw TlvException("value overruns data")
            val value = data.copyOfRange(i, i + len)
            i += len

            val constructed = (first and 0x20) != 0
            out += Tlv(tag, value, if (constructed) parse(value) else emptyList())
        }
        return out
    }

    /** Depth-first search for the first node with this tag. */
    fun find(nodes: List<Tlv>, tag: String): Tlv? {
        for (n in nodes) {
            if (n.tag == tag) return n
            find(n.children, tag)?.let { return it }
        }
        return null
    }

    fun findAll(nodes: List<Tlv>, tag: String): List<Tlv> =
        nodes.flatMap { (if (it.tag == tag) listOf(it) else emptyList()) + findAll(it.children, tag) }
}

fun ByteArray.toHex(): String = joinToString("") { "%02X".format(it) }

fun String.hexToBytes(): ByteArray {
    val s = removePrefix("0x")
    require(s.length % 2 == 0) { "odd hex length" }
    return s.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}
