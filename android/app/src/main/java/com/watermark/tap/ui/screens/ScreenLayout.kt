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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.accented

/**
 * The body under the top bar: scrolls when it doesn't fit, and is vertically centred when [centered] and it does.
 * [bottom] stays pinned under the scrolling part (the skyline, the "ready to tap" bar, a button).
 */
@Composable
internal fun ScreenBody(
    modifier: Modifier = Modifier,
    centered: Boolean = false,
    spacing: Int = 16,
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
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                verticalArrangement = if (centered) {
                    Arrangement.spacedBy(spacing.dp, Alignment.CenterVertically)
                } else {
                    Arrangement.spacedBy(spacing.dp)
                },
                horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
                content = content,
            )
        }
        if (bottom != null) bottom()
    }
}

/** The big screen title. [accent] is set in the serif italic, like the website. Marked as a heading for TalkBack. */
@Composable
internal fun ScreenTitle(
    text: String,
    modifier: Modifier = Modifier,
    accent: String? = null,
    centered: Boolean = false,
    style: TextStyle = MaterialTheme.typography.headlineLarge,
) {
    Text(
        accented(text, accent),
        modifier = modifier.fillMaxWidth().semantics { heading() },
        style = style,
        color = WmColors.Ink,
        textAlign = if (centered) TextAlign.Center else TextAlign.Start,
    )
}

/** One plain sentence under the title. */
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

/** Pinned bottom area for one or two buttons, above the navigation bar. */
@Composable
internal fun BottomActions(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}
