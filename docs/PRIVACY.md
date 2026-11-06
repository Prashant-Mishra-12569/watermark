# Privacy

The card doesn't encrypt anything. The chip signs our challenge with a private key that never leaves it, and its
certificates are readable over NFC. Privacy comes from the ZK proof and from the encryption we add on the phone.

## What leaks and what doesn't

| Data | Who can see it | Permanent? |
|---|---|---|
| Chip's private key | Nobody | Never leaves the chip |
| Card number, BIN, card key, certificates | Phone and prover only | No. In memory or on a RAM disk, then wiped. Users must trust the wipe; we can't prove it |
| Card data on the network | Ciphertext only | Readable only with the prover's key, so a leaked key exposes captured traffic. Rotated after the event |
| Card data through a tunnel (e.g. a Cloudflare quick tunnel to the prover) | The tunnel sees the HTTPS traffic, but the card data inside is still encrypted on the phone to the prover's key, so it sees only ciphertext, the session (wallet, app ID) and the IP | No. On stage we skip the tunnel and use a local hotspot |
| Card expiry | Phone and prover only | No. On-chain we show only the "valid until" month |
| Wallet, app ID, nullifier, stamp expiry, proof | Everyone | Yes, on-chain |
| The app's filter (rules root and its public list) | Everyone | Yes. A stamp in an SBI-only app shows the wallet passed that filter |
| USDT payments | Everyone | Yes, on-chain |
| IP address and timing | Relayer and prover | Only if logged, so request logs are off in demo mode |

## Rules every part follows

- Never log request bodies, card fields, witnesses or private proof inputs.
- No analytics, trackers or crash reporting anywhere in the flow.
- One wallet per app. Using one wallet in two apps links them, even though the nullifiers differ.
- Warn before narrow filters. The narrower the filter, the more a stamp reveals, so the app and the MCP show this
  before a tap or before a policy goes live.
- Real ZK proofs only. We test that proofs are made in zero-knowledge mode.

## Limits we state openly

| Limit | Plain explanation |
|---|---|
| The prover sees card data | Our prover sees it briefly. On-device proving is the real fix, and it's on the roadmap. Anyone can self-host the prover |
| One card, not one person | A person with three cards can get three stamps. A reissued card has a new key, so it gets a new stamp |
| Possession only | A contactless tap has no PIN, so a stolen or borrowed card also works |
| The nullifier isn't fully secret | Anyone who has read the card and knows the appId can compute it and link the card to the wallet |
| Lost wallet | A stamp can't move to a new wallet in the same app yet |
| 32-bit challenge | The chip's challenge is only 4 bytes, so sessions are rate-limited and the relayer chooses the nonce |
| Trust in the relayer | The app's session signer could refuse a user or open too many sessions. It can't stamp without a real card |
| Bought cards | Prepaid cards (gift, metro, payroll) can be bought over the counter, so the live filter leaves them out, along with card ranges of unknown type. A rented or stolen real bank card still passes |
| A real launch | Needs PCI and legal review, network and bank terms, and a licensed BIN source. This build is testnet only |

A stamp means: *this wallet was linked to a real bank card that passed this app's filter.* It does **not** mean one
unique person, KYC, age or balance.
