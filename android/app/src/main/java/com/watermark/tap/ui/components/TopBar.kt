package com.watermark.tap.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.watermark.tap.R
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmShape

/**
 * The one bar on every screen: the One tap mark and "Watermark" on the left, and a quiet "Private" pill on the right
 * that opens the sheet explaining exactly what the app reads, sends and keeps.
 */
@Composable
fun WmTopBar(onPrivacy: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().padding(start = 20.dp, end = 16.dp, top = 10.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(painterResource(R.drawable.wm_logo), contentDescription = null, modifier = Modifier.size(30.dp))
        Spacer(Modifier.width(8.dp))
        Text("Watermark", style = MaterialTheme.typography.titleMedium, color = WmColors.Ink)
        Spacer(Modifier.weight(1f))
        Row(
            Modifier
                .heightIn(min = 44.dp)
                .clip(WmShape.Pill)
                .border(1.dp, WmColors.Line, WmShape.Pill)
                .background(WmColors.White)
                .clickable(role = Role.Button, onClick = onPrivacy)
                .semantics { contentDescription = "How your card stays private" }
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GlyphIcon(Glyph.Lock, Modifier.size(16.dp), strokeWidth = 1.6.dp)
            Spacer(Modifier.width(6.dp))
            Text("Private", style = MaterialTheme.typography.labelMedium, color = WmColors.Ink)
        }
    }
}
