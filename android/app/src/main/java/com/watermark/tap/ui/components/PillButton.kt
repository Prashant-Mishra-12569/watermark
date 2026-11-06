package com.watermark.tap.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.watermark.tap.ui.theme.WmColors
import com.watermark.tap.ui.theme.WmShape

/** Black pill button. [secondary] gives the white, outlined version. */
@Composable
fun PillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    secondary: Boolean = false,
) {
    val padding = PaddingValues(horizontal = 24.dp, vertical = 14.dp)
    val sized = modifier.fillMaxWidth().heightIn(min = 52.dp)
    if (secondary) {
        OutlinedButton(
            onClick = onClick,
            modifier = sized,
            shape = WmShape.Pill,
            border = BorderStroke(1.dp, WmColors.Ink),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = WmColors.Ink),
            contentPadding = padding,
        ) {
            Text(text, style = MaterialTheme.typography.labelLarge)
        }
    } else {
        Button(
            onClick = onClick,
            modifier = sized,
            shape = WmShape.Pill,
            colors = ButtonDefaults.buttonColors(containerColor = WmColors.Ink, contentColor = WmColors.White),
            contentPadding = padding,
        ) {
            Text(text, style = MaterialTheme.typography.labelLarge)
        }
    }
}
