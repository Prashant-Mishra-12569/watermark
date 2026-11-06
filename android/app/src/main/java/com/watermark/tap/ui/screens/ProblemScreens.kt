package com.watermark.tap.ui.screens

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.watermark.tap.RefusalReason
import com.watermark.tap.ui.components.Expandable
import com.watermark.tap.ui.components.Glyph
import com.watermark.tap.ui.components.GlyphIcon
import com.watermark.tap.ui.components.PillButton
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmShape

private const val SITE = "https://usewatermark.xyz/pass"

/** What the user can do next, besides closing the app. */
private enum class NextAction { TapAgain, OpenNfcSettings, OpenSite, Close }

private data class Problem(val title: String, val text: String, val next: NextAction, val calm: Boolean = false)

private fun problemFor(reason: RefusalReason): Problem = when (reason) {
    RefusalReason.NOT_IN_POLICY -> Problem(
        "This card can't be used here",
        "Use a RuPay debit card from an Indian bank. Prepaid, gift and metro cards don't work.",
        NextAction.TapAgain,
    )
    RefusalReason.EXPIRES_TOO_SOON -> Problem(
        "This card expires too soon",
        "Use a card that's valid for at least three more months.",
        NextAction.TapAgain,
    )
    RefusalReason.BAD_CARD -> Problem(
        "We couldn't verify this card",
        "Hold it flat and still, then tap again. If it keeps failing, try another bank card.",
        NextAction.TapAgain,
    )
    RefusalReason.NFC_LOST -> Problem(
        "The card moved away",
        "Hold it flat on the back of the phone for about two seconds.",
        NextAction.TapAgain,
        calm = true,
    )
    RefusalReason.SESSION_EXPIRED -> Problem(
        "This QR has expired",
        "Each QR lasts 10 minutes. Refresh the page on your laptop and scan the new one.",
        NextAction.Close,
        calm = true,
    )
    RefusalReason.SESSION_USED -> Problem(
        "This QR was already used",
        "Each QR works once. Refresh the page on your laptop and scan the new one.",
        NextAction.Close,
        calm = true,
    )
    RefusalReason.WRONG_SIGNER -> Problem(
        "This QR isn't from Watermark",
        "Nothing was read from your card. Only scan the QR on usewatermark.xyz.",
        NextAction.Close,
    )
    RefusalReason.NFC_OFF -> Problem(
        "Turn on NFC",
        "Watermark reads your card over NFC. Turn it on, then scan the QR again.",
        NextAction.OpenNfcSettings,
        calm = true,
    )
    RefusalReason.NO_SESSION -> Problem(
        "Scan the QR first",
        "Open usewatermark.xyz on your laptop and scan its QR with this phone's camera. No card was read.",
        NextAction.OpenSite,
        calm = true,
    )
    RefusalReason.CARD_ALREADY_LINKED -> Problem(
        "This card is already linked",
        "One card can stamp one wallet per app, and this card already stamped another wallet. Use that wallet instead.",
        NextAction.Close,
    )
}

@Composable
fun RefusedScreen(reason: RefusalReason, modifier: Modifier = Modifier) {
    val p = problemFor(reason)
    ProblemScreen(p.title, p.text, p.next, p.calm, modifier)
}

/** Something outside the card stopped us: the prover or relayer can't be reached, or took too long. */
@Composable
fun ErrorScreen(message: String, modifier: Modifier = Modifier) {
    ProblemScreen("We couldn't finish", message, NextAction.Close, calm = false, modifier = modifier)
}

/** The link or session couldn't be used. No card was read. */
@Composable
fun InvalidSessionScreen(reason: String, modifier: Modifier = Modifier) {
    ProblemScreen(
        "This QR can't be used",
        "Refresh the page on your laptop and scan the new QR. Nothing was read from your card.",
        NextAction.Close,
        calm = true,
        modifier = modifier,
        details = reason,
    )
}

@Composable
private fun ProblemScreen(
    title: String,
    text: String,
    next: NextAction,
    calm: Boolean,
    modifier: Modifier = Modifier,
    details: String? = null,
) {
    val context = LocalContext.current
    val close = { (context as? Activity)?.finish(); Unit }
    ScreenBody(
        modifier,
        centered = true,
        bottom = {
            Column {
                if (next == NextAction.TapAgain) TryAgainHint()
                BottomActions {
                    when (next) {
                        NextAction.OpenNfcSettings -> PillButton(
                            "Open NFC settings",
                            onClick = { runCatching { context.startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) } },
                        )
                        NextAction.OpenSite -> PillButton(
                            "Open usewatermark.xyz",
                            onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(SITE))) } },
                        )
                        else -> {}
                    }
                    PillButton("Close", onClick = close, secondary = next != NextAction.Close)
                }
            }
        },
    ) {
        Box(
            Modifier.size(84.dp).background(if (calm) WmColors.Surface else WmColors.ErrorSoft, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            GlyphIcon(
                if (next == NextAction.OpenNfcSettings || next == NextAction.OpenSite) Glyph.Phone else Glyph.Alert,
                Modifier.size(40.dp),
                color = if (calm) WmColors.Ink else WmColors.Error,
                strokeWidth = 2.4.dp,
            )
        }
        ScreenTitle(title, centered = true, style = MaterialTheme.typography.headlineMedium)
        ScreenText(text, centered = true)
        Text(
            "No money was charged.",
            Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodySmall,
            color = WmColors.Muted,
            textAlign = TextAlign.Center,
        )
        if (details != null) {
            Expandable("Details") { Text(details, style = MaterialTheme.typography.bodySmall, color = WmColors.Muted) }
        }
    }
}

/** The reader is still on after a card problem, so another tap just works. */
@Composable
private fun TryAgainHint() {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 4.dp)
            .background(WmColors.SaffronSoft, WmShape.Card)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp).background(WmColors.Saffron, CircleShape))
        Spacer(Modifier.width(12.dp))
        Text(
            "Ready when you are: tap the card again.",
            style = MaterialTheme.typography.bodyMedium,
            color = WmColors.Ink,
        )
    }
}
