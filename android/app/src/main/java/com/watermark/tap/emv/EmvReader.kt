package com.watermark.tap.emv

/** Sends one APDU and returns the raw response (data + SW1 SW2). IsoDep in the app, a fake card in tests. */
fun interface Transceiver {
    fun transceive(apdu: ByteArray): ByteArray
}

/** The F2 card payload (interfaces F2). Hex is upper-case without 0x, per EMV convention. Held in memory only. */
data class CardData(
    val aid: String,
    val un: String,
    val caIndex: String,
    val issuerCert: String,
    val issuerRem: String,
    val issuerExp: String,
    val iccCert: String,
    val iccRem: String,
    val iccExp: String,
    val staticData: String,
    val sdad: String,
    val sigPath: String,
    val termData: String,
) {
    /** RID = first 5 bytes of the AID; with caIndex it picks the network CA key. */
    val rid: String get() = aid.substring(0, 10)

    // Never print card data, even by accident.
    override fun toString(): String = "CardData(aid=$aid, redacted)"
}

/**
 * Reads the ODA objects from a contactless EMV card (spec section G):
 * SELECT PPSE → SELECT AID → GET PROCESSING OPTIONS (UN in 9F37) → READ RECORD for every AFL entry.
 * Only offline commands are sent. No authorisation ever reaches a bank.
 */
class EmvReader(private val card: Transceiver) {

    fun read(un: ByteArray): CardData {
        val aid = selectApplication()
        val select = send(Apdu.select(aid))
        val fci = TlvParser.parse(select.data)
        val pdol = TlvParser.find(fci, "9F38")?.value?.let { Dol.parse(it) } ?: emptyList()

        val gpo = gpo(pdol, un)
        val gpoTlv = TlvParser.parse(gpo.data)
        val (aip, afl) = aipAndAfl(gpoTlv, gpo.data)

        val found = mutableMapOf<String, ByteArray>()
        collect(gpoTlv, found)
        val staticData = java.io.ByteArrayOutputStream()

        if (afl.isEmpty() || afl.size % 4 != 0) throw EmvException("bad AFL")
        for (offset in afl.indices step 4) {
            val entry = afl.copyOfRange(offset, offset + 4)
            val sfi = (entry[0].toInt() and 0xFF) shr 3
            val first = entry[1].toInt() and 0xFF
            val last = entry[2].toInt() and 0xFF
            val odaCount = entry[3].toInt() and 0xFF
            for (rec in first..last) {
                val r = send(Apdu.readRecord(sfi, rec))
                val nodes = TlvParser.parse(r.data)
                collect(nodes, found)
                if (rec - first < odaCount) {
                    // ODA static data (spec H): SFI 1-10 without the 70 tag and length, SFI 11+ whole record
                    if (sfi <= 10) {
                        val t70 = nodes.firstOrNull { it.tag == "70" } ?: throw EmvException("ODA record not a 70 template")
                        staticData.write(t70.value)
                    } else {
                        staticData.write(r.data)
                    }
                }
            }
        }
        // 9F4A = 82 means the AIP is part of the signed static data
        if (found["9F4A"]?.toHex() == "82") staticData.write(aip)

        val sdad = found["9F4B"] ?: throw EmvException("no signed dynamic data (9F4B)")
        fun need(tag: String) = found[tag]?.toHex() ?: throw EmvException("missing tag $tag")
        return CardData(
            aid = aid.toHex(),
            un = un.toHex(),
            caIndex = need("8F"),
            issuerCert = need("90"),
            issuerRem = found["92"]?.toHex() ?: "",
            issuerExp = need("9F32"),
            iccCert = need("9F46"),
            iccRem = found["9F48"]?.toHex() ?: "",
            iccExp = need("9F47"),
            staticData = staticData.toByteArray().toHex(),
            sdad = sdad.toHex(),
            sigPath = "GPO_FDDA",
            termData = un.toHex(), // RuPay / default fDDA: the signature covers just the UN
        )
    }

    /** PPSE lists the payment apps; prefer RuPay, then any other AID the card offers. */
    private fun selectApplication(): ByteArray {
        val ppse = send(Apdu.selectPpse())
        val aids = TlvParser.findAll(TlvParser.parse(ppse.data), "4F").map { it.value }
        if (aids.isEmpty()) throw EmvException("no payment application")
        return aids.firstOrNull { it.toHex().startsWith(RUPAY_RID) } ?: aids.first()
    }

    /** GPO with the TTQ fallbacks from spec G if the card refuses the first one. */
    private fun gpo(pdol: List<DolEntry>, un: ByteArray): Response {
        var last: Response? = null
        for (ttq in listOf(Dol.TTQ) + Dol.TTQ_FALLBACKS) {
            val r = sendRaw(Apdu.gpo(Dol.fill(pdol, un, ttq)))
            if (r.ok) return r
            last = r
            if (pdol.none { it.tag == "9F66" }) break // TTQ isn't the problem
        }
        throw EmvException("GET PROCESSING OPTIONS refused (${last?.sw})")
    }

    /** Format 1 (tag 80: AIP + AFL raw) or format 2 (tag 77 with 82 and 94). */
    private fun aipAndAfl(nodes: List<Tlv>, raw: ByteArray): Pair<ByteArray, ByteArray> {
        TlvParser.find(nodes, "80")?.let {
            if (it.value.size < 2) throw EmvException("bad GPO format 1")
            return it.value.copyOfRange(0, 2) to it.value.copyOfRange(2, it.value.size)
        }
        val aip = TlvParser.find(nodes, "82")?.value ?: throw EmvException("no AIP")
        val afl = TlvParser.find(nodes, "94")?.value ?: throw EmvException("no AFL")
        return aip to afl
    }

    private fun collect(nodes: List<Tlv>, into: MutableMap<String, ByteArray>) {
        for (n in nodes) {
            if (n.children.isEmpty() || !n.isConstructed) into.putIfAbsent(n.tag, n.value)
            collect(n.children, into)
        }
    }

    private fun send(apdu: ByteArray): Response {
        val r = sendRaw(apdu)
        if (!r.ok) throw EmvException("card refused command (${r.sw})")
        return r
    }

    /** Handles 61xx (more data: GET RESPONSE) and 6Cxx (wrong Le: resend). */
    private fun sendRaw(apdu: ByteArray): Response {
        var r = Response.of(card.transceive(apdu))
        if (r.sw1 == 0x6C) {
            r = Response.of(card.transceive(apdu.copyOf(apdu.size - 1) + r.sw2.toByte()))
        }
        var data = r.data
        while (r.sw1 == 0x61) {
            r = Response.of(card.transceive(Apdu.getResponse(r.sw2)))
            data += r.data
        }
        return Response(data, r.sw1, r.sw2)
    }

    companion object {
        const val RUPAY_RID = "A000000524"
    }
}
