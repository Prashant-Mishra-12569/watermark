package com.watermark.tap.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.watermark.tap.R
import com.watermark.tap.ui.theme.WmColors

/** The small bar on every screen: the One tap mark, "Watermark", and the four steps under it. */
@Composable
fun WmTopBar(progress: StepProgress, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 12.dp, bottom = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(
                painter = painterResource(R.drawable.wm_logo),
                contentDescription = null,
                modifier = Modifier.size(30.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                "Watermark",
                modifier = Modifier.semantics { heading() },
                style = MaterialTheme.typography.titleMedium,
                color = WmColors.Ink,
            )
        }
        Spacer(Modifier.height(14.dp))
        StepIndicator(progress)
    }
}
