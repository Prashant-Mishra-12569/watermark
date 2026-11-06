package com.watermark.tap.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.watermark.tap.R
import com.watermark.tap.ui.components.Caption
import com.watermark.tap.ui.components.CheckLine
import com.watermark.tap.ui.components.Skyline
import com.watermark.tap.ui.components.UsesNote
import com.watermark.tap.ui.components.WmCard
import com.watermark.tap.ui.theme.WmColors

/** Opened without a link: a calm welcome that says where to start. */
@Composable
fun IdleScreen(modifier: Modifier = Modifier) {
    ScreenBody(modifier, bottom = { Skyline(Modifier.padding(top = 8.dp)) }) {
        Image(
            painter = painterResource(R.drawable.wm_logo),
            contentDescription = null,
            modifier = Modifier.size(76.dp),
        )
        Text(
            "Prove your card is real. Keep it private.",
            modifier = Modifier.semantics { heading() },
            style = MaterialTheme.typography.headlineLarge,
            color = WmColors.Ink,
        )
        Text(
            "Open usewatermark.xyz on your laptop and scan the QR with this phone's camera.",
            style = MaterialTheme.typography.bodyLarge,
            color = WmColors.Muted,
        )

        Column(Modifier.padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            NumberedStep(1, "Scan the QR on usewatermark.xyz")
            NumberedStep(2, "Hold your card to the phone")
            NumberedStep(3, "Your wallet gets stamped")
        }

        WmCard {
            Text("Our promise", style = MaterialTheme.typography.titleMedium, color = WmColors.Ink)
            CheckLine("No money charged")
            CheckLine("No PIN")
            CheckLine("Nothing stored")
            CheckLine("Nothing about your card on-chain")
            Caption(
                "To check your card, the app reads its chip certificates (they include the card number) and a " +
                    "one-time signature. They're encrypted on this phone so only our prover can open them, used " +
                    "once to make a private proof, then wiped.",
            )
        }

        UsesNote("Nothing yet. The app reads no card until you scan a QR.")
    }
}

@Composable
private fun NumberedStep(n: Int, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(28.dp).clip(CircleShape).background(WmColors.Surface),
            contentAlignment = Alignment.Center,
        ) {
            Text("$n", style = MaterialTheme.typography.labelMedium, color = WmColors.Ink)
        }
        Spacer(Modifier.width(12.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge, color = WmColors.Ink)
    }
}
