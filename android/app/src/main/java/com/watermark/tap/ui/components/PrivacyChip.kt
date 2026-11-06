package com.watermark.tap.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmShape

/** A short, honest privacy fact for the current step, e.g. "This check runs on your phone". */
@Composable
fun PrivacyChip(text: String, modifier: Modifier = Modifier, glyph: Glyph = Glyph.Lock) {
    Row(
        modifier = modifier
            .clip(WmShape.Chip)
            .background(WmColors.Surface)
            .border(1.dp, WmColors.Line, WmShape.Chip)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GlyphIcon(glyph, Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(text, style = MaterialTheme.typography.labelMedium, color = WmColors.Ink)
    }
}
