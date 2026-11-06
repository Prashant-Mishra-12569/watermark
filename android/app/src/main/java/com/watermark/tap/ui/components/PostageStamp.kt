package com.watermark.tap.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.watermark.tap.R
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmSerif
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.PI
import kotlin.math.sin

/** A postage stamp's edge: a rectangle with round bites all the way round. */
private class PerforatedShape(private val hole: Dp, private val pitch: Dp) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val r = with(density) { hole.toPx() }
        val p = with(density) { pitch.toPx() }
        val paper = Path().apply { addRect(Rect(0f, 0f, size.width, size.height)) }
        val bites = Path()
        val across = maxOf(2, (size.width / p).toInt())
        val down = maxOf(2, (size.height / p).toInt())
        for (i in 0..across) {
            val x = size.width * i / across
            bites.addOval(Rect(Offset(x, 0f), r))
            bites.addOval(Rect(Offset(x, size.height), r))
        }
        for (j in 1 until down) {
            val y = size.height * j / down
            bites.addOval(Rect(Offset(0f, y), r))
            bites.addOval(Rect(Offset(size.width, y), r))
        }
        val edge = Path()
        edge.op(paper, bites, PathOperation.Difference)
        return Outline.Generic(edge)
    }
}

/**
 * The success moment: a Watermark postage stamp (₹0 face value, like the Genesis Pass art) drops onto the screen, then
 * a "STAMPED" postmark lands on it. [onLanded] fires as the postmark hits, for the vibration. With animations off it
 * all simply appears.
 */
@Composable
fun PostageStamp(modifier: Modifier = Modifier, width: Dp = 172.dp, onLanded: () -> Unit = {}) {
    val still = rememberReduceMotion()
    val landed by rememberUpdatedState(onLanded)
    val scale = remember { Animatable(if (still) 1f else 1.35f) }
    val tilt = remember { Animatable(if (still) -5f else -16f) }
    val alpha = remember { Animatable(if (still) 1f else 0f) }
    val markScale = remember { Animatable(if (still) 1f else 1.5f) }
    val markAlpha = remember { Animatable(if (still) 0.92f else 0f) }
    LaunchedEffect(still) {
        if (still) {
            landed()
            return@LaunchedEffect
        }
        launch { alpha.animateTo(1f, tween(140)) }
        launch { tilt.animateTo(-5f, spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessMediumLow)) }
        scale.animateTo(1f, spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessMediumLow))
        delay(80)
        launch { markAlpha.animateTo(0.92f, tween(120)) }
        markScale.animateTo(1f, tween(170))
        landed()
    }
    val date = remember { SimpleDateFormat("dd MMM yy", Locale.ENGLISH).format(Date()).uppercase(Locale.ENGLISH) }
    val height = width * 1.24f
    val edge = remember { PerforatedShape(hole = 5.dp, pitch = 14.dp) }

    Box(
        modifier
            .size(width + 56.dp, height + 24.dp)
            .clearAndSetSemantics { contentDescription = "Stamped" },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(width, height)
                .graphicsLayer {
                    scaleX = scale.value
                    scaleY = scale.value
                    rotationZ = tilt.value
                    this.alpha = alpha.value
                }
                .shadow(14.dp, edge, ambientColor = WmColors.Ink, spotColor = WmColors.Ink)
                .background(WmColors.White, edge)
                .padding(11.dp),
        ) {
            Column(
                Modifier
                    .fillMaxSize()
                    .background(WmColors.SaffronSoft, RoundedCornerShape(3.dp))
                    .border(1.5.dp, WmColors.Saffron, RoundedCornerShape(3.dp))
                    .padding(vertical = 12.dp, horizontal = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("WATERMARK", style = MaterialTheme.typography.labelSmall, color = WmColors.Ink)
                Image(painterResource(R.drawable.wm_logo), contentDescription = null, modifier = Modifier.size(width * 0.42f))
                Text("₹0", fontFamily = WmSerif, fontStyle = FontStyle.Italic, fontSize = 40.sp, lineHeight = 40.sp, color = WmColors.Ink)
                Text("ONE CARD · ONE STAMP", style = MaterialTheme.typography.labelSmall, fontSize = 9.sp, color = WmColors.Muted)
            }
        }

        // The postmark, slammed on afterwards across the stamp's lower right corner
        Box(
            Modifier
                .align(Alignment.BottomEnd)
                .offset(x = (-2).dp, y = (-6).dp)
                .size(width * 0.66f)
                .graphicsLayer {
                    scaleX = markScale.value
                    scaleY = markScale.value
                    this.alpha = markAlpha.value
                    rotationZ = -18f
                },
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.fillMaxSize()) {
                val r = size.minDimension / 2f
                val c = Offset(size.width / 2f, size.height / 2f)
                drawCircle(WmColors.Ink, r - 2.dp.toPx(), c, style = Stroke(2.2.dp.toPx()))
                drawCircle(WmColors.Ink, r * 0.80f, c, style = Stroke(1.dp.toPx()))
                // Cancellation waves running off to the left, like a real postmark
                for (k in 0..2) {
                    val y = c.y - r * 0.32f + k * r * 0.32f
                    val wave = Path().apply {
                        moveTo(-r * 1.1f, y)
                        var x = -r * 1.1f
                        while (x < c.x - r * 0.95f) {
                            x += 2f
                            lineTo(x, y + sin(x / (r * 0.18f) * PI.toFloat()) * r * 0.06f)
                        }
                    }
                    drawPath(wave, WmColors.Ink, style = Stroke(1.6.dp.toPx(), cap = StrokeCap.Round))
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("STAMPED", style = MaterialTheme.typography.labelSmall, fontSize = 10.sp, color = WmColors.Ink)
                Text(date, style = MaterialTheme.typography.labelSmall, fontSize = 8.sp, color = WmColors.Ink)
            }
        }
    }
}
