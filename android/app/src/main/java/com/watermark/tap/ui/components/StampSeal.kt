package com.watermark.tap.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watermark.tap.ui.theme.WmColors
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * The saffron seal on the success screen. It lands once, like a rubber stamp: a quick drop from a little larger,
 * settling at a -8 degree tilt. With animations off it simply appears.
 */
@Composable
fun StampSeal(modifier: Modifier = Modifier, size: Dp = 168.dp) {
    val still = rememberReduceMotion()
    val scale = remember { Animatable(if (still) 1f else 1.5f) }
    val alpha = remember { Animatable(if (still) 1f else 0f) }
    LaunchedEffect(still) {
        if (!still) {
            launch { alpha.animateTo(1f, tween(160)) }
            scale.animateTo(1f, spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMediumLow))
        }
    }
    Box(
        modifier = modifier
            .size(size)
            .graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
                this.alpha = alpha.value
                rotationZ = -8f
            }
            .clearAndSetSemantics { contentDescription = "Stamped" },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val c = Offset(this.size.width / 2f, this.size.height / 2f)
            val outer = this.size.minDimension / 2f
            val inner = outer * 0.90f
            val teeth = 30
            val step = (2 * PI / teeth).toFloat()
            fun at(r: Float, a: Float) = Offset(c.x + r * cos(a), c.y + r * sin(a))
            // Scalloped edge, like a seal pressed into paper
            val edge = Path().apply {
                val first = at(inner, 0f)
                moveTo(first.x, first.y)
                for (i in 0 until teeth) {
                    val a0 = i * step
                    val k1 = at(outer * 1.02f, a0 + step * 0.25f)
                    val k2 = at(outer * 1.02f, a0 + step * 0.75f)
                    val end = at(inner, a0 + step)
                    cubicTo(k1.x, k1.y, k2.x, k2.y, end.x, end.y)
                }
                close()
            }
            drawPath(edge, WmColors.Saffron)
            drawCircle(WmColors.Ink, radius = outer * 0.76f, center = c, style = Stroke(1.5.dp.toPx()))
            drawCircle(WmColors.Ink, radius = outer * 0.70f, center = c, style = Stroke(0.75.dp.toPx()))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            GlyphIcon(Glyph.Check, Modifier.size(size * 0.30f), color = WmColors.Ink, strokeWidth = 4.dp)
            Text(
                "STAMPED",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp,
                color = WmColors.Ink,
            )
        }
    }
}
