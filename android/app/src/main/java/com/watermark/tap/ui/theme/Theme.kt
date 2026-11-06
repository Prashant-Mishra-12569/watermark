package com.watermark.tap.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val WmColorScheme = lightColorScheme(
    primary = WmColors.Ink,
    onPrimary = WmColors.White,
    secondary = WmColors.Saffron,
    onSecondary = WmColors.Ink,
    background = WmColors.White,
    onBackground = WmColors.Ink,
    surface = WmColors.White,
    onSurface = WmColors.Ink,
    surfaceVariant = WmColors.Surface,
    onSurfaceVariant = WmColors.Muted,
    surfaceTint = WmColors.White,
    outline = WmColors.Line,
    outlineVariant = WmColors.Line,
    error = WmColors.Error,
    onError = WmColors.White,
)

/** Light only: the brand is white and ink. */
@Composable
fun WatermarkTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = WmColorScheme,
        typography = WmTypography,
        shapes = WmShapes,
        content = content,
    )
}
