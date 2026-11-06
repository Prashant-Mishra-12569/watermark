package com.watermark.tap.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

object WmShape {
    /** Cards: 24dp, as on the website. */
    val Card = RoundedCornerShape(24.dp)
    /** Chips can wrap to two lines, so they use a soft radius instead of a full pill. */
    val Chip = RoundedCornerShape(14.dp)
    val Pill = RoundedCornerShape(percent = 50)
}

val WmShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp),
)
