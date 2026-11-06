package com.watermark.tap.ui.screens

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.watermark.tap.TapUiState
import com.watermark.tap.ui.components.Caption
import com.watermark.tap.ui.components.PillButton
import com.watermark.tap.ui.components.PostageStamp
import com.watermark.tap.ui.components.Skyline
import com.watermark.tap.ui.components.StatusKind
import com.watermark.tap.ui.components.StatusMark
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmMono
import com.watermark.tap.ui.theme.WmShape

/** "0x1234abcd…" → "0x1234…abcd", so the hash fits on one line. */
internal fun shortHash(hash: String): String =
    if (hash.length > 14) "${hash.take(6)}…${hash.takeLast(4)}" else hash

/** The moment it worked: the stamp lands, the phone gives one confirm buzz, and the user goes back to the laptop. */
@Composable
fun StampedScreen(state: TapUiState.Stamped, modifier: Modifier = Modifier, onLanded: () -> Unit = {}) {
    val context = LocalContext.current
    // Small phones get a smaller stamp, so the buttons stay in view without scrolling
    val stampWidth = if (LocalConfiguration.current.screenHeightDp < 720) 132.dp else 172.dp
    ScreenBody(
        modifier,
        centered = true,
        spacing = 14,
        bottom = {
            Column {
                BottomActions {
                    PillButton("Done", onClick = { (context as? Activity)?.finish() })
                    PillButton(
                        "View on explorer",
                        secondary = true,
                        onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(state.explorerUrl))) } },
                    )
                }
                Skyline()
            }
        },
    ) {
        PostageStamp(width = stampWidth, onLanded = onLanded)
        ScreenTitle("You're stamped.", accent = "stamped", centered = true, style = MaterialTheme.typography.displaySmall)
        ScreenText("Your wallet is verified. Head back to your laptop to continue.", centered = true)
        Row(
            Modifier
                .background(WmColors.Surface, WmShape.Pill)
                .padding(horizontal = 14.dp, vertical = 8.dp)
                .semantics(mergeDescendants = true) { contentDescription = "Transaction ${shortHash(state.txHash)}" },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Caption("Transaction")
            Spacer(Modifier.width(8.dp))
            Text(shortHash(state.txHash), style = MaterialTheme.typography.labelMedium, fontFamily = WmMono, color = WmColors.Ink)
        }
    }
}

/**
 * The proof was made and verified, but no relayer put it on-chain (a dev setup). A final state, so it doesn't claim
 * stamping is under way.
 */
@Composable
fun ProvedNotStampedScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    ScreenBody(
        modifier,
        centered = true,
        bottom = { BottomActions { PillButton("Close", onClick = { (context as? Activity)?.finish() }) } },
    ) {
        StatusMark(StatusKind.Ok)
        ScreenTitle("Your card is genuine", centered = true, style = MaterialTheme.typography.headlineMedium)
        ScreenText(
            "The private proof checked out, but your wallet isn't stamped yet: nothing is connected to put it on-chain. " +
                "Refresh the QR on your laptop and try again.",
            centered = true,
        )
    }
}
