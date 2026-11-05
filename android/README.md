# Watermark Tap (Android)

**Owners:**
- **Prashant:** card logic in packages `nfc/`, `emv/`, `session/`, `crypto/`, `net/`, `policy/`.
- **Samanve:** Compose screens in package `ui/`.
- **Shared:** `TapUiState.kt` (change by agreement).

Spec sections G and M; interfaces F1, F2, F3, F8.

## Create the project (Android Studio)
New Project → *Empty Activity* (Compose), with these settings:

| Setting | Value |
|---|---|
| Location | this `android/` folder |
| Package | `com.watermark.tap` |
| Language | Kotlin |
| Build config | Kotlin DSL |
| Min SDK | 26 |

Android Studio generates the Gradle wrapper. Commit `gradlew`, `gradlew.bat` and `gradle/wrapper/*`.

## Requirements
- **Manifest:**
  - permission `android.permission.NFC`, `<uses-feature android:name="android.hardware.nfc" android:required="true"/>`, `INTERNET`
  - `android:allowBackup="false"`
  - an intent filter for scheme `watermark`, host `verify`
  - a network security config that allows cleartext only for the LAN prover host
- **Screens:** `FLAG_SECURE` on the tap screen, except in the `demo` build used for screen mirroring.
- **Card reading:** NFC reader mode (NFC-A/B, skip NDEF), `IsoDep` timeout 5000 ms.
- **Card data:** never written to disk, logs, clipboard or analytics. The card number and BIN are never shown on screen.
- **UI design:** screens get `@Preview`s with fake `TapUiState` values, so they can be designed on a Mac without a phone.
