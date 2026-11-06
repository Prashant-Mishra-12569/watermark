package com.watermark.tap.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.theme.WmColors

/**
 * A thin indeterminate bar: a short saffron segment sliding along a grey track. It shows work is happening without
 * pretending to know how far along it is. Holds still when animations are off.
 */
@Composable
fun QuietProgress(modifier: Modifier = Modifier, label: String = "Working") {
    val still = rememberReduceMotion()
    val transition = rememberInfiniteTransition(label = "quietProgress")
    val moving by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1500, easing = FastOutSlowInEasing), RepeatMode.Restart),
        label = "slide",
    )
    val t = if (still) 0.5f else moving
    Canvas(
        modifier
            .width(160.dp)
            .height(4.dp)
            .semantics { contentDescription = label },
    ) {
        val y = size.height / 2f
        val stroke = size.height
        val inset = stroke / 2f
        drawLine(WmColors.Line, Offset(inset, y), Offset(size.width - inset, y), stroke, StrokeCap.Round)
        val segment = size.width * 0.32f
        val rawStart = -segment + t * (size.width + segment)
        val start = rawStart.coerceIn(inset, size.width - inset)
        val end = (rawStart + segment).coerceIn(inset, size.width - inset)
        if (end - start > 1f) {
            drawLine(WmColors.Saffron, Offset(start, y), Offset(end, y), stroke, StrokeCap.Round)
        }
    }
}
