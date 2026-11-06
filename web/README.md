# web

**Owner: Samanway.** Spec section N; interfaces F1, F6, F7.

Next.js 16 (App Router, `src/`, `@/*` alias), React 19, Tailwind v4, `qrcode.react`, `viem` and `@watermark/sdk`.
The app was written by hand rather than with `create-next-app`, so there is no boilerplate (no Geist/Google Fonts,
no SVGs, no favicons). wagmi, react-query and ESLint are left out for now: the silent-wallet `/verify` doesn't need
them. Add wagmi when the optional "Connect MetaMask" (spec N, advanced) or a later page needs it.

## Run
```sh
corepack pnpm install                                # from the repo root
corepack pnpm --filter @watermark/web exec next telemetry disable   # required, once per machine (see below)
corepack pnpm --filter @watermark/relayer dev        # relayer on :8788 (see relayer/README.md)
corepack pnpm --filter @watermark/web dev            # website on http://localhost:3000
```
Next.js CLI telemetry is **on by default** and sends anonymous usage events from `dev` and `build` to
telemetry.nextjs.org. Run the `telemetry disable` line once on every machine (or set `NEXT_TELEMETRY_DISABLED=1`);
`exec next telemetry status` should print `Disabled`. The page itself never sends telemetry.

`dev` listens on localhost only. `start` listens on every interface (for the phone fallback below).
Other scripts: `build`, `start` (port 3000), `typecheck` (`next typegen && tsc --noEmit`, works without `.next/` or
`next-env.d.ts`), `test` (`node --test` on `src/**/*.test.ts`, no servers or network needed).

## Environment
The website reads the **repo-root `.env`** (copied from `.env.example`), so one file serves every package. It takes
**only the `NEXT_PUBLIC_*` values** from that file: the root's private keys never enter the web server's process
(`next.config.ts`). Real environment variables win over the file. `NEXT_PUBLIC_*` values reach the browser, and they
are fixed when `dev` starts or at `build` time, so restart after changing them. Never put secrets in a `NEXT_PUBLIC_*` variable.

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_RELAYER_URL` | `http://localhost:8788` | Relayer the browser calls directly (never proxied: the relayer rate-limits per IP) |
| `NEXT_PUBLIC_APP_ID` | none (required) | appId to request sessions for. Decimal string, must be in the relayer's `APP_IDS`. Dev value `12345`; a fresh one per demo run |
| `NEXT_PUBLIC_CHAIN_ID` | `1874` | `1874` Whitechain Sepolia or `1337` alt mempool devnet |
| `NEXT_PUBLIC_RELAYER_LAN_URL` | unset | Only when set, `/verify` offers a "short QR" toggle (`watermark://verify?id=…&p=…`). Watermark Tap doesn't support short links yet. Must be a URL the app can read, like `http://192.168.1.2:8788` (no `_` in the host) |
| `NEXT_PUBLIC_DEMO_SHOP` | unset | `/pay` recipient (the demo shop's address). Unset: `/pay` shows a recipient field |
| `NEXT_PUBLIC_PAY_MAX_USDT` | `5` | Largest amount `/pay` offers. Keep it equal to the relayer's `PAY_MAX_USDT` |

Without `NEXT_PUBLIC_APP_ID`, `/verify` shows a "this page isn't set up yet" message instead of a QR.

Query parameters on `/verify` (kept stable for the SDK's `verifyLink` and the MCP tool): `?app=<appId>` overrides
`NEXT_PUBLIC_APP_ID`; `?chain=1337` is the hidden switch for the EF devnet tap. A future `?wallet=` may stamp a given
address instead of the browser wallet.

The relayer must list every origin the site is served from in `CORS_ORIGINS` (exact match: `localhost` and
`127.0.0.1` are different origins).

## Pages
| Route | Job | Status |
|---|---|---|
| `/` | Pitch: "Bots can't hold plastic." Buttons to `/verify` and `/pay` | ✅ built |
| `/verify` | Silent browser wallet → `POST /session` → big QR + `watermark://` link + the wallet's last 4 chars → poll `/status` → "Verified ✓" + explorer link | ✅ built; "Verified ✓" needs the deployed registry |
| `/pay` | Same wallet as `/verify` → stamp (`/status`), USDT balance and quota (`/balance`) → optional "Get demo USDT (from the business)" (`POST /fund`) → amount + recipient, signed in the background (EIP-3009) → `POST /pay` → "Paid ✓", explorer link, "Gas paid by the relayer, not you" | ✅ built; needs the relayer's `/pay`, `/fund`, `/balance` and `SPONSOR_ADDRESS` |
| `/attack` | "Start bot attack": live counters (requests, refused, budget left), protection toggle, "estimated" label when it's off | not built |
| `/sponsor` | App rules, TEST/LIVE badge, rules root, what a stamp reveals, budget and quota | not built |
| `/dev` | Integration: contract call, SDK snippet, MCP config | not built |

### How `/pay` behaves
- **Wallet:** the `/verify` burner for this appId (same `localStorage` key; `?app=` picks the same one). Whitechain only.
- **Signature:** EIP-3009 `TransferWithAuthorization` on the USDT domain {"Tether USD", "1", 1874, USDT proxy}, built in
  `src/lib/usdt.ts` (kept in sync with `relayer/src/usdt.ts`; both pin the domain separator). Random bytes32 nonce,
  `validAfter` 0, `validBefore` now + 15 min. Signing is local: no popup, no gas, no network switch.
- **Errors:** every `/pay` refusal reason has its own plain-language message (`payErrorCopy`). After a timeout or a
  network error the page re-reads the balance, because the payment may still have gone through.
- **Checked against the real token:** a signature from `src/lib/pay.ts` passes `transferWithAuthorization` on a local
  fork of Whitechain Sepolia (a tampered one reverts with "invalid signature").

### How `/verify` behaves
- **Wallet:** a local private key (viem), one per appId, kept in `localStorage` under `watermark.burner.v1`. If storage
  is blocked it lives in memory and the page says a reload starts a new wallet. The key is never shown or logged.
  "Demo tools → Start over with a new wallet" replaces it after a confirmation (for the "same card, new wallet" beat).
- **Session:** one `POST /session` per page load, expiry or click (React StrictMode can't double it). The response is
  checked before any QR is shown: it must be for our wallet, app and chain, its link must pass every rule of Watermark
  Tap's parser (`VerifyLink.kt`, mirrored in `src/lib/tap-link.ts`), and the link must carry exactly the returned
  session and signature. A relayer started with a bad `PROVER_URL` (e.g. `192.168.1.2:8787` without `http://`) gives
  a "didn't match" message instead of a QR the app would refuse. The QR encodes the relayer's `qr` string byte for
  byte (level L, 4-module quiet zone, black on white in both themes).
- **Refresh:** a new session is fetched 2 minutes before expiry (so a QR on screen always leaves time to tap and
  prove), or with "New QR code". Timing runs on this device's clock from when the session arrived, never sooner than
  30 s apart, so a wrong computer clock can't make the page loop; the page then says the clock looks wrong.
- **Wallet ending:** `session.wallet.slice(-4)`, case-sensitive, the same 4 characters Watermark Tap shows.
- **Status:** `GET /status` one request at a time, every 3 s (backing off to 10 s on errors), paused while the tab
  is hidden, stopped once stamped. "Verified ✓" appears only when the relayer reads `stamped: true` from the chain.
  If the wallet is already stamped on load, the page goes straight to Verified without a new session.
- **Errors:** relayer unreachable, `RATE_LIMIT` (waits 61 s before retrying), `BUSY`, `CHAIN_NOT_READY`,
  `UNKNOWN_APP` and bad responses each get a plain message; there is never a QR without a valid session. `/status`
  errors (`502 CHAIN_UNAVAILABLE`, `503`, network) only show a calm note and the QR keeps working.
- **Explorer:** links to the wallet's address page and the registry's page (its `Stamped` events) on the chain's
  explorer from `@watermark/sdk`. `/status` has no txHash, so a link to the exact stamp transaction needs an F6 change.

## QR → phone test (milestone: "the laptop QR opens the app on the phone")
1. Find the Mac's LAN IP (the hotspot the phone joins): `ipconfig getifaddr en0`.
2. Start the relayer with the **dev session signer**, the key the debug Tap app trusts
   (`android/gradle.properties` → `watermark.sessionSigner`, Anvil account #0). Its key is
   `DEV_SESSION_SIGNER_KEY` in `sdk/src/dev.ts`. It is **public and debug-only**: anyone can sign with it. Never use
   it for a real deployment; the demo build gets the relayer's own `SESSION_SIGNER_ADDRESS`.
   ```sh
   cd relayer
   SESSION_SIGNER_KEY=<DEV_SESSION_SIGNER_KEY from sdk/src/dev.ts> \
   PROVER_URL=http://<mac-lan-ip>:8787 APP_IDS=12345 \
   REGISTRY_ADDRESS=0x0000000000000000000000000000000000000001 \
   CORS_ORIGINS=http://localhost:3000 DEMO_MODE=false node src/index.ts
   ```
   `REGISTRY_ADDRESS` is a **placeholder until the registry is deployed** (like `sdk/scripts/test-link.ts`):
   sessions are signed, but `GET /status` answers `502 CHAIN_UNAVAILABLE`, so the page shows "Can't read the chain
   right now" and never turns Verified. That's expected.
   Make sure `PROVER_URL` starts with `http://` and the host has no `_`, or the page refuses the session.
3. `NEXT_PUBLIC_APP_ID=12345 corepack pnpm --filter @watermark/web dev`, open http://localhost:3000/verify.
4. Scan the QR with the Android phone's camera. Watermark Tap should open and show the same "Wallet ending XXXX".
5. Repeat with a real-length appId: a `registerApp` appId has about 75 digits, which adds about 70 characters to the
   link and makes the QR one version denser (version 14, 81 modules with the quiet zone, instead of version 13 with
   `12345`). Start the relayer with `APP_IDS=<75-digit id>`, open `/verify?app=<same id>`, and check the scan at 150%
   zoom from 30 cm. **Not yet tested on a phone.**

**Opening `/verify` on the phone itself** (fallback when the camera won't open the link): set
`NEXT_PUBLIC_RELAYER_URL=http://<mac-lan-ip>:8788`, add `http://<mac-lan-ip>:3000` to the relayer's `CORS_ORIGINS`,
and serve with `build` + `start` (the dev server limits cross-origin dev resources). Then tap "Open in Watermark Tap".
The Copy button only appears on secure origins (localhost), not on `http://192.168.x.x`.

**Rules:**
- No trackers or analytics. No third-party requests from the page: system fonts only, the QR is rendered locally,
  and the only network calls go to the relayer. Explorer URLs are plain links.
- The payer never sees gas, seed phrases or a chain picker.
- Import chains from `@watermark/sdk` (never viem's `whitechainTestnet`).
- Never log request or response bodies, sessions, signatures or keys. Never import `sdk/src/dev.ts` in web.
- On stage: 150% zoom, QR scannable from 30 cm. At 150% on a 13-inch MacBook (about 960×520 CSS px) the QR,
  the wallet ending and the status fit side by side without scrolling.
