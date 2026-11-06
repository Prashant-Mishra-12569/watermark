package com.watermark.tap.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.watermark.tap.R

/** The Mumbai skyline strip from the website hero: ink line art and one saffron sun. Decorative. */
@Composable
fun Skyline(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.wm_skyline),
        contentDescription = null,
        modifier = modifier.fillMaxWidth().aspectRatio(1600f / 292f),
        contentScale = ContentScale.FillWidth,
    )
}
