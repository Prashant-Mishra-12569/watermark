# Landing v3: real-world assets + scroll motion (dopepay-level)

Read DESIGN_V2.md first (tokens, fonts, buttons, the exact copy). This file adds what makes dopepay.me great: REAL
imagery and SCROLL-DRIVEN motion. Reference screenshots: scratchpad/ref-dopepay/*.png.

Assets (free licences, credits in each folder's CREDITS.md):
- `web/public/assets/3d/*.png`: glossy 3D objects with transparent backgrounds (card, phone, robot, coins, ticket,
  shopping bags, bowl, globe, lock, key, check, cross, receipt...).
- `web/public/assets/photos/*.jpg`: real photos (hero people with phone, hand tapping a card, Indian street, builder,
  friends, two portraits, rubber stamp, Mumbai).
- `web/public/assets/screens/*.png`: real screenshots of OUR app at phone size (captured from :3200).
Use `next/image` (or plain <img> with width/height) from /assets/...; CSP allows img-src 'self'.
Always set meaningful `alt` text (or alt="" for pure decoration). Lazy-load everything below the hero.

Motion rules: CSS scroll-driven animations (`animation-timeline: view()` / `scroll()`), wrapped in
`@supports (animation-timeline: view())` so other browsers get a clean static layout, OR the tiny hook
`web/src/lib/use-scroll-progress.ts` (returns 0..1 for an element's trip through the viewport). No libraries.
No scrolljacking: the page always scrolls normally. Everything still under `prefers-reduced-motion: reduce`.
Transform and opacity only (60 fps). Keep total landing JS small.

Honesty rules: stock photos are illustrations. Never put a fake name, fake testimonial or fake amount on a photo
(no "Grace sent $350"). Chips on photos say what Watermark does ("✓ Wallet stamped", "Paid · $0 fee"). No fake press.
Example numbers are labelled "example". Real numbers come from the relayer or deployments/*.json.

## OUR story, not dopepay's (read this twice)

We copy dopepay's CRAFT (real imagery, scroll motion, polish), NOT its content. Their page sells spending money abroad.
Ours tells one story: **"Bots farm every airdrop, free mint and perk. Watermark lets apps reward real cardholders only."**
Every image and motion must serve that story: bots vs people, the card tap, the stamp, the proof, the perks, privacy,
builders. NO shopping bags, food, travel, globes of money, currency notes, or lifestyle filler.

**Brand idea (signature moment):** a watermark is the hidden mark on a banknote that proves it is real when you hold it to
the light. Watermark does that for a wallet. As you scroll into section 3, a light sweeps across a wallet card and a
hidden watermark seal (our logo mark, embossed/translucent) appears in it. Build it ourselves in CSS/SVG (no photos of
real currency).

## Sections (top to bottom)

1. **Hero.** H1 "Bots can't hold a *bank card*." + sub + pills (DESIGN_V2 copy). Below: a BIG rounded photo card of the
   core act, a hand tapping a card on a phone (assets/photos/tap* or hero*), with FloatChips "✓ Wallet stamped",
   "$0 fee", "Card number never on-chain". The photo scales 0.94 → 1 on scroll. File `_landing/hero.tsx`.
2. **The problem, lit up word by word on scroll.** "Airdrops, free mints and perks get farmed. One script makes 1,000
   wallets in a minute. Real people get left out." Under it, a field of small wallet icons that MULTIPLIES as you
   scroll (1 → 10 → 100 → 1,000 dots, grey), with the caption "Wallets are free to make." File `_landing/problem.tsx`.
3. **The watermark reveal (signature moment).** Headline: "Hold it to the *light*." Line: "A watermark proves a
   banknote is real. Ours proves a real bank card is behind a wallet." A wallet card in the center; a light band sweeps
   across it on scroll and the watermark seal fades in, embossed. Then a chip "✓ Stamped". File `_landing/reveal.tsx`.
4. **How it works, with real objects.** "Three steps. *Two* minutes." Step 1 photo of the tap (or the 3D phone + 3D
   card), step 2 the private proof (a lock + check 3D object), step 3 the stamp seal landing on the wallet. Objects
   drift at different scroll speeds. Copy: DESIGN_V2 steps. File `_landing/how.tsx`.
5. **Bots get refused.** "Bots get *refused*." The 3D robot turning slowly with scroll, red "✕ Refused" tags
   orbiting it on a tilted ring. Line: "Every free thing checks for a stamp first. No card, no stamp, no entry."
   Pill "Run the bot test ↗" → /attack. File `_landing/bots-orbit.tsx`.
6. **What a stamp unlocks.** "Stamped wallets get *perks*." The Genesis Pass collectible (PassArt) with "Only 100 will
   ever exist. Each bank card can claim one." + live "{N} left"; "Payments with no fee" (3D coin); "Apps that pay your
   fees" (3D rocket or key). File `_landing/perks.tsx`.
7. **Phone story (dark).** "See every *step*." A sticky CSS phone plays OUR real screens as you scroll (assets/screens:
   stamp QR → stamped → pay → paid), with the matching real tx receipt appearing beside each step.
   File `_landing/phone-story.tsx`.
8. **Privacy, honestly.** "What we *see*." Three columns: "Briefly, in memory: your card data, to make the proof, then
   wiped." · "Stored: nothing from your card." · "On-chain: a proof, a one-way card ID, your wallet, an expiry month."
   File `_landing/privacy.tsx`.
9. **For apps and builders.** "Reward *real* cardholders." Line: "Gate your airdrop, mint or perk with one line. Your
   AI agent can check a list of wallets too." The v2 code + MCP block. Business line: "You pick which cards count. You
   pay the fees, your users pay nothing." Links /sponsor and /dev. (Reuse the existing mcp-block.)
10. **Receipts ring.** "See it *yourself*." A 3D ring of REAL receipt cards turning right-to-left with scroll (stamp
    tx, payment tx, EF fee-sponsored tx, Sponsor verified, Registry verified, 12 MCP tools). Links from
    lib/evidence.ts. File `_landing/receipts-ring.tsx`.
11. **Made in Mumbai.** A wide Mumbai photo with "Built in *Mumbai* at ETHGlobal 2026" and "Good to know" limits
    (DESIGN_V2) below it. File `_landing/mumbai.tsx`.
12. **3D footer.** A huge "watermark" wordmark in perspective that tilts up as it scrolls in, with the watermark seal
    glowing faintly through it like a banknote, then links and "Built at ETHGlobal Mumbai 2026 · Test networks only ·
    No trackers". File `web/src/app/_site/footer-3d.tsx`, used on the landing only.

## Asset picks (files in web/public/assets; see CREDITS.md in each folder)
- Hero: `photos/tap-card-phone.jpg` (hand holding a card by a phone, number unreadable). Fallback `photos/portrait-b.jpg`.
- Problem: draw the wallet dots in CSS/SVG; `3d/3dicons-wallet.png` (500px) as the "one wallet" at the start.
- Reveal: draw the wallet card + watermark seal in CSS/SVG (no currency photos).
- How it works: `3d/mobile-phone.png`, `3d/credit-card.png`, `3d/locked.png` or `3d/3dicons-lock.png`, `3d/check-mark-button.png`.
- Bots: `3d/robot.png` (256px: show it at <= 220px, or scale with care), `3d/cross-mark.png`, `3d/eyes.png`.
- Perks: PassArt + `3d/admission-tickets.png`, `3d/party-popper.png`, `3d/3dicons-3d-coin.png`, `3d/key.png`.
- Privacy: `3d/3dicons-lock.png`.
- Builders: `photos/builder-team-table.jpg`, `3d/rocket.png`.
- People band (if used inside another section): `photos/portrait-a.jpg`, `photos/portrait-b.jpg`, `photos/friends-selfie.jpg`.
- Mumbai: `photos/city-mumbai-sea-link.jpg` (wide), optional small `photos/street-mumbai-vada-pav.jpg` tile.
- Receipts ring: `3d/receipt.png` accent.
- DO NOT USE: shopping-bags, steaming-bowl, dollar-banknote, money-with-wings, globe, bank, street-delhi (off-story).
- Fluent PNGs are 256px: never display above ~220px wide; use the 3dicons 500px files for big objects.
- Credit line in the footer: "Photos: Unsplash. 3D objects: Microsoft Fluent Emoji (MIT), 3dicons (CC0). Credits ↗"
  linking to a /credits page or the CREDITS.md files.
