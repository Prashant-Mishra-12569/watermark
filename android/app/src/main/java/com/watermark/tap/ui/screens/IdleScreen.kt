package com.watermark.tap.ui.screens

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.components.Glyph
import com.watermark.tap.ui.components.GlyphIcon
import com.watermark.tap.ui.components.PillButton
import com.watermark.tap.ui.components.PromiseRow
import com.watermark.tap.ui.components.Skyline
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmShape

private const val SITE = "https://usewatermark.xyz/pass"

/** Opened from the launcher, with no QR yet: what this is, the three steps, and where to start. */
@Composable
fun IdleScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    ScreenBody(
        modifier,
        spacing = 20,
        bottom = {
            Column {
                Column(Modifier.padding(horizontal = 24.dp)) {
                    PillButton(
                        text = "Start on usewatermark.xyz",
                        onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(SITE))) } },
                    )
                    Text(
                        "Open it on a laptop, then scan the QR with this phone's camera.",
                        Modifier.fillMaxWidth().padding(top = 10.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = WmColors.Muted,
                        textAlign = TextAlign.Center,
                    )
                }
                Skyline(Modifier.padding(top = 12.dp))
            }
        },
    ) {
        Spacer(Modifier.height(8.dp))
        ScreenTitle("Tap your card.\nKeep it private.", accent = "Keep", style = MaterialTheme.typography.displaySmall)
        ScreenText("Prove your wallet is backed by a real bank card. Free, and about 10 seconds.")

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StepTile(1, Glyph.Phone, "Scan the QR", Modifier.weight(1f))
            StepTile(2, Glyph.Card, "Tap your card", Modifier.weight(1f))
            StepTile(3, Glyph.Check, "Get stamped", Modifier.weight(1f))
        }

        PromiseRow(listOf("₹0", "No PIN", "Nothing stored", "Card number never on-chain"), Modifier.fillMaxWidth())
    }
}

@Composable
private fun StepTile(n: Int, glyph: Glyph, label: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .background(WmColors.Surface, WmShape.Card)
            .padding(horizontal = 12.dp, vertical = 16.dp)
            .semantics(mergeDescendants = true) { contentDescription = "Step $n: $label" },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(36.dp).background(WmColors.White, CircleShape), contentAlignment = Alignment.Center) {
            GlyphIcon(glyph, Modifier.size(18.dp), strokeWidth = 1.8.dp)
        }
        Text("$n", style = MaterialTheme.typography.labelMedium, color = WmColors.Saffron)
        Text(label, style = MaterialTheme.typography.titleSmall, color = WmColors.Ink)
    }
}
