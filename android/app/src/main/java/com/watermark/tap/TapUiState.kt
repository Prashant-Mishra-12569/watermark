package com.watermark.tap

/**
 * Every state the tap screen can show. Shared contract between the card logic (Prashant) and the UI (Samanway):
 * change it only by agreement. The UI renders these; it never touches card data.
 */
sealed interface TapUiState {
    /** Opened without a link. */
    data object Idle : TapUiState

    data class InvalidSession(val reason: String) : TapUiState

    /** "Check this matches the website, then tap your card." */
    data class Consent(
        val appName: String,
        val filterLabel: String,
        val revealsText: String,
        val walletLast4: String,
        val chainName: String,
        val expiresAtEpochSec: Long,
    ) : TapUiState

    data object WaitingForCard : TapUiState
    data object Reading : TapUiState
    data object CheckingLocally : TapUiState

    /** Stopped on the phone: nothing was sent. */
    data class Refused(val reason: RefusalReason) : TapUiState

    data object Sending : TapUiState
    data class Proving(val jobId: String) : TapUiState
    data class Stamped(val txHash: String, val explorerUrl: String) : TapUiState
    data class Error(val message: String) : TapUiState
}

enum class RefusalReason(val message: String) {
    NOT_IN_POLICY("This card isn't allowed by this app's rules. Nothing was sent."),
    EXPIRES_TOO_SOON("This card expires before the stamp would. Nothing was sent."),
    BAD_CARD("This card couldn't be verified. Nothing was sent."),
    SESSION_EXPIRED("This session has expired. Scan a new QR code."),
    WRONG_SIGNER("This link wasn't issued by Watermark. Nothing was sent."),
    NFC_LOST("The card moved away. Hold it still and try again."),
    NFC_OFF("Turn on NFC to tap your card."),
}
