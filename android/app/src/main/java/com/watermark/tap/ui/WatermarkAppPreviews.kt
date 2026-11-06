package com.watermark.tap.ui

// One preview per screen, with fake values only (no real card, wallet or transaction).
// Open this file in Split view in Android Studio to see every screen without a card.

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.watermark.tap.RefusalReason
import com.watermark.tap.TapUiState

private const val W = 393
private const val H = 852

private val consent = TapUiState.Consent(
    appName = "Watermark",
    filterLabel = "RuPay bank debit (India, no prepaid) · 4,208 card ranges",
    revealsText = "Your wallet will show it was linked to a real bank card that passed this filter. Nothing else about the card.",
    walletLast4 = "1a2b",
    chainName = "Whitechain Sepolia",
    expiresAtEpochSec = 1_800_000_000L,
)

@Preview(name = "01 Home", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun HomePreview() = WatermarkApp(TapUiState.Idle)

@Preview(name = "02 Opening request", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun LoadingSessionPreview() = WatermarkApp(TapUiState.LoadingSession)

@Preview(name = "03 Is this your wallet?", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ConsentPreview() = WatermarkApp(consent)

@Preview(name = "04 Reading", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ReadingPreview() = WatermarkApp(TapUiState.Reading)

@Preview(name = "05 Checking", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun CheckingPreview() = WatermarkApp(TapUiState.CheckingLocally)

@Preview(name = "06 Sending", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun SendingPreview() = WatermarkApp(TapUiState.Sending)

@Preview(name = "07 Proving", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ProvingPreview() = WatermarkApp(TapUiState.Proving("job"))

@Preview(name = "08 Stamped", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun StampedPreview() = WatermarkApp(
    TapUiState.Stamped(
        txHash = "0x" + "ab".repeat(32),
        explorerUrl = "https://explorer.testnet.whitechain.io/tx/0x" + "ab".repeat(32),
    ),
)

@Preview(name = "09 Proved, not stamped", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ProvedNotStampedPreview() = WatermarkApp(TapUiState.ProvedNotStamped)

@Preview(name = "10 Card not accepted", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun NotInPolicyPreview() = WatermarkApp(TapUiState.Refused(RefusalReason.NOT_IN_POLICY))

@Preview(name = "11 Card already linked", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun AlreadyLinkedPreview() = WatermarkApp(TapUiState.Refused(RefusalReason.CARD_ALREADY_LINKED))

@Preview(name = "12 QR expired", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ExpiredPreview() = WatermarkApp(TapUiState.Refused(RefusalReason.SESSION_EXPIRED))

@Preview(name = "13 NFC off", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun NfcOffPreview() = WatermarkApp(TapUiState.Refused(RefusalReason.NFC_OFF))

@Preview(name = "14 Card moved", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun NfcLostPreview() = WatermarkApp(TapUiState.Refused(RefusalReason.NFC_LOST))

@Preview(name = "15 Not from Watermark", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun WrongSignerPreview() = WatermarkApp(TapUiState.Refused(RefusalReason.WRONG_SIGNER))

@Preview(name = "16 Can't reach the prover", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun ErrorPreview() = WatermarkApp(
    TapUiState.Error("Can't reach the prover at prover.usewatermark.xyz. Check the phone's internet connection, then try again."),
)

@Preview(name = "17 Invalid QR", widthDp = W, heightDp = H, showBackground = true)
@Composable
private fun InvalidSessionPreview() = WatermarkApp(TapUiState.InvalidSession("The link is missing its signature."))

@Preview(name = "Small phone: Is this your wallet?", widthDp = 360, heightDp = 640, showBackground = true)
@Composable
private fun SmallConsentPreview() = WatermarkApp(consent)

@Preview(name = "Small phone: Stamped", widthDp = 360, heightDp = 640, showBackground = true)
@Composable
private fun SmallStampedPreview() = WatermarkApp(TapUiState.Stamped("0x" + "cd".repeat(32), "https://example.invalid"))

@Preview(name = "Large text: Home", widthDp = W, heightDp = H, fontScale = 1.3f, showBackground = true)
@Composable
private fun LargeTextHomePreview() = WatermarkApp(TapUiState.Idle)
