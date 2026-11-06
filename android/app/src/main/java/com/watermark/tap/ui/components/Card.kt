package com.watermark.tap.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
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

/** The rounded 24dp card. Filled grey by default, or white with a hairline when [outlined]. */
@Composable
fun WmCard(
    modifier: Modifier = Modifier,
    outlined: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val base = modifier.fillMaxWidth().clip(WmShape.Card)
    val styled = if (outlined) {
        base.background(WmColors.White).border(1.dp, WmColors.Line, WmShape.Card)
    } else {
        base.background(WmColors.Surface)
    }
    Column(
        modifier = styled.padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

/** A small grey caption above a value, e.g. "Card filter". */
@Composable
fun Caption(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier = modifier, style = MaterialTheme.typography.labelMedium, color = WmColors.Muted)
}

/** One label + value line inside a card. */
@Composable
fun DetailRow(label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Text(
            label,
            modifier = Modifier.width(104.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = WmColors.Muted,
        )
        Spacer(Modifier.width(8.dp))
        Text(value, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = WmColors.Ink)
    }
}

/** A check-marked line, for promises such as "No PIN". */
@Composable
fun CheckLine(text: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        GlyphIcon(Glyph.Check, Modifier.size(20.dp), color = WmColors.Ok, strokeWidth = 2.dp)
        Spacer(Modifier.width(10.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = WmColors.Ink)
    }
}

/**
 * The small "What this step uses" line every step screen ends with, so the user always knows what is read or sent.
 */
@Composable
fun UsesNote(text: String, modifier: Modifier = Modifier, label: String = "What this step uses") {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(WmShape.Card)
            .border(1.dp, WmColors.Line, WmShape.Card)
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Caption(label)
        Text(text, style = MaterialTheme.typography.bodyMedium, color = WmColors.Ink)
    }
}
