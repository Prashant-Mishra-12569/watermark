package com.watermark.tap.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.theme.WmColors

val StepLabels = listOf("Check", "Tap", "Prove", "Stamped")

enum class StepStatus { Active, Done, Failed }

/** Where the flow is: [step] 1..4 (0 = not started) and how that step is going. */
data class StepProgress(val step: Int, val status: StepStatus = StepStatus.Active)

/** 1 Check · 2 Tap · 3 Prove · 4 Stamped, as four short bars with labels. Saffron marks the current step. */
@Composable
fun StepIndicator(progress: StepProgress, modifier: Modifier = Modifier) {
    val spoken = if (progress.step in 1..StepLabels.size) {
        val name = StepLabels[progress.step - 1]
        when (progress.status) {
            StepStatus.Active -> "Step ${progress.step} of 4: $name"
            StepStatus.Done -> "Step ${progress.step} of 4 done: $name"
            StepStatus.Failed -> "Stopped at step ${progress.step} of 4: $name"
        }
    } else {
        "Four steps: check, tap, prove, stamped"
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StepLabels.forEachIndexed { index, label ->
            val n = index + 1
            val isCurrent = n == progress.step
            val done = n < progress.step || (isCurrent && progress.status == StepStatus.Done)
            val barColor = when {
                done -> WmColors.Ink
                isCurrent && progress.status == StepStatus.Failed -> WmColors.Error
                isCurrent -> WmColors.Saffron
                else -> WmColors.Line
            }
            val reached = done || isCurrent
            Column(Modifier.weight(1f)) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(barColor),
                )
                Text(
                    "$n $label",
                    modifier = Modifier.padding(top = 6.dp),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = if (isCurrent) FontWeight.SemiBold else FontWeight.Medium,
                    color = if (reached) WmColors.Ink else WmColors.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
