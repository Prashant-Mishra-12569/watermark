package com.watermark.tap.ui.screens

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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watermark.tap.TapUiState
import com.watermark.tap.ui.components.Caption
import com.watermark.tap.ui.components.DetailRow
import com.watermark.tap.ui.components.Glyph
import com.watermark.tap.ui.components.GlyphIcon
import com.watermark.tap.ui.components.PrivacyChip
import com.watermark.tap.ui.components.WmCard
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmMono
import java.text.DateFormat
import java.util.Date

/**
 * "Check this matches the website, then tap your card." There is no button: the phone is already listening, so
 * the next screen comes when the card touches the phone. The pinned hint at the bottom says so.
 */
@Composable
fun ConsentScreen(state: TapUiState.Consent, modifier: Modifier = Modifier) {
    val expires = remember(state.expiresAtEpochSec) {
        if (state.expiresAtEpochSec > 0) {
            DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(state.expiresAtEpochSec * 1000))
        } else {
            null
        }
    }
    ScreenBody(modifier, bottom = { TapHint() }) {
        ScreenTitle("Check the wallet")

        WmCard {
            Caption("Wallet ending")
            Text(
                state.walletLast4,
                modifier = Modifier.semantics { contentDescription = "Wallet ending ${state.walletLast4.toList().joinToString(" ")}" },
                style = MaterialTheme.typography.displaySmall,
                fontFamily = WmMono,
                letterSpacing = 4.sp,
                color = WmColors.Ink,
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Does this match your laptop screen?", style = MaterialTheme.typography.titleMedium, color = WmColors.Ink)
            Text(
                "If it does, hold your card to the back of the phone. If it doesn't, don't tap. Close this app.",
                style = MaterialTheme.typography.bodyMedium,
                color = WmColors.Muted,
            )
        }

        WmCard(outlined = true) {
            DetailRow("App", state.appName)
            DetailRow("Card filter", state.filterLabel)
            DetailRow("Chain", state.chainName)
            if (expires != null) DetailRow("QR valid until", expires)
        }

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Caption("What the stamp shows")
            Text(state.revealsText, style = MaterialTheme.typography.bodyMedium, color = WmColors.Ink)
        }

        WmCard {
            Text("What happens next", style = MaterialTheme.typography.titleMedium, color = WmColors.Ink)
            NextRow("Reads", "Your card's chip certificates (they include the card number) and a one-time signature.")
            NextRow("Sent", "Encrypted on this phone, only to our prover.")
            NextRow("Kept", "Nothing. Used once to make the proof, then wiped.")
            NextRow("On-chain", "A proof, a one-way card ID, your wallet and an expiry month. Never your card number.")
        }

        PrivacyChip("No money charged. No PIN.")
    }
}

@Composable
private fun NextRow(label: String, text: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Text(
            label,
            modifier = Modifier.width(80.dp),
            style = MaterialTheme.typography.titleSmall,
            color = WmColors.Ink,
        )
        Spacer(Modifier.width(8.dp))
        Text(text, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = WmColors.Ink)
    }
}

/** Pinned under the consent details: the phone is ready for the card. */
@Composable
private fun TapHint() {
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(WmColors.Line))
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(10.dp).background(WmColors.Saffron, CircleShape))
            Spacer(Modifier.width(12.dp))
            Text(
                "When it matches, hold your card flat on the back of the phone.",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium,
                color = WmColors.Ink,
            )
            Spacer(Modifier.width(12.dp))
            GlyphIcon(Glyph.Card, Modifier.size(24.dp))
        }
    }
}
