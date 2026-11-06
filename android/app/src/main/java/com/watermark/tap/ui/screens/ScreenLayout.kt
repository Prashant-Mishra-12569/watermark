package com.watermark.tap.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.theme.WmColors

/**
 * The body under the top bar: scrolls when it doesn't fit, and is vertically centred when [centered] and it does.
 * [bottom] stays pinned under the scrolling part (the skyline, or the "tap your card" hint).
 */
@Composable
internal fun ScreenBody(
    modifier: Modifier = Modifier,
    centered: Boolean = false,
    bottom: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxSize()) {
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            val minHeight = if (constraints.hasBoundedHeight) maxHeight else 0.dp
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .heightIn(min = minHeight)
                    .padding(horizontal = 24.dp, vertical = 20.dp),
                verticalArrangement = if (centered) {
                    Arrangement.spacedBy(16.dp, Alignment.CenterVertically)
                } else {
                    Arrangement.spacedBy(16.dp)
                },
                horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
                content = content,
            )
        }
        if (bottom != null) bottom()
    }
}

/** The big screen title. Marked as a heading for TalkBack. */
@Composable
internal fun ScreenTitle(text: String, modifier: Modifier = Modifier, centered: Boolean = false) {
    Text(
        text,
        modifier = modifier.fillMaxWidth().semantics { heading() },
        style = MaterialTheme.typography.headlineMedium,
        color = WmColors.Ink,
        textAlign = if (centered) TextAlign.Center else TextAlign.Start,
    )
}

/** One or two plain sentences under the title. */
@Composable
internal fun ScreenText(text: String, modifier: Modifier = Modifier, centered: Boolean = false) {
    Text(
        text,
        modifier = modifier.fillMaxWidth(),
        style = MaterialTheme.typography.bodyLarge,
        color = WmColors.Muted,
        textAlign = if (centered) TextAlign.Center else TextAlign.Start,
    )
}

/**
 * The shared shape of a step screen: a visual, a title, a sentence, a privacy chip, then the "What this step uses"
 * line at the end.
 */
@Composable
internal fun StepScreen(
    title: String,
    text: String?,
    visual: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    chip: (@Composable () -> Unit)? = null,
    uses: (@Composable () -> Unit)? = null,
    extra: (@Composable ColumnScope.() -> Unit)? = null,
) {
    ScreenBody(modifier, centered = true) {
        visual()
        ScreenTitle(title, Modifier.padding(top = 8.dp), centered = true)
        if (text != null) ScreenText(text, centered = true)
        if (chip != null) chip()
        if (extra != null) extra()
        if (uses != null) uses()
    }
}
