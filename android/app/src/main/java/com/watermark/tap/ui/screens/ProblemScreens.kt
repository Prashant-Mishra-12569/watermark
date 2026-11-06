package com.watermark.tap.ui.screens

import android.content.Intent
import android.provider.Settings
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.watermark.tap.RefusalReason
import com.watermark.tap.ui.components.Caption
import com.watermark.tap.ui.components.PillButton
import com.watermark.tap.ui.components.PrivacyChip
import com.watermark.tap.ui.components.StatusKind
import com.watermark.tap.ui.components.StatusMark
import com.watermark.tap.ui.components.WmCard
import com.watermark.tap.ui.theme.WmColors

/** A short title for each refusal. The full sentence is the reason's own message. */
internal fun refusalTitle(reason: RefusalReason): String = when (reason) {
    RefusalReason.NOT_IN_POLICY -> "This card isn't accepted here"
    RefusalReason.EXPIRES_TOO_SOON -> "This card expires too soon"
    RefusalReason.BAD_CARD -> "We couldn't verify this card"
    RefusalReason.SESSION_EXPIRED -> "This session has expired"
    RefusalReason.WRONG_SIGNER -> "This link isn't from Watermark"
    RefusalReason.NFC_LOST -> "The card moved away"
    RefusalReason.NFC_OFF -> "NFC is off"
    RefusalReason.NO_SESSION -> "Scan the QR first"
    RefusalReason.SESSION_USED -> "This QR was already used"
}

/**
 * What to do next. A refusal on the phone keeps the session, so another card can be tapped straight away; a refusal
 * from the prover ends it, hence "if it still doesn't work, scan a new QR".
 */
internal fun refusalNextStep(reason: RefusalReason): String = when (reason) {
    RefusalReason.NOT_IN_POLICY ->
        "Only RuPay debit cards from Indian banks work today, and this app may allow fewer banks. Try a different " +
            "card. If it still doesn't work, scan a new QR on your laptop."
    RefusalReason.EXPIRES_TOO_SOON ->
        "Use a card with a later expiry date. If it still doesn't work, scan a new QR on your laptop."
    RefusalReason.BAD_CARD ->
        "Try a different bank card, held flat and still. If it still doesn't work, scan a new QR on your laptop."
    RefusalReason.SESSION_EXPIRED -> "Refresh the page on your laptop and scan the new QR."
    RefusalReason.WRONG_SIGNER -> "Only scan the QR on usewatermark.xyz. Refresh that page and scan again."
    RefusalReason.NFC_LOST -> "Hold the card flat on the back of the phone and keep it still for 2 seconds."
    RefusalReason.NFC_OFF -> "Turn on NFC in your phone's settings, then scan the QR on your laptop again."
    RefusalReason.NO_SESSION ->
        "Open usewatermark.xyz on your laptop, scan the QR with this phone's camera, then tap your card."
    RefusalReason.SESSION_USED -> "Each QR works once. Refresh the page on your laptop and scan the new QR."
}

@Composable
fun RefusedScreen(reason: RefusalReason, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    StepScreen(
        title = refusalTitle(reason),
        text = reason.message,
        modifier = modifier,
        visual = { StatusMark(StatusKind.Problem) },
        chip = { PrivacyChip("No money was charged.") },
        extra = {
            WmCard(outlined = true) {
                Caption("What to do")
                Text(refusalNextStep(reason), style = MaterialTheme.typography.bodyMedium, color = WmColors.Ink)
            }
            if (reason == RefusalReason.NFC_OFF) {
                PillButton(
                    text = "Open NFC settings",
                    onClick = { runCatching { context.startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) } },
                )
            }
        },
    )
}

@Composable
fun ErrorScreen(message: String, modifier: Modifier = Modifier) {
    StepScreen(
        title = "Something went wrong",
        text = "Try again: refresh the QR on your laptop and scan it with this phone.",
        modifier = modifier,
        visual = { StatusMark(StatusKind.Problem) },
        chip = { PrivacyChip("No money was charged.") },
        extra = {
            WmCard(outlined = true) {
                Caption("Details")
                Text(message, style = MaterialTheme.typography.bodyMedium, color = WmColors.Ink)
            }
        },
    )
}
