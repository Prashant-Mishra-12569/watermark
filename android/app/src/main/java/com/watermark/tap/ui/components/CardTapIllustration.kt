package com.watermark.tap.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.theme.WmColors

/**
 * A bank card meeting the back of a phone, in the same tilt as the logo. The card floats a little and the three tap
 * lines pulse, unless animations are off. Decorative: the screen text says what to do.
 */
@Composable
fun CardTapIllustration(modifier: Modifier = Modifier, width: Dp = 240.dp, animate: Boolean = true) {
    val still = !animate || rememberReduceMotion()
    val transition = rememberInfiniteTransition(label = "cardTap")
    val wave by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1300, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "wave",
    )
    val v = if (still) 1f else wave
    Canvas(modifier.size(width = width, height = width * (200f / 240f))) {
        val w = size.width
        val h = size.height
        val line = 2.dp.toPx()

        // Back of the phone, upright, with a camera block
        val phoneLeft = w * 0.46f
        val phoneTop = h * 0.04f
        val phoneSize = Size(w * 0.40f, h * 0.92f)
        drawRoundRect(WmColors.White, Offset(phoneLeft, phoneTop), phoneSize, CornerRadius(w * 0.08f))
        drawRoundRect(WmColors.Ink, Offset(phoneLeft, phoneTop), phoneSize, CornerRadius(w * 0.08f), style = Stroke(line))
        val camLeft = phoneLeft + w * 0.05f
        val camTop = phoneTop + h * 0.04f
        drawRoundRect(
            WmColors.Ink,
            Offset(camLeft, camTop),
            Size(w * 0.11f, h * 0.20f),
            CornerRadius(w * 0.035f),
            style = Stroke(line * 0.75f),
        )
        drawCircle(WmColors.Ink, radius = w * 0.022f, center = Offset(camLeft + w * 0.055f, camTop + h * 0.055f), style = Stroke(line * 0.75f))
        drawCircle(WmColors.Ink, radius = w * 0.022f, center = Offset(camLeft + w * 0.055f, camTop + h * 0.145f), style = Stroke(line * 0.75f))

        // The card, tilted -9 degrees, resting on the middle of the phone
        val cw = w * 0.62f
        val ch = cw / 1.586f
        val cx = w * 0.44f
        val cy = h * 0.58f - 6.dp.toPx() * (1f - v)
        val left = cx - cw / 2f
        val top = cy - ch / 2f
        rotate(degrees = -9f, pivot = Offset(cx, cy)) {
            // A white rim keeps the card apart from the phone outline
            drawRoundRect(
                WmColors.White,
                Offset(left - line * 1.5f, top - line * 1.5f),
                Size(cw + line * 3f, ch + line * 3f),
                CornerRadius(w * 0.05f),
            )
            drawRoundRect(WmColors.Ink, Offset(left, top), Size(cw, ch), CornerRadius(w * 0.04f))
            // The chip it reads, in saffron
            drawRoundRect(
                WmColors.Saffron,
                Offset(left + cw * 0.10f, top + ch * 0.30f),
                Size(cw * 0.17f, ch * 0.25f),
                CornerRadius(cw * 0.03f),
            )
            drawLine(
                WmColors.Muted,
                Offset(left + cw * 0.10f, top + ch * 0.78f),
                Offset(left + cw * 0.42f, top + ch * 0.78f),
                line,
                StrokeCap.Round,
            )
            // Three tap lines off the top-right corner, like the logo
            val corner = Offset(left + cw, top)
            val tap = WmColors.Ink.copy(alpha = 0.3f + 0.7f * v)
            val u = w * 0.01f
            drawLine(tap, corner + Offset(-2 * u, -6 * u), corner + Offset(0f, -13 * u), line, StrokeCap.Round)
            drawLine(tap, corner + Offset(4 * u, -4 * u), corner + Offset(10 * u, -10 * u), line, StrokeCap.Round)
            drawLine(tap, corner + Offset(6 * u, 1 * u), corner + Offset(13 * u, 2 * u), line, StrokeCap.Round)
        }
    }
}
