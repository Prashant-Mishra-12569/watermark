package com.watermark.tap

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.mutableStateOf
import com.watermark.tap.session.SUPPORTED_CHAINS
import com.watermark.tap.session.VerifyLink
import com.watermark.tap.session.VerifyLinkException
import com.watermark.tap.session.VerifyLinkParser
import com.watermark.tap.ui.WatermarkApp

class MainActivity : ComponentActivity() {

    private val state = mutableStateOf<TapUiState>(TapUiState.Idle)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Card screens must not appear in screenshots or the recents list, except in the mirrored demo build.
        if (!BuildConfig.DEMO_MIRROR) {
            window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        }
        handle(intent)
        setContent { WatermarkApp(state.value) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        val data = intent?.data?.toString() ?: return
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
        // TODO(F1): recover the EIP-712 signer of the session and compare with BuildConfig.SESSION_SIGNER_ADDRESS.
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
}
