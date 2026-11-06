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

@Composable
fun SendingScreen(modifier: Modifier = Modifier) {
    StepScreen(
        title = "Sending an encrypted request",
        text = "The card data was locked on this phone before it left.",
        modifier = modifier,
        visual = { GlyphBadge(Glyph.Lock) },
        chip = { PrivacyChip("Encrypted on this phone. Only our prover can open it.") },
        extra = { QuietProgress(label = "Sending") },
        uses = { UsesNote("One encrypted package with the card data, plus this session: your wallet and the app.") },
    )
}

@Composable
fun ProvingScreen(modifier: Modifier = Modifier) {
    StepScreen(
        title = "Making your private proof",
        text = "This takes about 10 seconds.",
        modifier = modifier,
        visual = { GlyphBadge(Glyph.Lock) },
        chip = { PrivacyChip("Your card data is used once, then wiped.") },
        extra = { QuietProgress(label = "Making your proof") },
        uses = {
            UsesNote(
                "Our prover opens the package, makes a zero-knowledge proof, then wipes the card data. " +
                    "The proof doesn't contain your card number.",
            )
        },
    )
}

/**
 * The proof was made and verified, but no relayer put it on-chain (a dev setup). This is a final state, so the
 * screen doesn't claim stamping is under way.
 */
@Composable
fun ProvedNotStampedScreen(modifier: Modifier = Modifier) {
    StepScreen(
        title = "Proof verified",
        text = "Your card is genuine. Your wallet isn't stamped yet: no relayer is connected to put the proof on-chain.",
        modifier = modifier,
        visual = { StatusMark(StatusKind.Ok) },
        chip = { PrivacyChip("Your card data was used once, then wiped.") },
        extra = {
            WmCard(outlined = true) {
                Caption("What to do")
                Text(
                    "Go back to your laptop. If no stamp shows up, refresh the QR and try again.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = WmColors.Ink,
                )
            }
        },
    )
}
