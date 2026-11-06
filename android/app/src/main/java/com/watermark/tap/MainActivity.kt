package com.watermark.tap

import android.content.Intent
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateOf
import com.watermark.tap.crypto.EnvelopeEncryptor
import com.watermark.tap.emv.CaKeys
import com.watermark.tap.emv.EmvException
import com.watermark.tap.emv.EmvReader
import com.watermark.tap.emv.OdaException
import com.watermark.tap.emv.OdaVerifier
import com.watermark.tap.emv.TlvException
import com.watermark.tap.net.ProveOutcome
import com.watermark.tap.net.ProverClient
import com.watermark.tap.net.Reachability
import com.watermark.tap.net.RelayerClient
import com.watermark.tap.policy.Policy
import com.watermark.tap.session.Challenge
import com.watermark.tap.session.SUPPORTED_CHAINS
import com.watermark.tap.session.SessionVerifier
import com.watermark.tap.session.VerifyLink
import com.watermark.tap.session.VerifyLinkException
import com.watermark.tap.session.VerifyLinkParser
import com.watermark.tap.ui.WatermarkApp
import java.io.IOException
import java.security.PublicKey
import kotlin.concurrent.thread

class MainActivity : ComponentActivity(), NfcAdapter.ReaderCallback {

    private val state = mutableStateOf<TapUiState>(TapUiState.Idle)
    private var nfc: NfcAdapter? = null

    /** The verified session the next tap belongs to. Null means taps are ignored. */
    @Volatile
    private var session: VerifyLink.Full? = null

    /** The app's filter for the current session, from the prover's GET /policy/:appId. Null = not loaded. */
    @Volatile
    private var policy: Policy? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Card screens must not appear in screenshots or the recents list, except in the mirrored demo build.
        if (!BuildConfig.DEMO_MIRROR) {
            window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        }
        nfc = NfcAdapter.getDefaultAdapter(this)
        handle(intent)
        setContent { WatermarkApp(state.value) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onResume() {
        super.onResume()
        // Reader mode: the app talks to the card directly. NDEF is skipped because bank cards don't use it.
        nfc?.enableReaderMode(
            this,
            this,
            NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
            null,
        )
    }

    override fun onPause() {
        super.onPause()
        nfc?.disableReaderMode(this)
    }

    private fun handle(intent: Intent?) {
        val data = intent?.data?.toString() ?: return
        session = null
        state.value = try {
            when (val link = VerifyLinkParser.parse(data)) {
                is VerifyLink.Full -> consentFor(link)
                is VerifyLink.Short -> {
                    // QR fallback: fetch the signed session by ID off the main thread
                    thread(name = "session") {
                        val next = try {
                            consentFor(RelayerClient(link.relayerUrl).fetchSession(link))
                        } catch (e: VerifyLinkException) {
                            TapUiState.InvalidSession(e.message ?: "invalid session")
                        } catch (e: IOException) {
                            TapUiState.Error(Reachability.unreachable("relayer", link.relayerUrl))
                        }
                        show(next)
                    }
                    TapUiState.LoadingSession
                }
            }
        } catch (e: VerifyLinkException) {
            TapUiState.InvalidSession(e.message ?: "invalid link")
        }
    }

    private fun consentFor(link: VerifyLink.Full): TapUiState {
        if (link.expiresAt <= System.currentTimeMillis() / 1000) return TapUiState.Refused(RefusalReason.SESSION_EXPIRED)
        check(link.chainId in SUPPORTED_CHAINS)
        // A QR we didn't sign (fake site, edited link) stops here, before any card is read.
        val trusted = BuildConfig.SESSION_SIGNERS.split(",")
        if (trusted.none { SessionVerifier.isSignedBy(link, it) }) {
            return TapUiState.Refused(RefusalReason.WRONG_SIGNER)
        }
        val adapter = nfc
        if (adapter == null || !adapter.isEnabled) return TapUiState.Refused(RefusalReason.NFC_OFF)
        session = link
        policy = null
        loadPolicy(link)
        return TapUiState.Consent(
            appName = "Watermark",
            filterLabel = "Policy for app ${link.appId.toString().take(8)}…",
            revealsText = "Your wallet will show it was linked to a real bank card that passed this app's filter.",
            walletLast4 = link.walletLast4,
            chainName = if (link.chainId == 1874L) "Whitechain Sepolia" else "Alt mempool devnet",
            expiresAtEpochSec = link.expiresAt,
        )
    }

    /** Runs on an NFC binder thread, so blocking card I/O is fine here. */
    override fun onTagDiscovered(tag: Tag) {
        val link = session
        if (link == null) {
            // No signed session yet: never read a card without one (spec M step 2).
            show(TapUiState.Refused(RefusalReason.NO_SESSION))
            return
        }
        val iso = IsoDep.get(tag) ?: return
        show(TapUiState.Reading)
        val result: TapUiState = try {
            if (link.expiresAt <= System.currentTimeMillis() / 1000) {
                TapUiState.Refused(RefusalReason.SESSION_EXPIRED)
            } else {
                iso.connect()
                iso.timeout = 5000
                val card = EmvReader { apdu -> iso.transceive(apdu) }.read(Challenge.deriveUn(link.nonce))
                show(TapUiState.CheckingLocally)
                val ca = CaKeys.find(card.rid, card.caIndex)
                if (ca == null) {
                    TapUiState.Refused(RefusalReason.BAD_CARD)
                } else {
                    val checked = OdaVerifier.verify(card, ca.modulus)
                    if (checked.validThroughMonth < link.validUntilMonth) {
                        TapUiState.Refused(RefusalReason.EXPIRES_TOO_SOON)
                    } else if (!passesLocalFilter(card.rid, checked.pan)) {
                        // Spec M step 6: refused on the phone, so this card's data is never sent anywhere
                        TapUiState.Refused(RefusalReason.NOT_IN_POLICY)
                    } else {
                        val key = proverKey()
                        if (key == null) {
                            TapUiState.Error("This build has no prover key (prover/keys/prover_pub.pem).")
                        } else {
                            val envelope = EnvelopeEncryptor.seal(link, card, key)
                            session = null // one tap per session
                            thread(name = "prove") { upload(link, envelope) }
                            TapUiState.Sending
                        }
                    }
                }
            }
        } catch (e: IOException) {
            TapUiState.Refused(RefusalReason.NFC_LOST)
        } catch (e: OdaException) {
            TapUiState.Refused(RefusalReason.BAD_CARD)
        } catch (e: EmvException) {
            TapUiState.Refused(RefusalReason.BAD_CARD)
        } catch (e: TlvException) {
            TapUiState.Refused(RefusalReason.BAD_CARD)
        } finally {
            runCatching { iso.close() }
        }
        show(result)
    }

    /** Loads the filter so the consent screen can say what this app allows, and the tap can be checked locally. */
    private fun loadPolicy(link: VerifyLink.Full) {
        thread(name = "policy") {
            val loaded = runCatching { ProverClient(link.proverUrl).policy(link.appId.toString()) }.getOrNull() ?: return@thread
            if (session !== link) return@thread // a newer link replaced this one
            policy = loaded
            runOnUiThread {
                val current = state.value
                if (current is TapUiState.Consent && session === link) {
                    state.value = current.copy(
                        filterLabel = loaded.summary,
                        revealsText = "Your wallet will show it was linked to a real bank card that passed this filter: " +
                            "${loaded.label.ifBlank { "this app's filter" }}. Nothing else about the card.",
                    )
                }
            }
        }
    }

    /**
     * The card's prefix must be in the app's filter, with the network of the key that signed it.
     * If the filter couldn't be loaded, the prover still enforces it, and so do the circuit and the contract.
     */
    private fun passesLocalFilter(rid: String, pan: String): Boolean {
        val p = policy ?: return true
        val network = Policy.networkIdForRid(rid) ?: return false
        return p.allows(network, pan)
    }

    /** POST /prove, then poll the job (interfaces F3). Only ciphertext ever leaves the phone. */
    private fun upload(link: VerifyLink.Full, envelope: String) {
        val prover = ProverClient(link.proverUrl)
        val result = try {
            val (jobId, refused) = prover.submit(envelope)
            if (jobId == null) {
                refusal(refused ?: "BAD_CARD")
            } else {
                show(TapUiState.Proving(jobId))
                when (val o = prover.await(jobId, onStatus = { })) {
                    is ProveOutcome.Stamped -> TapUiState.Stamped(o.txHash, explorerTx(link.chainId, o.txHash))
                    ProveOutcome.ProvedNotStamped -> TapUiState.ProvedNotStamped
                    is ProveOutcome.Refused -> refusal(o.code)
                    ProveOutcome.TimedOut -> TapUiState.Error("The prover took too long. Try again with a new QR.")
                }
            }
        } catch (e: IOException) {
            TapUiState.Error(Reachability.unreachable("prover", link.proverUrl))
        }
        show(result)
    }

    /** F3 error codes → what the user sees. */
    private fun refusal(code: String): TapUiState = when (code) {
        "NOT_IN_POLICY" -> TapUiState.Refused(RefusalReason.NOT_IN_POLICY)
        "EXPIRES_TOO_SOON" -> TapUiState.Refused(RefusalReason.EXPIRES_TOO_SOON)
        "SESSION_EXPIRED" -> TapUiState.Refused(RefusalReason.SESSION_EXPIRED)
        "SESSION_USED" -> TapUiState.Refused(RefusalReason.SESSION_USED)
        "BAD_SESSION_SIG" -> TapUiState.Refused(RefusalReason.WRONG_SIGNER)
        "CARD_ALREADY_LINKED" -> TapUiState.Refused(RefusalReason.CARD_ALREADY_LINKED)
        "BUSY" -> TapUiState.Error("The prover is busy. Try again in a moment with a new QR.")
        "STAMP_REJECTED" -> TapUiState.Error("The proof was made but the chain refused the stamp.")
        else -> TapUiState.Refused(RefusalReason.BAD_CARD)
    }

    private fun explorerTx(chainId: Long, tx: String): String =
        if (chainId == 1874L) "https://explorer.testnet.whitechain.io/tx/$tx" else "https://explorer.altmempool.wtf/tx/$tx"

    private fun proverKey(): PublicKey? = runCatching {
        assets.open("prover_pub.pem").bufferedReader().use { EnvelopeEncryptor.publicKeyFromPem(it.readText()) }
    }.getOrNull()

    private fun show(s: TapUiState) = runOnUiThread { state.value = s }
}
