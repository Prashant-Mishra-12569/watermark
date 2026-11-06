package com.watermark.tap.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.watermark.tap.TapUiState
import com.watermark.tap.ui.components.Glyph
import com.watermark.tap.ui.components.GlyphIcon
import com.watermark.tap.ui.components.ProgressRing
import com.watermark.tap.ui.components.rememberReduceMotion
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmShape

/** One stage of the journey, as the user sees it. Step 4 ends on the Stamped screen. */
private val STAGES = listOf("Read your card", "Check it's genuine", "Make a private proof", "Stamp your wallet")

private data class Moment(
    val stage: Int,
    val stageDone: Boolean,
    val title: String,
    val text: String,
    val glyph: Glyph,
    val spinning: Boolean,
)

private fun momentFor(state: TapUiState): Moment = when (state) {
    TapUiState.WaitingForCard -> Moment(0, false, "Hold your card to the phone", "Flat on the back, near the camera.", Glyph.Card, true)
    TapUiState.Reading -> Moment(0, false, "Reading your card", "Keep it still on the back of the phone.", Glyph.Card, true)
    TapUiState.CheckingLocally -> Moment(1, false, "Checking it's genuine", "Right here on your phone.", Glyph.Shield, true)
    TapUiState.VerifiedOnPhone -> Moment(1, true, "Genuine card", "Checked on your phone. You can move the card away.", Glyph.Shield, false)
    TapUiState.Sending -> Moment(2, false, "Locking your card data", "Encrypted on this phone before it leaves. You can move the card away.", Glyph.Lock, true)
    is TapUiState.Proving -> Moment(2, false, "Making your private proof", "About 10 seconds. You can move the card away.", Glyph.Spark, false)
    else -> Moment(0, false, "Working", "", Glyph.Card, true)
}

/** True for every state this screen shows, so the app keeps one screen (and its ring) across all of them. */
internal fun isJourney(state: TapUiState): Boolean = when (state) {
    TapUiState.WaitingForCard, TapUiState.Reading, TapUiState.CheckingLocally, TapUiState.VerifiedOnPhone,
    TapUiState.Sending, is TapUiState.Proving,
    -> true
    else -> false
}

@Composable
fun JourneyScreen(state: TapUiState, modifier: Modifier = Modifier) {
    val m = momentFor(state)
    ScreenBody(
        modifier,
        centered = true,
        spacing = 20,
        bottom = {
            Text(
                "Your card number never goes on-chain.",
                Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
                style = MaterialTheme.typography.bodySmall,
                color = WmColors.Muted,
                textAlign = TextAlign.Center,
            )
        },
    ) {
        StageRing(m, state is TapUiState.Proving)

        AnimatedContent(
            targetState = m.title to m.text,
            transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(120)) },
            label = "copy",
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        ) { (title, text) ->
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ScreenTitle(title, centered = true, style = MaterialTheme.typography.headlineMedium)
                if (text.isNotEmpty()) ScreenText(text, centered = true)
            }
        }

        Checklist(m)
    }
}

/**
 * The ring: it spins while a step's length is unknown. While proving it fills over about 12 seconds and waits near
 * the end, so it never claims to be done before the chain says so.
 */
@Composable
private fun StageRing(m: Moment, proving: Boolean) {
    val still = rememberReduceMotion()
    val fill = remember { Animatable(0.06f) }
    LaunchedEffect(proving) {
        if (proving) {
            fill.snapTo(0.06f)
            if (!still) fill.animateTo(0.92f, tween(12_000, easing = LinearOutSlowInEasing)) else fill.snapTo(0.5f)
        }
    }
    val progress: Float? = when {
        proving -> fill.value
        m.spinning -> null
        else -> 0.35f
    }
    ProgressRing(progress) {
        Box(Modifier.size(104.dp).background(WmColors.SaffronSoft, CircleShape), contentAlignment = Alignment.Center) {
            AnimatedContent(m.glyph, transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(120)) }, label = "glyph") { g ->
                GlyphIcon(g, Modifier.size(48.dp), strokeWidth = 2.2.dp)
            }
        }
    }
}

/** The four steps, ticked off as they happen. */
@Composable
private fun Checklist(m: Moment) {
    Column(
        Modifier
            .fillMaxWidth()
            .border(1.dp, WmColors.Line, WmShape.Card)
            .padding(horizontal = 18.dp, vertical = 8.dp),
    ) {
        STAGES.forEachIndexed { i, label ->
            val status = when {
                i < m.stage || (i == m.stage && m.stageDone) -> StageStatus.Done
                i == m.stage -> StageStatus.Active
                else -> StageStatus.Pending
            }
            StageRow(label, status)
        }
    }
}

private enum class StageStatus { Done, Active, Pending }

@Composable
private fun StageRow(label: String, status: StageStatus) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .semantics(mergeDescendants = true) {
                stateDescription = when (status) {
                    StageStatus.Done -> "Done"
                    StageStatus.Active -> "In progress"
                    StageStatus.Pending -> "Next"
                }
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) {
            when (status) {
                StageStatus.Done -> Box(Modifier.size(22.dp).background(WmColors.Ink, CircleShape), contentAlignment = Alignment.Center) {
                    GlyphIcon(Glyph.Check, Modifier.size(14.dp), color = WmColors.White, strokeWidth = 2.dp)
                }
                StageStatus.Active -> ProgressRing(null, size = 20.dp, stroke = 2.5.dp) {}
                StageStatus.Pending -> Box(Modifier.size(20.dp).border(1.5.dp, WmColors.Line, CircleShape))
            }
        }
        Spacer(Modifier.width(14.dp))
        Text(
            label,
            style = if (status == StageStatus.Active) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
            color = if (status == StageStatus.Pending) WmColors.Muted else WmColors.Ink,
        )
    }
}
