package com.watermark.tap.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.components.CardTapIllustration
import com.watermark.tap.ui.components.Glyph
import com.watermark.tap.ui.components.GlyphBadge
import com.watermark.tap.ui.components.PrivacyChip
import com.watermark.tap.ui.components.QuietProgress
import com.watermark.tap.ui.components.StatusKind
import com.watermark.tap.ui.components.StatusMark
import com.watermark.tap.ui.components.UsesNote

private const val CARD_READ =
    "Your card's chip certificates (they include the card number) and a signature over this session's challenge."

@Composable
fun WaitingForCardScreen(modifier: Modifier = Modifier) {
    StepScreen(
        title = "Hold your card flat on the back of the phone",
        text = "Keep it there for 2 seconds.",
        modifier = modifier,
        visual = { CardTapIllustration() },
        chip = { PrivacyChip("Reads chip certificates and a one-time signature. No PIN. No charge.") },
        uses = { UsesNote(CARD_READ) },
    )
}

@Composable
fun ReadingScreen(modifier: Modifier = Modifier) {
    StepScreen(
        title = "Reading the chip…",
        text = "Keep it still.",
        modifier = modifier,
        visual = { CardTapIllustration(width = 200.dp) },
        chip = { PrivacyChip("Nothing has left this phone yet.", glyph = Glyph.Phone) },
        extra = { QuietProgress(label = "Reading the chip") },
        uses = { UsesNote(CARD_READ) },
    )
}

@Composable
fun CheckingLocallyScreen(modifier: Modifier = Modifier) {
    StepScreen(
        title = "Checking the card on this phone",
        text = "Making sure its certificates are real and that it signed this session.",
        modifier = modifier,
        visual = { GlyphBadge(Glyph.Phone) },
        chip = { PrivacyChip("This check runs on your phone.", glyph = Glyph.Phone) },
        extra = { QuietProgress(label = "Checking the card") },
        uses = { UsesNote("The card's certificates and signature, and the card network's public key built into this app.") },
    )
}

@Composable
fun VerifiedOnPhoneScreen(modifier: Modifier = Modifier) {
    StepScreen(
        title = "Genuine card",
        text = "Checked on this phone with the card network's public key.",
        modifier = modifier,
        visual = { StatusMark(StatusKind.Ok) },
        chip = { PrivacyChip("Nothing has left this phone yet.", glyph = Glyph.Phone) },
        uses = { UsesNote("The card data is encrypted on this phone, then sent to our prover.", label = "What happens next") },
    )
}
