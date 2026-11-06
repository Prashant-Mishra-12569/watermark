package com.watermark.tap.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
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
    val styled = if (outlined) base.background(WmColors.White).border(1.dp, WmColors.Line, WmShape.Card) else base.background(WmColors.Surface)
    Column(styled.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
}

/** A small grey caption above a value. */
@Composable
fun Caption(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier = modifier, style = MaterialTheme.typography.labelMedium, color = WmColors.Muted)
}

/** One label and value line. */
@Composable
fun DetailRow(label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Text(label, Modifier.width(104.dp), style = MaterialTheme.typography.bodyMedium, color = WmColors.Muted)
        Spacer(Modifier.width(8.dp))
        Text(value, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = WmColors.Ink)
    }
}

/**
 * A "Details" row that opens in place. Used for what most people don't need to read, but anyone can: the app, the
 * card list, the network, the raw error.
 */
@Composable
fun Expandable(title: String, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    Column(modifier.fillMaxWidth().clip(WmShape.Card).border(1.dp, WmColors.Line, WmShape.Card)) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .clickable(role = Role.Button) { open = !open }
                .semantics { stateDescription = if (open) "Open" else "Closed" }
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, color = WmColors.Ink)
            GlyphIcon(Glyph.Chevron, Modifier.size(16.dp).rotate(if (open) 180f else 0f), color = WmColors.Muted, strokeWidth = 1.8.dp)
        }
        AnimatedVisibility(open, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
            Column(
                Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                content = content,
            )
        }
    }
}

/** A few tiny promises as pills, e.g. "₹0" · "No PIN" · "Card number never on-chain". Wraps on small phones. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PromiseRow(items: List<String>, modifier: Modifier = Modifier) {
    FlowRow(
        modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items.forEach { item ->
            Text(
                item,
                Modifier.clip(WmShape.Pill).background(WmColors.Surface).padding(horizontal = 10.dp, vertical = 6.dp),
                style = MaterialTheme.typography.labelMedium,
                color = WmColors.Ink,
            )
        }
    }
}
