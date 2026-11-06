package com.watermark.tap.ui.components

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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.accented

private const val PRIVACY_NOTES = "https://github.com/Prashant-Mishra-12569/watermark/blob/main/docs/PRIVACY.md"

/**
 * Everything the app reads, sends and keeps, in four lines. It lives behind the "Private" pill so the main screens
 * stay calm, but it is one tap away on every screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrivacySheet(onDismiss: () -> Unit) {
    val context = LocalContext.current
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = WmColors.White,
        contentColor = WmColors.Ink,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .navigationBarsPadding()
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            Text(
                accented("How your card stays private", "private"),
                Modifier.semantics { heading() },
                style = MaterialTheme.typography.headlineSmall,
            )
            SheetRow(Glyph.Card, "Reads", "Your card chip's certificates (they include the card number) and a one-time signature. No PIN. No payment.")
            SheetRow(Glyph.Lock, "Encrypts", "Locked on this phone before it leaves. Only our prover can open it.")
            SheetRow(Glyph.Spark, "Uses once", "The prover makes a zero-knowledge proof, then wipes the card data. Nothing is stored.")
            SheetRow(Glyph.Shield, "On-chain", "Only the proof, a one-way card ID, your wallet and an expiry month. Never your card number.")
            Text(
                "A stamp means one thing: this wallet is linked to a real bank card that passed the app's rules. It says " +
                    "nothing about who you are.",
                Modifier.fillMaxWidth().background(WmColors.Surface, MaterialTheme.shapes.large).padding(16.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = WmColors.Ink,
            )
            PillButton(
                text = "Read the full privacy notes",
                secondary = true,
                onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_NOTES))) } },
            )
        }
    }
}

@Composable
private fun SheetRow(glyph: Glyph, title: String, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.size(40.dp).background(WmColors.SaffronSoft, CircleShape), contentAlignment = Alignment.Center) {
            GlyphIcon(glyph, Modifier.size(20.dp), strokeWidth = 1.8.dp)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = WmColors.Ink)
            Spacer(Modifier.height(2.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium, color = WmColors.Muted)
        }
    }
}
