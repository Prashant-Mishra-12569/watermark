package com.watermark.tap.ui

// One preview per TapUiState, with fake values only (no real card, wallet or transaction).

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.watermark.tap.RefusalReason
import com.watermark.tap.TapUiState

private const val W = 393
private const val H = 852

@Preview(name = "01 Idle", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun IdlePreview() = WatermarkApp(TapUiState.Idle)

@Preview(name = "02 Loading session", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun LoadingSessionPreview() = WatermarkApp(TapUiState.LoadingSession)

@Preview(name = "03 Invalid session", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun InvalidSessionPreview() = WatermarkApp(TapUiState.InvalidSession("The link is missing its signature."))

@Preview(name = "04 Consent", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ConsentPreview() = WatermarkApp(
    TapUiState.Consent(
        appName = "Watermark",
        filterLabel = "RuPay debit cards from Indian banks",
        revealsText = "Your wallet will show it was linked to a real bank card that passed this app's filter.",
        walletLast4 = "1a2b",
        chainName = "Whitechain Sepolia",
        expiresAtEpochSec = 1_800_000_000L,
    ),
)

@Preview(name = "05 Waiting for card", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun WaitingForCardPreview() = WatermarkApp(TapUiState.WaitingForCard)

@Preview(name = "06 Reading", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ReadingPreview() = WatermarkApp(TapUiState.Reading)

@Preview(name = "07 Checking locally", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun CheckingLocallyPreview() = WatermarkApp(TapUiState.CheckingLocally)

@Preview(name = "08 Verified on phone", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun VerifiedOnPhonePreview() = WatermarkApp(TapUiState.VerifiedOnPhone)

@Preview(name = "09 Sending", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun SendingPreview() = WatermarkApp(TapUiState.Sending)

@Preview(name = "10 Proving", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ProvingPreview() = WatermarkApp(TapUiState.Proving(jobId = "job-preview"))

@Preview(name = "11 Proved, not stamped", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ProvedNotStampedPreview() = WatermarkApp(TapUiState.ProvedNotStamped)

@Preview(name = "12 Stamped", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun StampedPreview() = WatermarkApp(
    TapUiState.Stamped(
        txHash = "0x" + "0123456789abcdef".repeat(4),
        explorerUrl = "https://explorer.testnet.whitechain.io",
    ),
)

@Preview(name = "13 Refused: not in policy", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun RefusedPreview() = WatermarkApp(TapUiState.Refused(RefusalReason.NOT_IN_POLICY))

@Preview(name = "13b Refused: NFC off", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun RefusedNfcOffPreview() = WatermarkApp(TapUiState.Refused(RefusalReason.NFC_OFF))

@Preview(name = "13c Refused: session used", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun RefusedSessionUsedPreview() = WatermarkApp(TapUiState.Refused(RefusalReason.SESSION_USED))

@Preview(name = "14 Error", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ErrorPreview() = WatermarkApp(TapUiState.Error("The prover took too long. Try again with a new QR."))

@Preview(name = "Small phone: Consent", widthDp = 360, heightDp = 640, showBackground = true)
@Composable
private fun ConsentSmallPreview() = WatermarkApp(
    TapUiState.Consent(
        appName = "Watermark",
        filterLabel = "Policy for app 3f2a9c1b…",
        revealsText = "Your wallet will show it was linked to a real bank card that passed this app's filter.",
        walletLast4 = "9f0e",
        chainName = "Alt mempool devnet",
        expiresAtEpochSec = 0L,
    ),
)
