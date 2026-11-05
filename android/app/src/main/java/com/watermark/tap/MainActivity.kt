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
import com.watermark.tap.emv.CaKeys
import com.watermark.tap.emv.EmvException
import com.watermark.tap.emv.EmvReader
import com.watermark.tap.emv.OdaException
import com.watermark.tap.emv.OdaVerifier
import com.watermark.tap.emv.TlvException
import com.watermark.tap.session.Challenge
import com.watermark.tap.session.SUPPORTED_CHAINS
import com.watermark.tap.session.SessionVerifier
import com.watermark.tap.session.VerifyLink
import com.watermark.tap.session.VerifyLinkException
import com.watermark.tap.session.VerifyLinkParser
import com.watermark.tap.ui.WatermarkApp
import java.io.IOException

class MainActivity : ComponentActivity(), NfcAdapter.ReaderCallback {

    private val state = mutableStateOf<TapUiState>(TapUiState.Idle)
    private var nfc: NfcAdapter? = null

    /** The verified session the next tap belongs to. Null means taps are ignored. */
    @Volatile
    private var session: VerifyLink.Full? = null

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
                // TODO(F1): fetch the signed session from GET /session/:id, then continue as Full
                is VerifyLink.Short -> TapUiState.Error("Short links aren't supported yet")
            }
        } catch (e: VerifyLinkException) {
            TapUiState.InvalidSession(e.message ?: "invalid link")
        }
    }

    private fun consentFor(link: VerifyLink.Full): TapUiState {
        if (link.expiresAt <= System.currentTimeMillis() / 1000) return TapUiState.Refused(RefusalReason.SESSION_EXPIRED)
        check(link.chainId in SUPPORTED_CHAINS)
        // A QR we didn't sign (fake site, edited link) stops here, before any card is read.
        if (!SessionVerifier.isSignedBy(link, BuildConfig.SESSION_SIGNER_ADDRESS)) {
            return TapUiState.Refused(RefusalReason.WRONG_SIGNER)
        }
        val adapter = nfc
        if (adapter == null || !adapter.isEnabled) return TapUiState.Refused(RefusalReason.NFC_OFF)
        session = link
        // TODO(F8): fetch GET /policy/:appId for the real app name, filter label and what the stamp reveals.
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
                    } else {
                        // TODO(F8, F2): policy check, then encrypt `card` to the prover and POST /prove.
                        TapUiState.VerifiedOnPhone
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

    private fun show(s: TapUiState) = runOnUiThread { state.value = s }
}
