package com.watermark.tap.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.theme.WmColors

/**
 * The big ring in the middle of the working screens. [progress] null spins a short saffron arc (we don't know how
 * long it takes); a number fills the ring smoothly up to it. With animations off the arc stands still.
 */
@Composable
fun ProgressRing(
    progress: Float?,
    modifier: Modifier = Modifier,
    size: Dp = 188.dp,
    stroke: Dp = 6.dp,
    content: @Composable BoxScope.() -> Unit,
) {
    val still = rememberReduceMotion()
    val spin = rememberInfiniteTransition(label = "ring")
    val angle by spin.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1100, easing = LinearEasing), RepeatMode.Restart),
        label = "angle",
    )
    val filled by animateFloatAsState(progress ?: 0f, tween(if (still) 0 else 600), label = "filled")
    Box(
        modifier
            .size(size)
            .semantics {
                progressBarRangeInfo = if (progress == null) ProgressBarRangeInfo.Indeterminate else ProgressBarRangeInfo(progress, 0f..1f)
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val s = stroke.toPx()
            val ring = Stroke(width = s, cap = StrokeCap.Round)
            val inset = s / 2f
            val arcSize = androidx.compose.ui.geometry.Size(this.size.width - s, this.size.height - s)
            val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
            drawArc(WmColors.Surface, 0f, 360f, false, topLeft, arcSize, style = ring)
            if (progress == null) {
                val start = if (still) -90f else angle - 90f
                drawArc(WmColors.Saffron, start, 80f, false, topLeft, arcSize, style = ring)
            } else {
                drawArc(WmColors.Saffron, -90f, 360f * filled.coerceIn(0f, 1f), false, topLeft, arcSize, style = ring)
            }
        }
        content()
    }
}
