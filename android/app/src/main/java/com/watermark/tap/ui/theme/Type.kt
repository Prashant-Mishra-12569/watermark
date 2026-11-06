package com.watermark.tap.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.watermark.tap.R

// The website's three faces: Geist for text, Geist Mono for addresses and hashes, Instrument Serif italic for the one
// accent word in a headline ("Tap your card. *Keep* it private."). All SIL OFL 1.1, see assets/licenses.

@OptIn(ExperimentalTextApi::class)
private fun geist(weight: Int) =
    Font(R.font.geist, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

@OptIn(ExperimentalTextApi::class)
private fun geistMono(weight: Int) =
    Font(R.font.geist_mono, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

val WmSans = FontFamily(geist(400), geist(500), geist(600), geist(700))
val WmMono = FontFamily(geistMono(400), geistMono(500), geistMono(600))
val WmSerif = FontFamily(Font(R.font.instrument_serif_italic, FontWeight.Normal, FontStyle.Italic))

private fun style(size: Int, line: Int, weight: FontWeight, tracking: Double = 0.0) = TextStyle(
    fontFamily = WmSans,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = line.sp,
    letterSpacing = tracking.sp,
)

/** Big, calm and tight like the website: semibold titles with slightly negative tracking. */
val WmTypography = Typography(
    displayLarge = style(44, 48, FontWeight.SemiBold, -1.4),
    displaySmall = style(36, 40, FontWeight.SemiBold, -1.0),
    headlineLarge = style(32, 36, FontWeight.SemiBold, -0.9),
    headlineMedium = style(28, 32, FontWeight.SemiBold, -0.7),
    headlineSmall = style(22, 28, FontWeight.SemiBold, -0.3),
    titleLarge = style(20, 26, FontWeight.SemiBold, -0.2),
    titleMedium = style(17, 24, FontWeight.SemiBold, -0.1),
    titleSmall = style(15, 20, FontWeight.SemiBold),
    bodyLarge = style(17, 25, FontWeight.Normal, -0.1),
    bodyMedium = style(15, 22, FontWeight.Normal),
    bodySmall = style(13, 18, FontWeight.Normal),
    labelLarge = style(16, 20, FontWeight.SemiBold),
    labelMedium = style(13, 18, FontWeight.Medium),
    labelSmall = style(11, 14, FontWeight.SemiBold, 1.2),
)

/**
 * [text] with [accent] set in the serif italic, the website's headline style. The serif runs small next to Geist, so
 * it's scaled up a little to sit on the same visual size.
 */
fun accented(text: String, accent: String?): AnnotatedString = buildAnnotatedString {
    val at = if (accent == null) -1 else text.indexOf(accent)
    if (at < 0) {
        append(text)
        return@buildAnnotatedString
    }
    append(text.substring(0, at))
    withStyle(SpanStyle(fontFamily = WmSerif, fontStyle = FontStyle.Italic, fontWeight = FontWeight.Normal, fontSize = 1.14.em, letterSpacing = 0.sp)) {
        append(accent!!)
    }
    append(text.substring(at + accent!!.length))
}
