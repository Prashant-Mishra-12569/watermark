package com.watermark.tap.ui

// UI package. Renders TapUiState only; it never sees card data.

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.watermark.tap.TapUiState
import com.watermark.tap.ui.components.PrivacySheet
import com.watermark.tap.ui.components.WmTopBar
import com.watermark.tap.ui.components.rememberHaptics
import com.watermark.tap.ui.components.rememberReduceMotion
import com.watermark.tap.ui.screens.ConsentScreen
import com.watermark.tap.ui.screens.ErrorScreen
import com.watermark.tap.ui.screens.IdleScreen
import com.watermark.tap.ui.screens.InvalidSessionScreen
import com.watermark.tap.ui.screens.JourneyScreen
import com.watermark.tap.ui.screens.LoadingSessionScreen
import com.watermark.tap.ui.screens.ProvedNotStampedScreen
import com.watermark.tap.ui.screens.RefusedScreen
import com.watermark.tap.ui.screens.StampedScreen
import com.watermark.tap.ui.screens.isJourney
import com.watermark.tap.ui.theme.WatermarkTheme
import com.watermark.tap.ui.theme.WmColors

/**
 * The whole app: one bar, then one screen at a time. Reading, checking, sending and proving share one screen, so the
 * ring and checklist move on in place instead of the page jumping.
 */
@Composable
fun WatermarkApp(state: TapUiState) {
    WatermarkTheme {
        var privacyOpen by rememberSaveable { mutableStateOf(false) }
        val haptics = rememberHaptics()
        val still = rememberReduceMotion()

        // One small buzz when the card is felt, one "no" buzz when something stops. The stamp buzzes as it lands.
        LaunchedEffect(state::class) {
            when (state) {
                TapUiState.Reading -> haptics.tick()
                is TapUiState.Refused, is TapUiState.Error, is TapUiState.InvalidSession -> haptics.reject()
                else -> {}
            }
        }

        Column(
            Modifier
                .fillMaxSize()
                .background(WmColors.White)
                .safeDrawingPadding(),
        ) {
            WmTopBar(onPrivacy = { privacyOpen = true })
            AnimatedContent(
                targetState = state,
                contentKey = { screenKey(it) },
                transitionSpec = {
                    if (still) {
                        fadeIn(tween(0)) togetherWith fadeOut(tween(0))
                    } else {
                        (fadeIn(tween(260, delayMillis = 60)) + slideInVertically(tween(320)) { it / 14 }) togetherWith
                            fadeOut(tween(140))
                    }
                },
                modifier = Modifier.fillMaxWidth().weight(1f),
                label = "screen",
            ) { s ->
                val body = Modifier.fillMaxSize()
                when (s) {
                    TapUiState.Idle -> IdleScreen(body)
                    TapUiState.LoadingSession -> LoadingSessionScreen(body)
                    is TapUiState.InvalidSession -> InvalidSessionScreen(s.reason, body)
                    is TapUiState.Consent -> ConsentScreen(s, body)
                    TapUiState.WaitingForCard, TapUiState.Reading, TapUiState.CheckingLocally,
                    TapUiState.VerifiedOnPhone, TapUiState.Sending, is TapUiState.Proving,
                    -> JourneyScreen(s, body)
                    TapUiState.ProvedNotStamped -> ProvedNotStampedScreen(body)
                    is TapUiState.Stamped -> StampedScreen(s, body, onLanded = { haptics.success() })
                    is TapUiState.Refused -> RefusedScreen(s.reason, body)
                    is TapUiState.Error -> ErrorScreen(s.message, body)
                }
            }
        }

        if (privacyOpen) PrivacySheet(onDismiss = { privacyOpen = false })
    }
}

/** States that share a screen share a key, so moving between them doesn't replay the page transition. */
internal fun screenKey(state: TapUiState): Any = when {
    isJourney(state) -> "journey"
    state is TapUiState.Consent -> "consent"
    state is TapUiState.Refused -> "refused:${state.reason}"
    else -> state::class
}
