package com.watermark.tap.ui

// UI package: owned by Samanway. Placeholder layout so the flow can be tested end to end.

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.watermark.tap.RefusalReason
import com.watermark.tap.TapUiState

@Composable
fun WatermarkApp(state: TapUiState) {
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("WATERMARK", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                when (state) {
                    TapUiState.Idle -> Text("Scan the QR code on the website to start.")
                    is TapUiState.InvalidSession -> Text("This link can't be used: ${state.reason}")
                    is TapUiState.Consent -> ConsentBlock(state)
                    TapUiState.WaitingForCard -> Text("Hold your bank card to the back of the phone.")
                    TapUiState.Reading -> Text("Reading card… keep it still.")
                    TapUiState.CheckingLocally -> Text("Checking the card on this phone…")
                    is TapUiState.Refused -> Text(state.reason.message)
                    TapUiState.Sending -> Text("Sending encrypted card data…")
                    is TapUiState.Proving -> Text("Proving…")
                    is TapUiState.Stamped -> Text("Stamped ✓")
                    is TapUiState.Error -> Text("Something went wrong: ${state.message}")
                }
            }
        }
    }
}

@Composable
private fun ConsentBlock(s: TapUiState.Consent) {
    Text("Wallet ending ${s.walletLast4}", style = MaterialTheme.typography.headlineMedium)
    Text("Check this matches the website, then tap your card.")
    Text("${s.appName} · ${s.filterLabel} · ${s.chainName}")
    Text(s.revealsText, style = MaterialTheme.typography.bodySmall)
    Text("No money is charged. No card number goes on-chain.", style = MaterialTheme.typography.bodySmall)
}

@Preview(showBackground = true)
@Composable
private fun ConsentPreview() = WatermarkApp(
    TapUiState.Consent(
        appName = "Watermark",
        filterLabel = "SBI RuPay debit",
        revealsText = "Your wallet will show it was linked to a real bank card that passed this app's filter.",
        walletLast4 = "a1b2",
        chainName = "Whitechain Sepolia",
        expiresAtEpochSec = 0,
    ),
)

@Preview(showBackground = true)
@Composable
private fun RefusedPreview() = WatermarkApp(TapUiState.Refused(RefusalReason.NOT_IN_POLICY))

@Preview(showBackground = true)
@Composable
private fun StampedPreview() = WatermarkApp(TapUiState.Stamped("0x1234", "https://explorer.testnet.whitechain.io"))
