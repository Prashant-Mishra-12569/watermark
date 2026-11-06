# Watermark design v2 (read before touching any page)

Reference: https://dopepay.me (screenshots: /private/tmp/claude-501/-Users-samanwaybaranwal-Desktop-watermark/55cc012f-6cb8-4b0e-9ef7-5057554d67ea/scratchpad/ref-dopepay/desktop-full.png and mobile.png; open them with your Read tool).
Evidence-based design playbook (may appear while you work; read it if it exists):
/private/tmp/claude-501/-Users-samanwaybaranwal-Desktop-watermark/55cc012f-6cb8-4b0e-9ef7-5057554d67ea/scratchpad/design-playbook.md

The team called v1 "AI slop" (navy ink band, sky-blue waves, generic SaaS, technical English). v2 throws that look away.
Keep every page's LOGIC, states, endpoints and tests. Change the look and the words.

## Look

- **Clean white page.** `--bg #FFFFFF`, cards `--surface #F5F5F3`, text `--ink #0A0A0A`, secondary text `--muted #6B6B6B`,
  hairlines `--line #EAEAEA`. Huge whitespace. Big rounded containers (radius 28px; small chips 999px).
- **One dark card per page at most** (`--night #0B0B0B`, white text): the bot test / proof "transparency" moment, like
  dopepay's "100% transparent" card.
- **Playful accents, small doses only** (logo, chips, the stamp seal, tiny highlights, never big fills or gradients):
  saffron `#FF6B1A`, leaf `#16A34A`, pink `#FF4FA0`, sun `#FFC233`. Status: ok = leaf, refused/error = `#E5484D`.
  BANNED: blue/purple gradients, glow, glassmorphism, waves, navy bands, sky blue.
- **Type:** Geist for everything (headings 600–700, tracking −0.03em, tight leading), plus ONE italic word per headline in
  Instrument Serif (`<em>`), exactly like "*Global* account to spend like a local." Geist Mono only for hashes, addresses
  and code. Load all three with `next/font/google` (self-hosted at build; CSP stays strict). Hero H1 ~ clamp(44px, 7vw, 88px).
- **Buttons:** primary = black pill with white text and a white circle holding an ↗ arrow (dopepay's "Get The App ↗").
  Secondary = white pill, 1px `--line` border. Disabled = 40% opacity. Min height 48px, big tap targets.
- **Floating chips:** small white pills with a soft shadow, an icon dot and short text ("✓ Wallet stamped",
  "Paid · $0 fee", "✕ Bot refused") floating around hero objects, like dopepay's "Sent $350".
- **Real objects, not abstractions:** a tilted glossy bank card (CSS/SVG: chip, RuPay-style corner, a round saffron
  "stamp" seal), the Genesis Pass as a collectible card, a phone, receipts. No stock photos, no external images.
- **Layout rhythm:** centered hero; then sections that alternate left/right ("Send money *worldwide*." left,
  "Receive *globally*." right). One idea per section. Short headline + one line + one object.
- **Logo:** lowercase "watermark" in Geist Bold + a mark: a small black rounded card with a saffron round seal in the
  corner (works at 16px). Inline SVG.
- **Motion (purposeful, small):** the hero card floats gently; the stamp seal lands (scale + rotate) on success; bot
  rows flip to "Refused" one by one; counters tick. Everything off under `prefers-reduced-motion`.
- Mobile first: perfect at 390px, no sideways scroll, hashes truncated (`0xd7e0…bc07`), code blocks scroll inside.

Honesty rule from research: our prover briefly sees the card data in memory, then wipes it. Never write "never leaves your phone", "never shared" or "we can't see it". Say "never stored" and "never on-chain".

## Words (8th-grade English; use these lines exactly; write any other microcopy in the same voice)

Rules: max ~12 words per sentence. Verbs first. Say **"fee"**, never "gas", on user pages. Say **"test USDT"**, never
"free money". Never write anything that could read as "100 per card": always **"Only 100 will ever exist. Each bank card
can claim one."** No jargon (nullifier, relayer, EIP-xxxx, UltraHonk, calldata) outside /dev and "Details" disclosures.
Status chips: "Live", "Testnet", "Coming soon", "Not live yet". Never claim "real person": we prove a real **bank card**.

### Landing
- Eyebrow chip: "Live on testnet · ETHGlobal Mumbai"
- H1: "Bots can't hold a *bank card*."
- Sub: "Tap your card once. Your wallet gets a stamp bots can't fake. Your card number never goes on-chain. You never pay a fee."
- Buttons: "Claim your free pass ↗" (PASS_LIVE) or "Stamp your wallet ↗"; secondary "For builders"
- Hero chips: "✓ Wallet stamped" · "Paid · $0 fee" · "✕ Bot refused"
- How it works, H2: "Three steps. *Two* minutes."
  1. "Tap your card": "Hold your RuPay card on our phone for 2 seconds."
  2. "Get your stamp": "A private proof checks your card is real. We never store your card number or put it on-chain."
  3. "Use it": "Claim the pass, pay with no fees, and get into apps that keep bots out."
- Pass, H2: "The *Genesis* Pass." Body: "Only 100 will ever exist. Each bank card can claim one." Counter: "{N} left".
  Line: "Tap your card → send one free test payment → claim."
- Unlocks, H2: "What your stamp *unlocks*."
  - "Genesis Pass": "Free. Only 100 will ever exist. One per bank card."
  - "Payments with no fee": "Pay a shop in test USDT. You just sign. We pay the network fee."
  - "Apps that pay your fees": "On an Ethereum test network, apps cover fees for stamped wallets only."
- Bot test (the dark card), H2: "Watch bots *try*." Body: "Making a wallet is free. Getting a bank card is not. Press the
  button. 5 new wallets with no card ask for test USDT, a free payment and the pass." Button: "Run the bot test ↗".
  Labelled example: "Example run: 15 tries · 15 refused · $0 spent".
- Proof, H2: "See it *yourself*." Body: "Every step leaves a public record. Tap any one to check it."
  Rows: "A real card stamped a wallet" · "A wallet paid 1 USDT with $0 in fees" · "Ethereum test network: an app paid the
  fee for a stamped wallet".
- Builders, H2: "Add it to your app in *one line*." Body: "Let only stamped wallets in. Use Solidity, our SDK, or let your
  AI agent check wallets for you." Chips: "12 tools for AI agents" · "Read-only" · "No keys needed".
- Limits, H2: "Good to *know*."
  - "Only RuPay cards from India work today. Visa and Mastercard are coming."
  - "This runs on test networks. No real money moves."
  - "One card gets one stamp per app. Two cards can make two stamps."
  - "We never store your card number."
- Footer: "Built at ETHGlobal Mumbai 2026 · Test networks only · No trackers"

### /verify
- H1: "Stamp your *wallet*."
- Wallet choice: "Where should we keep your stamp?" · "In this browser": "Easiest. Nothing to install." · "My wallet":
  "MetaMask or similar. You only share your address."
- QR: "Scan this with the Watermark phone." Steps: "The phone scans this code." · "Check the phone shows your wallet
  ending {last4}." · "Hold your card on the back of the phone."
- Waiting: "Waiting for your tap… It takes about 10 seconds after you tap."
- Success: "You're *stamped*." "Valid until {date}." Receipt: "You: tapped a card, signed nothing, paid $0." ·
  "Us: put it on-chain and paid the fee."
- Help: "Tapped but nothing happened?" "Only RuPay cards work today. If this card already stamped another wallet, use that
  wallet. If the phone lost internet, tap again."

### /pay
- H1: "Pay a shop. *Zero* fees." Sub: "You just sign. We pay the network fee."
- "Get 2 test USDT" · "Pay {amount} USDT" · Signing: "Check your wallet and sign. There's no fee to pay."
- Success: "*Paid.*" Receipt: "You signed for {amount} USDT. You paid $0." · "We sent it and paid the fee." ·
  "The shop got {amount} USDT." · "See it on the explorer ↗"
- Not stamped: "This wallet has no stamp yet. Stamp it first. It takes 2 minutes."

### /pass
- H1: "Genesis *Pass*." Sub: "Only 100 will ever exist. Each bank card can claim one."
- Steps: "Tap your card" · "Send one free test payment" · "Claim your pass"
- "Claim my pass. It's free." · Claiming: "Minting your pass… about 10 seconds. You sign nothing. We pay the fee."
- Success: "Pass #{N} is *yours*." · Already: "This wallet already has pass #{N}." · Sold out: "All 100 passes are gone.
  You can still stamp and pay." · Not deployed: "The pass isn't live yet. You can stamp and pay now."

### /attack
- H1: "Bot army vs. *Watermark*."
- Sub: "Making wallets is free, so bots make thousands. Press the button. We make 5 wallets with no card. Each asks for
  test USDT, a free payment and the pass. These are real requests. Nothing here is faked."
- "Launch 5 bots ↗" · Doors: "Test USDT" · "Free payment" · "Genesis Pass"
- States: "Refused: no stamp" · "Slowed down: too many tries (a second guard)" · "Got through. That's a bug." ·
  "Can't reach our server"
- Summary: "{r} of {t} tries refused. $0 moved. $0 in fees."
- Contrast: "A wallet with a real card gets through. See the payment ↗"
- Why: "Every free thing checks for a stamp first. No card, no stamp, no entry."

### /sponsor (nav label "For businesses")
- H1: "Who gets *in*, decided in public." Sub: "A business picks which cards count. Anyone can check the list."
- "Accepted: 4,208 RuPay bank debit card ranges from India." · "Left out: prepaid cards, because anyone can buy many." ·
  "Free payments: 20 per wallet per day, set in a contract." · "Stamps last up to 3 months." ·
  "The business pays the network fees. Users pay nothing."

### /dev (nav label "For builders")
- H1: "Keep bots out in *one line*." Sub: "Check a stamp from Solidity, TypeScript or your AI agent. No API key."
- Checker: "Is this wallet stamped?" · placeholder "Paste a wallet address (0x…)" · "Stamped until {date}. Your app would
  let it in." · "No stamp. Your app would keep it out." · "Couldn't reach our server. Nothing was checked."

## Nav
Logo · "Genesis Pass" · "Bot test" · "For businesses" · "For builders" · black pill "Stamp your wallet ↗".
Mobile: logo + pill on one row, the rest in a simple menu.
