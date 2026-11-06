package com.watermark.tap.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.watermark.tap.ui.components.Caption
import com.watermark.tap.ui.components.Glyph
import com.watermark.tap.ui.components.GlyphBadge
import com.watermark.tap.ui.components.PrivacyChip
import com.watermark.tap.ui.components.QuietProgress
import com.watermark.tap.ui.components.StatusKind
import com.watermark.tap.ui.components.StatusMark
import com.watermark.tap.ui.components.UsesNote
import com.watermark.tap.ui.components.WmCard
import com.watermark.tap.ui.theme.WmColors

/** Fetching the signed session behind a short QR link. */
@Composable
fun LoadingSessionScreen(modifier: Modifier = Modifier) {
    StepScreen(
        title = "Opening your session…",
        text = "Getting the signed request from Watermark.",
        modifier = modifier,
        visual = { GlyphBadge(Glyph.Phone) },
        extra = { QuietProgress(label = "Opening your session") },
        uses = { UsesNote("The session code in your QR. Nothing from your card.") },
    )
}

/** The link or session couldn't be used. No card was read. */
@Composable
fun InvalidSessionScreen(reason: String, modifier: Modifier = Modifier) {
    StepScreen(
        title = "This QR can't be used",
        text = "Refresh the page on your laptop and scan the new QR.",
        modifier = modifier,
        visual = { StatusMark(StatusKind.Problem) },
        chip = { PrivacyChip("Nothing was read from your card.") },
        extra = {
            WmCard(outlined = true) {
                Caption("What went wrong")
                Text(reason, style = MaterialTheme.typography.bodyMedium, color = WmColors.Ink)
            }
        },
    )
}
