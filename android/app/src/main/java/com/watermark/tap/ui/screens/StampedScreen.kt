package com.watermark.tap.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.watermark.tap.TapUiState
import com.watermark.tap.ui.components.Caption
import com.watermark.tap.ui.components.PillButton
import com.watermark.tap.ui.components.PrivacyChip
import com.watermark.tap.ui.components.Skyline
import com.watermark.tap.ui.components.StampSeal
import com.watermark.tap.ui.components.WmCard
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmMono

/** "0x1234abcd…" → "0x1234…abcd", so the hash fits on one line. */
internal fun shortHash(hash: String): String =
    if (hash.length > 14) "${hash.take(6)}…${hash.takeLast(4)}" else hash

@Composable
fun StampedScreen(state: TapUiState.Stamped, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    ScreenBody(modifier, centered = true, bottom = { Skyline(Modifier.padding(top = 8.dp)) }) {
        StampSeal(Modifier.padding(vertical = 8.dp))
        ScreenTitle("Your wallet is stamped", centered = true)
        ScreenText("Go back to your laptop to continue.", centered = true)

        WmCard(outlined = true) {
            Caption("Transaction")
            Text(
                shortHash(state.txHash),
                modifier = Modifier.semantics { contentDescription = "Transaction ${shortHash(state.txHash)}" },
                style = MaterialTheme.typography.titleMedium,
                fontFamily = WmMono,
                color = WmColors.Ink,
            )
        }
        PillButton(
            text = "View on explorer",
            onClick = {
                // A plain link to the public explorer. If no browser is installed, nothing happens.
                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(state.explorerUrl))) }
            },
        )
        PrivacyChip("On-chain: a proof, a one-way card ID, your wallet and an expiry month. Never your card number.")
    }
}
