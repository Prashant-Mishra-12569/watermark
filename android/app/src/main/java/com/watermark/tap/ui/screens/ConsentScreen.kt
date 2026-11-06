package com.watermark.tap.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watermark.tap.TapUiState
import com.watermark.tap.ui.components.CardTapIllustration
import com.watermark.tap.ui.components.Caption
import com.watermark.tap.ui.components.DetailRow
import com.watermark.tap.ui.components.Expandable
import com.watermark.tap.ui.components.PromiseRow
import com.watermark.tap.ui.components.rememberReduceMotion
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmMono
import java.text.DateFormat
import java.util.Date

/**
 * "Is this your wallet?" The one decision the user makes: the last four characters must match the laptop. There is
 * no button, because the phone is already listening: touching the card is the yes. The pinned bar says so.
 */
@Composable
fun ConsentScreen(state: TapUiState.Consent, modifier: Modifier = Modifier) {
    val expires = remember(state.expiresAtEpochSec) {
        if (state.expiresAtEpochSec > 0) DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(state.expiresAtEpochSec * 1000)) else null
    }
    ScreenBody(modifier, centered = true, spacing = 18, bottom = { ReadyBar() }) {
        Caption("Stamp request from ${state.appName}")
        ScreenTitle("Is this your wallet?", accent = "your", centered = true, style = MaterialTheme.typography.headlineLarge)
        WalletEnding(state.walletLast4)
        ScreenText("It should match your laptop screen. If it doesn't, don't tap.", centered = true)

        CardTapIllustration(Modifier.padding(vertical = 4.dp), width = 210.dp, ripples = true)

        PromiseRow(listOf("₹0", "No PIN", "Card number never on-chain"), Modifier.fillMaxWidth())

        Expandable("Details") {
            DetailRow("App", state.appName)
            DetailRow("Cards", state.filterLabel)
            DetailRow("Network", state.chainName)
            if (expires != null) DetailRow("QR works until", expires)
            Text(state.revealsText, style = MaterialTheme.typography.bodySmall, color = WmColors.Muted)
        }
    }
}

/** "0x ·· 1 A 2 B": the four characters to compare, big, in mono tiles. */
@Composable
private fun WalletEnding(last4: String) {
    Row(
        Modifier.clearAndSetSemantics { contentDescription = "Wallet ending ${last4.toList().joinToString(" ")}" },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("0x··", fontFamily = WmMono, fontSize = 22.sp, color = WmColors.Faint)
        Spacer(Modifier.width(2.dp))
        last4.forEach { ch ->
            Box(
                Modifier.size(width = 50.dp, height = 62.dp).background(WmColors.Surface, RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(ch.uppercase(), fontFamily = WmMono, fontSize = 30.sp, color = WmColors.Ink)
            }
        }
    }
}

/** Pinned at the bottom: a breathing saffron dot and the instruction. The tap itself starts the next step. */
@Composable
private fun ReadyBar() {
    val still = rememberReduceMotion()
    val breathe by rememberInfiniteTransition(label = "ready").animateFloat(
        initialValue = 0.75f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "dot",
    )
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(WmColors.Line))
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 18.dp)
                .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(22.dp).scale(if (still) 1f else breathe).alpha(0.25f).background(WmColors.Saffron, CircleShape))
                Box(Modifier.size(10.dp).background(WmColors.Saffron, CircleShape))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Ready", style = MaterialTheme.typography.titleSmall, color = WmColors.Ink)
                Text(
                    "Hold your card flat on the back of your phone.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = WmColors.Muted,
                    textAlign = TextAlign.Start,
                )
            }
        }
    }
}
