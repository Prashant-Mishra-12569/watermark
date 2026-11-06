package com.watermark.tap.ui.screens

import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.components.Glyph
import com.watermark.tap.ui.components.GlyphIcon
import com.watermark.tap.ui.components.ProgressRing

/** Fetching the signed request behind a short QR link. Nothing is read from the card here. */
@Composable
fun LoadingSessionScreen(modifier: Modifier = Modifier) {
    ScreenBody(modifier, centered = true, spacing = 20) {
        ProgressRing(null, size = 120.dp, stroke = 5.dp) {
            GlyphIcon(Glyph.Phone, Modifier.size(40.dp), strokeWidth = 2.dp)
        }
        ScreenTitle("Opening your request", centered = true, style = MaterialTheme.typography.headlineMedium)
        ScreenText("One moment.", centered = true)
    }
}
