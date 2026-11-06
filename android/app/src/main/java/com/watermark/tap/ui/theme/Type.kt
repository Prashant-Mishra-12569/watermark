package com.watermark.tap.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private fun style(size: Int, line: Int, weight: FontWeight, tracking: Double = 0.0) = TextStyle(
    fontFamily = FontFamily.Default,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.sp,
)

/** System sans, big and calm. Titles are semibold with slightly tight tracking, like the website. */
val WmTypography = Typography(
    displaySmall = style(34, 40, FontWeight.SemiBold, -0.6),
    headlineLarge = style(30, 36, FontWeight.SemiBold, -0.5),
    headlineMedium = style(26, 32, FontWeight.SemiBold, -0.4),
    headlineSmall = style(22, 28, FontWeight.SemiBold, -0.2),
    titleLarge = style(20, 26, FontWeight.SemiBold, -0.1),
    titleMedium = style(17, 24, FontWeight.SemiBold),
    titleSmall = style(15, 20, FontWeight.SemiBold),
    bodyLarge = style(17, 26, FontWeight.Normal),
    bodyMedium = style(15, 22, FontWeight.Normal),
    bodySmall = style(13, 18, FontWeight.Normal),
    labelLarge = style(16, 20, FontWeight.SemiBold),
    labelMedium = style(13, 18, FontWeight.Medium),
    labelSmall = style(12, 16, FontWeight.Medium, 0.2),
)

/** For the wallet ending and the transaction hash. */
val WmMono = FontFamily.Monospace
