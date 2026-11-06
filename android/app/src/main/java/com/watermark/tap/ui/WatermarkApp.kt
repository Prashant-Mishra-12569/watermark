package com.watermark.tap.ui

// UI package: owned by Samanway. Renders TapUiState only; it never sees card data.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.watermark.tap.RefusalReason
import com.watermark.tap.TapUiState
import com.watermark.tap.ui.components.StepProgress
import com.watermark.tap.ui.components.StepStatus
import com.watermark.tap.ui.components.WmTopBar
import com.watermark.tap.ui.screens.CheckingLocallyScreen
import com.watermark.tap.ui.screens.ConsentScreen
import com.watermark.tap.ui.screens.ErrorScreen
import com.watermark.tap.ui.screens.IdleScreen
import com.watermark.tap.ui.screens.InvalidSessionScreen
import com.watermark.tap.ui.screens.LoadingSessionScreen
import com.watermark.tap.ui.screens.ProvedNotStampedScreen
import com.watermark.tap.ui.screens.ProvingScreen
import com.watermark.tap.ui.screens.ReadingScreen
import com.watermark.tap.ui.screens.RefusedScreen
import com.watermark.tap.ui.screens.SendingScreen
import com.watermark.tap.ui.screens.StampedScreen
import com.watermark.tap.ui.screens.VerifiedOnPhoneScreen
import com.watermark.tap.ui.screens.WaitingForCardScreen
import com.watermark.tap.ui.theme.WatermarkTheme
import com.watermark.tap.ui.theme.WmColors

@Composable
fun WatermarkApp(state: TapUiState) {
    WatermarkTheme {
        Column(
            Modifier
                .fillMaxSize()
                .background(WmColors.White)
                .safeDrawingPadding(),
        ) {
            WmTopBar(stepFor(state))
            val body = Modifier.fillMaxWidth().weight(1f)
            when (state) {
                TapUiState.Idle -> IdleScreen(body)
                TapUiState.LoadingSession -> LoadingSessionScreen(body)
                is TapUiState.InvalidSession -> InvalidSessionScreen(state.reason, body)
                is TapUiState.Consent -> ConsentScreen(state, body)
                TapUiState.WaitingForCard -> WaitingForCardScreen(body)
                TapUiState.Reading -> ReadingScreen(body)
                TapUiState.CheckingLocally -> CheckingLocallyScreen(body)
                TapUiState.VerifiedOnPhone -> VerifiedOnPhoneScreen(body)
                TapUiState.Sending -> SendingScreen(body)
                is TapUiState.Proving -> ProvingScreen(body)
                TapUiState.ProvedNotStamped -> ProvedNotStampedScreen(body)
                is TapUiState.Stamped -> StampedScreen(state, body)
                is TapUiState.Refused -> RefusedScreen(state.reason, body)
                is TapUiState.Error -> ErrorScreen(state.message, body)
            }
        }
    }
}

/** Maps each state to 1 Check · 2 Tap · 3 Prove · 4 Stamped. */
internal fun stepFor(state: TapUiState): StepProgress = when (state) {
    TapUiState.Idle -> StepProgress(0)
    TapUiState.LoadingSession, is TapUiState.Consent -> StepProgress(1)
    is TapUiState.InvalidSession -> StepProgress(1, StepStatus.Failed)
    TapUiState.WaitingForCard, TapUiState.Reading, TapUiState.CheckingLocally -> StepProgress(2)
    TapUiState.VerifiedOnPhone -> StepProgress(2, StepStatus.Done)
    TapUiState.Sending, is TapUiState.Proving -> StepProgress(3)
    TapUiState.ProvedNotStamped -> StepProgress(3, StepStatus.Done)
    is TapUiState.Stamped -> StepProgress(4, StepStatus.Done)
    is TapUiState.Refused -> StepProgress(refusalStep(state.reason), StepStatus.Failed)
    // An error can come from the relayer (step 1) or the prover (step 3); the state doesn't say which
    is TapUiState.Error -> StepProgress(0)
}

private fun refusalStep(reason: RefusalReason): Int = when (reason) {
    RefusalReason.SESSION_EXPIRED,
    RefusalReason.WRONG_SIGNER,
    RefusalReason.NFC_OFF,
    RefusalReason.NO_SESSION,
    RefusalReason.SESSION_USED,
    -> 1
    RefusalReason.NOT_IN_POLICY,
    RefusalReason.EXPIRES_TOO_SOON,
    RefusalReason.BAD_CARD,
    RefusalReason.NFC_LOST,
    -> 2
}
