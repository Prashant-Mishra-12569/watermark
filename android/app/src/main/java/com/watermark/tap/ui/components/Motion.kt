package com.watermark.tap.ui.components

import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode

/**
 * True when motion should stay still: the user turned animations off ("Remove animations" sets the animator
 * duration scale to 0), or this is an Android Studio preview, which shows the final frame.
 */
@Composable
fun rememberReduceMotion(): Boolean {
    val inPreview = LocalInspectionMode.current
    val context = LocalContext.current
    return remember(context, inPreview) {
        inPreview || runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
    }
}
