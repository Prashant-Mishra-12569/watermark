package com.watermark.tap.emv

/** The command APDUs from spec section G. None of them is a payment. */
object Apdu {
    private val PPSE = "2PAY.SYS.DDF01".toByteArray(Charsets.US_ASCII)

    fun selectPpse(): ByteArray = select(PPSE)

    fun select(aid: ByteArray): ByteArray = byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, aid.size.toByte()) + aid + 0x00

    /** GET PROCESSING OPTIONS with the filled PDOL inside a tag 83 template. */
    fun gpo(pdolData: ByteArray): ByteArray {
        val template = byteArrayOf(0x83.toByte(), pdolData.size.toByte()) + pdolData
        return byteArrayOf(0x80.toByte(), 0xA8.toByte(), 0x00, 0x00, template.size.toByte()) + template + 0x00
    }

    fun readRecord(sfi: Int, record: Int): ByteArray =
        byteArrayOf(0x00, 0xB2.toByte(), record.toByte(), ((sfi shl 3) or 0x04).toByte(), 0x00)

    fun getResponse(le: Int): ByteArray = byteArrayOf(0x00, 0xC0.toByte(), 0x00, 0x00, le.toByte())
}

/** A response split into data and the two status bytes. */
class Response(val data: ByteArray, val sw1: Int, val sw2: Int) {
    val ok: Boolean get() = sw1 == 0x90 && sw2 == 0x00
    val sw: String get() = "%02X%02X".format(sw1, sw2)

    companion object {
        fun of(raw: ByteArray): Response {
            if (raw.size < 2) throw EmvException("short response")
            return Response(raw.copyOfRange(0, raw.size - 2), raw[raw.size - 2].toInt() and 0xFF, raw[raw.size - 1].toInt() and 0xFF)
        }
    }
}

class EmvException(message: String) : Exception(message)
