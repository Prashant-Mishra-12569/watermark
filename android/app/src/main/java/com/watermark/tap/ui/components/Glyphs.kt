package com.watermark.tap.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.theme.WmColors

/** Small line icons, drawn by hand so the app needs no icon library. */
enum class Glyph { Lock, Phone, Check, Card, Alert }

@Composable
fun GlyphIcon(glyph: Glyph, modifier: Modifier = Modifier, color: Color = WmColors.Ink, strokeWidth: Dp = 1.6.dp) {
    Canvas(modifier) {
        val stroke = Stroke(width = strokeWidth.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        when (glyph) {
            Glyph.Lock -> drawLock(color, stroke)
            Glyph.Phone -> drawPhone(color, stroke)
            Glyph.Check -> drawCheck(color, stroke)
            Glyph.Card -> drawCardGlyph(color, stroke)
            Glyph.Alert -> drawAlert(color, stroke)
        }
    }
}

private fun DrawScope.drawLock(color: Color, stroke: Stroke) {
    val w = size.width
    val h = size.height
    drawRoundRect(
        color = color,
        topLeft = Offset(w * 0.18f, h * 0.44f),
        size = Size(w * 0.64f, h * 0.46f),
        cornerRadius = CornerRadius(w * 0.1f),
        style = stroke,
    )
    val shackle = Path().apply {
        moveTo(w * 0.32f, h * 0.44f)
        lineTo(w * 0.32f, h * 0.30f)
        cubicTo(w * 0.32f, h * 0.06f, w * 0.68f, h * 0.06f, w * 0.68f, h * 0.30f)
        lineTo(w * 0.68f, h * 0.44f)
    }
    drawPath(shackle, color, style = stroke)
}

private fun DrawScope.drawPhone(color: Color, stroke: Stroke) {
    val w = size.width
    val h = size.height
    drawRoundRect(
        color = color,
        topLeft = Offset(w * 0.26f, h * 0.08f),
        size = Size(w * 0.48f, h * 0.84f),
        cornerRadius = CornerRadius(w * 0.1f),
        style = stroke,
    )
    drawLine(color, Offset(w * 0.43f, h * 0.80f), Offset(w * 0.57f, h * 0.80f), stroke.width, StrokeCap.Round)
}

private fun DrawScope.drawCheck(color: Color, stroke: Stroke) {
    val w = size.width
    val h = size.height
    val path = Path().apply {
        moveTo(w * 0.20f, h * 0.53f)
        lineTo(w * 0.42f, h * 0.74f)
        lineTo(w * 0.80f, h * 0.30f)
    }
    drawPath(path, color, style = stroke)
}

private fun DrawScope.drawCardGlyph(color: Color, stroke: Stroke) {
    val w = size.width
    val h = size.height
    drawRoundRect(
        color = color,
        topLeft = Offset(w * 0.10f, h * 0.22f),
        size = Size(w * 0.80f, h * 0.56f),
        cornerRadius = CornerRadius(w * 0.1f),
        style = stroke,
    )
    drawLine(color, Offset(w * 0.22f, h * 0.62f), Offset(w * 0.42f, h * 0.62f), stroke.width, StrokeCap.Round)
}

private fun DrawScope.drawAlert(color: Color, stroke: Stroke) {
    val w = size.width
    val h = size.height
    drawLine(color, Offset(w * 0.5f, h * 0.26f), Offset(w * 0.5f, h * 0.58f), stroke.width, StrokeCap.Round)
    drawCircle(color, radius = stroke.width * 0.75f, center = Offset(w * 0.5f, h * 0.74f))
}

enum class StatusKind { Ok, Problem }

/** A large round status mark: green with a check when something passed, a red ring when it stopped. */
@Composable
fun StatusMark(kind: StatusKind, modifier: Modifier = Modifier, size: Dp = 72.dp) {
    Canvas(modifier.size(size)) {
        val r = this.size.minDimension / 2f
        when (kind) {
            StatusKind.Ok -> {
                drawCircle(WmColors.Ok, radius = r)
                val s = Stroke(width = r * 0.13f, cap = StrokeCap.Round, join = StrokeJoin.Round)
                val path = Path().apply {
                    moveTo(r * 0.58f, r * 1.04f)
                    lineTo(r * 0.88f, r * 1.32f)
                    lineTo(r * 1.42f, r * 0.70f)
                }
                drawPath(path, WmColors.White, style = s)
            }
            StatusKind.Problem -> {
                val ring = r * 0.06f
                drawCircle(WmColors.Error, radius = r - ring / 2f, style = Stroke(width = ring))
                drawLine(WmColors.Error, Offset(r, r * 0.52f), Offset(r, r * 1.12f), r * 0.11f, StrokeCap.Round)
                drawCircle(WmColors.Error, radius = r * 0.075f, center = Offset(r, r * 1.42f))
            }
        }
    }
}

/** A soft grey circle holding one glyph: the quiet visual for in-progress steps. */
@Composable
fun GlyphBadge(glyph: Glyph, modifier: Modifier = Modifier, size: Dp = 72.dp) {
    Box(
        modifier = modifier.size(size).clip(CircleShape).background(WmColors.Surface),
        contentAlignment = Alignment.Center,
    ) {
        GlyphIcon(glyph, Modifier.size(size * 0.44f), strokeWidth = 2.dp)
    }
}
